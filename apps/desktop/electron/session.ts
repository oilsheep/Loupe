import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Adb } from './adb'
import type { Scrcpy } from './scrcpy'
import type { LogcatBuffer } from './logcat'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { Paths } from './paths'
import type { Session, Bug, BugSeverity } from '@shared/types'
import { captureScreenshot as defaultCapture } from './screenshot'
import { extractThumbnail, remuxForHtml5Playback, resolveBundledFfmpegPath } from './ffmpeg'
import { writeProjectFile } from './project-file'
import { ClickRecorder } from './click-recorder'
import { TelemetrySampler } from './telemetry'

export interface SessionDeps {
  db: Db
  paths: Paths
  adb: Adb
  scrcpy: Scrcpy
  logcat: LogcatBuffer
  runner: IProcessRunner
  captureScreenshot?: typeof defaultCapture
  capturePcThumbnail?: (sourceId: string, outPath: string) => Promise<void>
  prepareVideoForPlayback?: (inputPath: string) => Promise<void>
  clickRecorder?: Pick<ClickRecorder, 'start' | 'stop'>
  telemetrySampler?: Pick<TelemetrySampler, 'start' | 'stop'>
  onInterrupted?: (session: Session, reason: string) => void
  now?: () => number
  /** Generates IDs for individual bugs (random UUID by default). */
  newId?: () => string
  /** Generates the session id / on-disk folder name. Default = `<YYYY-MM-DD>_<HH-mm-ss>_<sanitized-build>`. */
  makeSessionId?: (buildVersion: string, nowMs: number) => string
}

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function scrcpyWindowTitle(model: string): string {
  return `Loupe - ${model}`
}

function isValidPngFile(filePath: string): boolean {
  if (!existsSync(filePath)) return false
  try {
    const header = readFileSync(filePath).subarray(0, PNG_SIGNATURE.length)
    return header.equals(PNG_SIGNATURE)
  } catch {
    return false
  }
}

function pcPlatformLabel(): string {
  if (process.platform === 'darwin') return 'macOS'
  if (process.platform === 'win32') return 'Windows'
  return process.platform
}

/**
 * Default session id generator. Returns e.g. `2026-04-29_14-30-45_1.4.2-RC3`.
 * Folder name is human-readable (date + build) so QA can find recordings without
 * looking up UUIDs. Empty build version falls back to `untitled`.
 */
export function makeSessionId(buildVersion: string, nowMs: number): string {
  const d = new Date(nowMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const timePart = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  const build = (buildVersion.trim() || 'untitled').replace(ILLEGAL_FILENAME_CHARS, '_')
  return `${datePart}_${timePart}_${build}`
}

export interface StartArgs {
  deviceId: string
  connectionMode: 'usb' | 'wifi' | 'pc'
  buildVersion: string
  testNote: string
  tester?: string
  recordPcScreen?: boolean
  pcCaptureSourceName?: string
}

export interface MarkBugArgs {
  severity?: BugSeverity
  note?: string
}

export interface AddMarkerArgs {
  sessionId: string
  offsetMs: number
  severity?: BugSeverity
  note?: string
}

export class SessionManager {
  private static readonly MARKER_LOGCAT_LINES = 5
  private active: Session | null = null
  private capture: typeof defaultCapture
  private prepareVideo: (inputPath: string) => Promise<void>
  private now: () => number
  private newId: () => string
  private makeSessionId: (buildVersion: string, nowMs: number) => string
  private clickRecorder: Pick<ClickRecorder, 'start' | 'stop'>
  private telemetrySampler: Pick<TelemetrySampler, 'start' | 'stop'>
  private capturePcThumbnail?: (sourceId: string, outPath: string) => Promise<void>
  private finalizing: Promise<Session> | null = null

  constructor(private deps: SessionDeps) {
    this.capture = deps.captureScreenshot ?? defaultCapture
    this.prepareVideo = deps.prepareVideoForPlayback ?? this.defaultPrepareVideoForPlayback.bind(this)
    this.now = deps.now ?? Date.now
    this.newId = deps.newId ?? randomUUID
    this.makeSessionId = deps.makeSessionId ?? makeSessionId
    this.clickRecorder = deps.clickRecorder ?? new ClickRecorder(deps.runner)
    this.telemetrySampler = deps.telemetrySampler ?? new TelemetrySampler()
    this.capturePcThumbnail = deps.capturePcThumbnail
  }

  activeSessionId(): string | null { return this.active?.id ?? null }

  async start(args: StartArgs): Promise<Session> {
    if (this.active) throw new Error('a session is already active')
    const { db, paths, adb, scrcpy, logcat } = this.deps
    const isPcSession = args.connectionMode === 'pc'
    const info = isPcSession
      ? { model: args.pcCaptureSourceName?.trim() || 'PC screen', androidVersion: pcPlatformLabel() }
      : await adb.getDeviceInfo(args.deviceId)
    const startedAt = this.now()
    const id = this.makeSessionId(args.buildVersion, startedAt)
    paths.ensureSessionDirs(id)
    const sess: Session = {
      id, buildVersion: args.buildVersion, testNote: args.testNote,
      tester: args.tester?.trim() ?? '',
      deviceId: args.deviceId, deviceModel: info.model, androidVersion: info.androidVersion,
      connectionMode: args.connectionMode, status: 'recording',
      durationMs: null, startedAt, endedAt: null,
      videoPath: isPcSession ? null : paths.videoFile(id),
      pcRecordingEnabled: isPcSession || Boolean(args.recordPcScreen),
      pcVideoPath: null,
    }
    db.insertSession(sess)
    this.persistProject(sess.id)
    if (!isPcSession) {
      const windowTitle = scrcpyWindowTitle(info.model)
      this.active = sess
      scrcpy.start({
        deviceId: args.deviceId,
        recordPath: paths.videoFile(id),
        windowTitle,
        onUnexpectedExit: (code) => {
          void this.finishActiveSession({
            stopRecorder: false,
            reason: `Android recording stopped${code === null ? '' : ` (code ${code})`}`,
            interrupted: true,
          }).catch((err) => {
            console.warn(`Loupe: failed to finalize interrupted session ${sess.id}`, err)
          })
        },
      })
      this.clickRecorder.start({ outputPath: paths.clicksFile(id), windowTitle })
      this.telemetrySampler.start({
        adb,
        deviceId: args.deviceId,
        sessionStartedAt: startedAt,
        outputPath: paths.telemetryFile(id),
      })
      logcat.start()
    } else {
      this.active = sess
    }
    return sess
  }

  async markBug(args: MarkBugArgs = {}): Promise<Bug> {
    if (!this.active) throw new Error('no active session')
    const { db, paths, scrcpy } = this.deps
    const sess = this.active
    const offsetMs = sess.connectionMode === 'pc'
      ? Math.max(0, this.now() - sess.startedAt)
      : scrcpy.elapsedMs() ?? 0
    const bugId = this.newId()

    const bug: Bug = {
      id: bugId, sessionId: sess.id, offsetMs,
      severity: args.severity ?? 'normal',
      note: args.note ?? '',
      screenshotRel: null,
      logcatRel: null,
      audioRel: null,
      audioDurationMs: null,
      createdAt: this.now(),
      preSec: 5, postSec: 5,
    }
    db.insertBug(bug)
    this.persistProject(sess.id)
    this.captureMarkerAssets(sess, bugId).catch((err) => {
      console.warn(`Loupe: failed to capture marker assets for ${bugId}`, err)
    })
    return bug
  }

  async stop(): Promise<Session> {
    if (!this.active) throw new Error('no active session')
    return this.finishActiveSession({ stopRecorder: true })
  }

  private async finishActiveSession(args: { stopRecorder: boolean; reason?: string; interrupted?: boolean }): Promise<Session> {
    if (this.finalizing) return this.finalizing
    if (!this.active) throw new Error('no active session')
    this.finalizing = this.finalizeActiveSession(args).finally(() => { this.finalizing = null })
    return this.finalizing
  }

  private async finalizeActiveSession(args: { stopRecorder: boolean; reason?: string; interrupted?: boolean }): Promise<Session> {
    const { db, paths, scrcpy, logcat } = this.deps
    const sess = this.active
    if (!sess) throw new Error('no active session')
    if (sess.connectionMode !== 'pc') {
      if (args.stopRecorder) {
        await scrcpy.stop().catch((err) => {
          console.warn(`Loupe: failed to stop scrcpy for session ${sess.id}; finalizing recorded data anyway`, err)
        })
      }
      this.clickRecorder.stop()
      this.telemetrySampler.stop()
      logcat.stop()
    }
    const endedAt = this.now()
    const durationMs = endedAt - sess.startedAt
    if (sess.connectionMode !== 'pc') {
      await this.prepareVideo(paths.videoFile(sess.id)).catch((err) => {
        console.warn(`Loupe: video remux failed for session ${sess.id}; keeping original recording`, err)
      })
    }
    db.finalizeSession(sess.id, { durationMs, endedAt })
    this.active = null
    const updated = db.getSession(sess.id)!
    await this.backfillMissingThumbnails(updated).catch((err) => {
      console.warn(`Loupe: failed to backfill thumbnails for session ${sess.id}`, err)
    })
    this.persistProject(sess.id)
    if (args.interrupted) this.deps.onInterrupted?.(updated, args.reason ?? 'Recording interrupted')
    return updated
  }

  async discard(sessionId: string): Promise<void> {
    if (this.active?.id === sessionId) {
      try { await this.deps.scrcpy.stop() } catch {}
      this.clickRecorder.stop()
      this.telemetrySampler.stop()
      this.deps.logcat.stop()
      this.active = null
    }
    rmSync(this.deps.paths.sessionDir(sessionId), { recursive: true, force: true })
    this.deps.db.deleteSession(sessionId)
  }

  // Pass-throughs used by IPC layer:
  listSessions() { return this.deps.db.listSessions() }
  getSession(id: string) { return this.deps.db.getSession(id) }
  listBugs(sessionId: string) { return this.deps.db.listBugs(sessionId) }
  async repairBrokenThumbnails(sessionId: string): Promise<void> {
    const { db, paths, runner } = this.deps
    const session = db.getSession(sessionId)
    if (!session || session.status === 'recording') return
    const inputPath = session.connectionMode === 'pc'
      ? session.pcVideoPath
      : session.videoPath ?? paths.videoFile(session.id)
    if (!inputPath) return

    for (const bug of db.listBugs(session.id)) {
      const screenshotPath = paths.screenshotFile(session.id, bug.id)
      const needsRepair = !bug.screenshotRel || !isValidPngFile(screenshotPath)
      if (!needsRepair) continue
      try {
        await extractThumbnail(runner, resolveBundledFfmpegPath(), {
          inputPath,
          outputPath: screenshotPath,
          offsetMs: bug.offsetMs,
        })
        db.updateBugAssets(bug.id, {
          screenshotRel: `screenshots/${bug.id}.png`,
          logcatRel: bug.logcatRel,
        })
      } catch (err) {
        console.warn(`Loupe: failed to repair thumbnail for marker ${bug.id}`, err)
      }
    }
    this.persistProject(session.id)
  }

  addMarker(args: AddMarkerArgs): Bug {
    const session = this.deps.db.getSession(args.sessionId)
    if (!session) throw new Error('session not found')
    const durationMs = session.durationMs ?? Math.max(0, args.offsetMs)
    const bug: Bug = {
      id: this.newId(),
      sessionId: session.id,
      offsetMs: Math.max(0, Math.min(durationMs, args.offsetMs)),
      severity: args.severity ?? 'normal',
      note: args.note ?? '',
      screenshotRel: null,
      logcatRel: null,
      audioRel: null,
      audioDurationMs: null,
      createdAt: this.now(),
      preSec: 5,
      postSec: 5,
    }
    this.deps.db.insertBug(bug)
    this.persistProject(session.id)
    return bug
  }
  updateSessionMetadata(id: string, patch: { buildVersion: string; testNote: string; tester: string }) {
    const session = this.deps.db.getSession(id)
    if (!session) throw new Error('session not found')
    this.deps.db.updateSessionMetadata(id, {
      buildVersion: patch.buildVersion.trim(),
      testNote: patch.testNote.trim(),
      tester: patch.tester.trim(),
    })
    this.persistProject(id)
  }
  savePcRecording(sessionId: string, bytes: Buffer): string {
    const session = this.deps.db.getSession(sessionId)
    if (!session) throw new Error('session not found')
    this.deps.paths.ensureSessionDirs(sessionId)
    const out = this.deps.paths.pcVideoFile(sessionId)
    writeFileSync(out, bytes)
    this.deps.db.updateSessionPcRecording(sessionId, { pcRecordingEnabled: true, pcVideoPath: out })
    this.persistProject(sessionId)
    return out
  }
  updateBug(id: string, patch: { note: string; severity: BugSeverity; preSec: number; postSec: number }) {
    this.deps.db.updateBug(id, patch)
    const session = this.deps.db.raw.prepare(`SELECT session_id FROM bugs WHERE id = ?`).get(id) as { session_id?: string } | undefined
    if (session?.session_id) this.persistProject(session.session_id)
  }
  saveBugAudio(sessionId: string, bugId: string, bytes: Buffer, durationMs: number): void {
    const bug = this.deps.db.listBugs(sessionId).find(b => b.id === bugId)
    if (!bug) throw new Error('bug not found')
    this.deps.paths.ensureSessionDirs(sessionId)
    writeFileSync(this.deps.paths.audioFile(sessionId, bugId), bytes)
    this.deps.db.updateBugAudio(bugId, {
      audioRel: `audio/${bugId}.webm`,
      audioDurationMs: Math.max(0, Math.round(durationMs)),
    })
    this.persistProject(sessionId)
  }
  deleteBug(id: string) {
    const session = this.deps.db.raw.prepare(`SELECT session_id FROM bugs WHERE id = ?`).get(id) as { session_id?: string } | undefined
    this.deps.db.deleteBug(id)
    if (session?.session_id) this.persistProject(session.session_id)
  }

  importProject(session: Session, bugs: Bug[]): void {
    this.deps.paths.ensureSessionDirs(session.id)
    this.deps.db.insertSession(session)
    this.deps.db.deleteBugsForSession(session.id)
    for (const bug of bugs) this.deps.db.insertBug(bug)
    this.persistProject(session.id)
  }

  persistProject(sessionId: string): void {
    const session = this.deps.db.getSession(sessionId)
    if (!session) return
    writeProjectFile(this.deps.paths.projectFile(sessionId), session, this.deps.db.listBugs(sessionId), this.now())
  }

  private async captureMarkerAssets(session: Session, bugId: string): Promise<void> {
    const { db, paths, logcat, runner } = this.deps
    const bug = db.listBugs(session.id).find(b => b.id === bugId)
    const screenshotPath = paths.screenshotFile(session.id, bugId)
    const logcatPath = paths.logcatFile(session.id, bugId)
    let logcatRel: string | null = null
    let screenshotRel: string | null = null

    if (session.connectionMode !== 'pc') {
      try {
        logcat.dumpRecentLinesToFile(logcatPath, SessionManager.MARKER_LOGCAT_LINES)
        logcatRel = `logcat/${bugId}.txt`
      } catch (err) {
        console.warn(`Loupe: failed to write logcat for marker ${bugId}`, err)
      }
    }

    try {
      if (session.connectionMode === 'pc' && this.capturePcThumbnail) {
        await this.capturePcThumbnail(session.deviceId, screenshotPath)
        screenshotRel = `screenshots/${bugId}.png`
      } else if (session.connectionMode !== 'pc' && this.capturePcThumbnail) {
        await this.capturePcThumbnail(scrcpyWindowTitle(session.deviceModel), screenshotPath)
        screenshotRel = `screenshots/${bugId}.png`
      } else if (session.connectionMode !== 'pc') {
        await this.capture(runner, session.deviceId, screenshotPath)
        screenshotRel = `screenshots/${bugId}.png`
      }
    } catch (err) {
      console.warn(`Loupe: failed to capture screenshot for marker ${bugId}`, err)
    }

    if (!screenshotRel && bug && session.status !== 'recording') {
      const inputPath = session.connectionMode === 'pc'
        ? session.pcVideoPath
        : session.videoPath ?? paths.videoFile(session.id)
      if (inputPath) {
        try {
          await extractThumbnail(runner, resolveBundledFfmpegPath(), {
            inputPath,
            outputPath: screenshotPath,
            offsetMs: bug.offsetMs,
          })
          screenshotRel = `screenshots/${bugId}.png`
        } catch (err) {
          console.warn(`Loupe: failed to extract video thumbnail for marker ${bugId}`, err)
        }
      }
    }

    db.updateBugAssets(bugId, { screenshotRel, logcatRel })
    this.persistProject(session.id)
  }

  private async backfillMissingThumbnails(session: Session): Promise<void> {
    const { db, paths, runner } = this.deps
    const inputPath = session.connectionMode === 'pc'
      ? session.pcVideoPath
      : session.videoPath ?? paths.videoFile(session.id)
    if (!inputPath) return

    for (const bug of db.listBugs(session.id)) {
      if (bug.screenshotRel) continue
      const screenshotPath = paths.screenshotFile(session.id, bug.id)
      try {
        await extractThumbnail(runner, resolveBundledFfmpegPath(), {
          inputPath,
          outputPath: screenshotPath,
          offsetMs: bug.offsetMs,
        })
        db.updateBugAssets(bug.id, {
          screenshotRel: `screenshots/${bug.id}.png`,
          logcatRel: bug.logcatRel,
        })
      } catch (err) {
        console.warn(`Loupe: failed to backfill thumbnail for marker ${bug.id}`, err)
      }
    }
  }

  private async defaultPrepareVideoForPlayback(inputPath: string): Promise<void> {
    const outputPath = `${inputPath}.faststart.mp4`
    const backupPath = `${inputPath}.raw.mp4`
    await remuxForHtml5Playback(this.deps.runner, resolveBundledFfmpegPath(), { inputPath, outputPath })
    rmSync(backupPath, { force: true })
    renameSync(inputPath, backupPath)
    try {
      renameSync(outputPath, inputPath)
      rmSync(backupPath, { force: true })
    } catch (err) {
      renameSync(backupPath, inputPath)
      throw err
    }
  }
}
