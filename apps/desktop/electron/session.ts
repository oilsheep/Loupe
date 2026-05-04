import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'
import type { Adb } from './adb'
import type { Scrcpy } from './scrcpy'
import type { LogcatBuffer } from './logcat'
import { IosSyslogBuffer, type IosSyslogStartOptions } from './ios-syslog'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { Paths } from './paths'
import type { Session, Bug, BugAnnotation, BugSeverity } from '@shared/types'
import { captureScreenshot as defaultCapture } from './screenshot'
import { assertVideoInputReadable, extractAudioTrack, extractThumbnail, probeMediaDurationMs, remuxForHtml5Playback, resolveBundledFfmpegPath } from './ffmpeg'
import { writeProjectFile } from './project-file'
import { ClickRecorder } from './click-recorder'
import { TelemetrySampler } from './telemetry'

export interface SessionDeps {
  db: Db
  paths: Paths
  adb: Adb
  scrcpy: Scrcpy
  logcat: LogcatBuffer
  iosSyslog?: Pick<IosSyslogBuffer, 'start' | 'stop' | 'dumpRecentLinesToFile'>
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
const DEFAULT_MARKER_LOGCAT_LINES = 50
const VIDEO_FINALIZE_RETRY_DELAYS_MS = [250, 500, 1000, 1500, 2000, 3000]

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

function sanitizeLogcatLineCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MARKER_LOGCAT_LINES
  return Math.max(10, Math.min(500, Math.round(value as number)))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}

function sanitizeAnnotationRect(input: Pick<BugAnnotation, 'x' | 'y' | 'width' | 'height'>): Pick<BugAnnotation, 'x' | 'y' | 'width' | 'height'> {
  const x = clamp01(input.x)
  const y = clamp01(input.y)
  const width = Math.max(0.001, Math.min(1 - x, Number.isFinite(input.width) ? input.width : 0.001))
  const height = Math.max(0.001, Math.min(1 - y, Number.isFinite(input.height) ? input.height : 0.001))
  return { x, y, width, height }
}

function sanitizeAnnotationKind(kind: BugAnnotation['kind'] | undefined): NonNullable<BugAnnotation['kind']> {
  return kind === 'ellipse' || kind === 'freehand' || kind === 'arrow' || kind === 'text' ? kind : 'rect'
}

function sanitizeAnnotationPoints(points: BugAnnotation['points'] | undefined): NonNullable<BugAnnotation['points']> {
  return Array.isArray(points)
    ? points
      .map(point => ({ x: clamp01(Number(point.x)), y: clamp01(Number(point.y)) }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
      .slice(0, 500)
    : []
}

interface AnnotationBugWindow {
  session_id: string
  offset_ms: number
  pre_sec: number
  post_sec: number
}

function clampAnnotationWindowForBug(row: AnnotationBugWindow, startMs: number, endMs: number): { startMs: number; endMs: number } | null {
  const clipStartMs = Math.max(0, Number(row.offset_ms) - Number(row.pre_sec) * 1000)
  const clipEndMs = Math.max(clipStartMs, Number(row.offset_ms) + Number(row.post_sec) * 1000)
  const nextStartMs = Math.max(clipStartMs, Math.floor(startMs))
  const nextEndMs = Math.min(clipEndMs, Math.ceil(endMs))
  if (nextEndMs <= nextStartMs) return null
  return { startMs: nextStartMs, endMs: nextEndMs }
}

function isIncompleteMp4Error(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /moov atom not found|Invalid data found when processing input|ffmpeg faststart failed|EBML header parsing failed/i.test(message)
}

function errorSummary(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/EBML header parsing failed|Invalid data found when processing input/i.test(message)) {
    return 'recording video is not readable; skipping thumbnail repair for this session'
  }
  const firstMeaningfulLine = message
    .split('\n')
    .map(line => line.trim())
    .find(line => line && !/^ffmpeg version|^built with|^configuration:|^lib\w+/i.test(line))
  return (firstMeaningfulLine ?? message).slice(0, 300)
}

async function waitForStableFile(filePath: string, quietMs = 300): Promise<void> {
  if (!existsSync(filePath)) return
  let previous = statSync(filePath).size
  await sleep(quietMs)
  for (let i = 0; i < 4; i++) {
    if (!existsSync(filePath)) return
    const current = statSync(filePath).size
    if (current === previous) return
    previous = current
    await sleep(quietMs)
  }
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
  platform?: string
  project?: string
  testNote: string
  tester?: string
  recordMic?: boolean
  recordSystemAudio?: boolean
  recordPcScreen?: boolean
  pcCaptureSourceName?: string
  logcatPackageName?: string
  logcatTagFilter?: string
  logcatMinPriority?: string
  logcatLineCount?: number
  iosLogCapture?: boolean
  iosLogBundleId?: string
  iosLogAppName?: string
  iosLogLaunchApp?: boolean
  iosLogFilter?: string
  iosLogMinLevel?: string
}

export interface ImportVideoArgs {
  inputPath: string
  audioPath?: string
  audioStartOffsetMs?: number
  buildVersion: string
  platform?: string
  project?: string
  testNote: string
  tester?: string
  analyzeAudio?: boolean
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
  source?: Bug['source']
  preSec?: number
  postSec?: number
}

export class SessionManager {
  private active: Session | null = null
  private activeLogcatLineCount = DEFAULT_MARKER_LOGCAT_LINES
  private capture: typeof defaultCapture
  private prepareVideo: (inputPath: string) => Promise<void>
  private now: () => number
  private newId: () => string
  private makeSessionId: (buildVersion: string, nowMs: number) => string
  private clickRecorder: Pick<ClickRecorder, 'start' | 'stop'>
  private telemetrySampler: Pick<TelemetrySampler, 'start' | 'stop'>
  private capturePcThumbnail?: (sourceId: string, outPath: string) => Promise<void>
  private iosSyslog: Pick<IosSyslogBuffer, 'start' | 'stop' | 'dumpRecentLinesToFile'>
  private activeIosLogCapture = false
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
    this.iosSyslog = deps.iosSyslog ?? new IosSyslogBuffer(deps.runner)
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
    this.activeLogcatLineCount = sanitizeLogcatLineCount(args.logcatLineCount)
    paths.ensureSessionDirs(id)
    const sess: Session = {
      id, buildVersion: args.buildVersion, testNote: args.testNote,
      platform: args.platform?.trim() ?? '',
      project: args.project?.trim() ?? '',
      tester: args.tester?.trim() ?? '',
      deviceId: args.deviceId, deviceModel: info.model, androidVersion: info.androidVersion,
      ramTotalGb: 'ramTotalGb' in info ? info.ramTotalGb ?? null : null,
      graphicsDevice: 'graphicsDevice' in info ? info.graphicsDevice ?? null : null,
      connectionMode: args.connectionMode, status: 'recording',
      durationMs: null, startedAt, endedAt: null,
      videoPath: isPcSession ? null : paths.videoFile(id),
      pcRecordingEnabled: isPcSession || Boolean(args.recordPcScreen),
      pcVideoPath: null,
      micAudioPath: null,
      micAudioDurationMs: null,
      micAudioStartOffsetMs: null,
      micRecordingRequested: Boolean(args.recordMic),
      systemAudioRecordingRequested: Boolean(args.recordSystemAudio),
    }
    db.insertSession(sess)
    this.persistProject(sess.id)
    this.activeIosLogCapture = false
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
      if (args.iosLogCapture) {
        try {
          const iosLogOptions: IosSyslogStartOptions = {
            bundleId: args.iosLogBundleId,
            ...(args.iosLogAppName ? { appName: args.iosLogAppName } : {}),
            launchApp: args.iosLogLaunchApp,
            textFilter: args.iosLogFilter,
            minLevel: args.iosLogMinLevel,
          }
          this.activeIosLogCapture = await this.iosSyslog.start(iosLogOptions)
        } catch (err) {
          if (args.iosLogLaunchApp && args.iosLogBundleId?.trim()) {
            this.iosSyslog.stop()
            this.activeIosLogCapture = false
            this.active = null
            throw err
          }
          console.warn('Loupe: iOS syslog capture is unavailable; continuing without iOS logs', err)
          this.activeIosLogCapture = false
        }
      }
    }
    return sess
  }

  async importVideo(args: ImportVideoArgs): Promise<Session> {
    if (this.active) throw new Error('a session is already active')
    const inputPath = args.inputPath.trim()
    if (!inputPath || !existsSync(inputPath)) throw new Error('video file not found')
    const { db, paths, runner } = this.deps
    const importedAt = this.now()
    const id = this.makeSessionId(args.buildVersion, importedAt)
    paths.ensureSessionDirs(id)

    const ffmpegPath = resolveBundledFfmpegPath()
    await assertVideoInputReadable(runner, ffmpegPath, { inputPath })
    const durationMs = await probeMediaDurationMs(runner, ffmpegPath, { inputPath })
    const sourceExt = extname(inputPath).toLowerCase()
    const outVideoPath = ['.mp4', '.m4v', '.mov'].includes(sourceExt)
      ? paths.videoFile(id)
      : join(paths.sessionDir(id), `imported-video${sourceExt || '.mp4'}`)
    const shouldRemuxToMp4 = ['.mp4', '.m4v', '.mov'].includes(sourceExt)
    if (inputPath !== outVideoPath && shouldRemuxToMp4) {
      try {
        await remuxForHtml5Playback(runner, ffmpegPath, { inputPath, outputPath: outVideoPath })
      } catch (err) {
        console.warn(`Loupe: imported video remux failed for ${id}; copying original video`, err)
        copyFileSync(inputPath, outVideoPath)
      }
    } else if (inputPath !== outVideoPath) {
      copyFileSync(inputPath, outVideoPath)
    }

    const audioInputPath = args.audioPath?.trim()
    if (audioInputPath && !existsSync(audioInputPath)) throw new Error('audio file not found')
    let micAudioPath: string | null = null
    let micAudioDurationMs: number | null = null
    let micAudioStartOffsetMs: number | null = null
    let micAudioSource: Session['micAudioSource'] = null
    if (audioInputPath || args.analyzeAudio) {
      const sourceAudioPath = audioInputPath || outVideoPath
      micAudioPath = paths.micAudioFile(id)
      await extractAudioTrack(runner, ffmpegPath, { inputPath: sourceAudioPath, outputPath: micAudioPath })
      micAudioDurationMs = audioInputPath
        ? await probeMediaDurationMs(runner, ffmpegPath, { inputPath: audioInputPath }).catch(() => durationMs)
        : durationMs
      micAudioStartOffsetMs = Math.round(args.audioStartOffsetMs ?? 0)
      micAudioSource = audioInputPath ? 'external' : 'video'
    }

    const session: Session = {
      id,
      buildVersion: args.buildVersion,
      platform: args.platform?.trim() ?? '',
      project: args.project?.trim() ?? '',
      testNote: args.testNote,
      tester: args.tester?.trim() ?? '',
      deviceId: `import:${id}`,
      deviceModel: 'Imported video',
      androidVersion: 'Video',
      ramTotalGb: null,
      graphicsDevice: null,
      connectionMode: 'pc',
      status: 'draft',
      durationMs,
      startedAt: importedAt,
      endedAt: importedAt + durationMs,
      videoPath: null,
      pcRecordingEnabled: true,
      pcVideoPath: outVideoPath,
      micAudioPath,
      micAudioDurationMs,
      micAudioStartOffsetMs,
      micAudioSource,
      micRecordingRequested: Boolean(args.analyzeAudio || audioInputPath),
    }
    db.insertSession(session)
    this.persistProject(session.id)
    return session
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
      mentionUserIds: [],
      source: 'manual',
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
    if (this.activeIosLogCapture) {
      this.iosSyslog.stop()
      this.activeIosLogCapture = false
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
      if (this.activeIosLogCapture) {
        this.iosSyslog.stop()
        this.activeIosLogCapture = false
      }
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
    try {
      await assertVideoInputReadable(runner, resolveBundledFfmpegPath(), { inputPath })
    } catch (err) {
      console.warn(`Loupe: skipping thumbnail repair for session ${session.id}: ${errorSummary(err)}`)
      return
    }

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
        console.warn(`Loupe: failed to repair thumbnail for marker ${bug.id}: ${errorSummary(err)}`)
        if (isIncompleteMp4Error(err)) break
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
      preSec: args.preSec ?? 5,
      postSec: args.postSec ?? 5,
      mentionUserIds: [],
      source: args.source ?? 'manual',
    }
    this.deps.db.insertBug(bug)
    this.persistProject(session.id)
    return bug
  }
  updateSessionMetadata(id: string, patch: { buildVersion: string; platform?: string; project?: string; testNote: string; tester: string }) {
    const session = this.deps.db.getSession(id)
    if (!session) throw new Error('session not found')
    this.deps.db.updateSessionMetadata(id, {
      buildVersion: patch.buildVersion.trim(),
      platform: patch.platform?.trim() ?? '',
      project: patch.project?.trim() ?? '',
      testNote: patch.testNote.trim(),
      tester: patch.tester.trim(),
    })
    this.persistProject(id)
  }
  savePcRecording(sessionId: string, bytes: Buffer): string {
    const session = this.deps.db.getSession(sessionId)
    if (!session) throw new Error('session not found')
    if (bytes.length === 0) throw new Error('PC recording is empty; nothing was saved.')
    this.deps.paths.ensureSessionDirs(sessionId)
    const out = this.deps.paths.pcVideoFile(sessionId)
    writeFileSync(out, bytes)
    this.deps.db.updateSessionPcRecording(sessionId, { pcRecordingEnabled: true, pcVideoPath: out })
    this.persistProject(sessionId)
    return out
  }
  saveMicRecording(sessionId: string, bytes: Buffer, durationMs: number, startOffsetMs = 0): string {
    const session = this.deps.db.getSession(sessionId)
    if (!session) throw new Error('session not found')
    this.deps.paths.ensureSessionDirs(sessionId)
    const out = this.deps.paths.micAudioFile(sessionId)
    writeFileSync(out, bytes)
    this.deps.db.updateSessionMicRecording(sessionId, {
      micAudioPath: out,
      micAudioDurationMs: Math.max(0, Math.round(durationMs)),
      micAudioStartOffsetMs: Math.max(0, Math.round(startOffsetMs)),
      micAudioSource: 'recording',
    })
    this.persistProject(sessionId)
    return out
  }
  updateSessionMicAudioOffset(sessionId: string, startOffsetMs: number): Session {
    const session = this.deps.db.getSession(sessionId)
    if (!session) throw new Error('session not found')
    this.deps.db.updateSessionMicAudioOffset(sessionId, Math.round(startOffsetMs))
    this.persistProject(sessionId)
    const updated = this.deps.db.getSession(sessionId)
    if (!updated) throw new Error('session not found')
    return updated
  }
  updateBug(id: string, patch: { note: string; severity: BugSeverity; preSec: number; postSec: number; mentionUserIds?: string[] }) {
    this.deps.db.updateBug(id, patch)
    const session = this.deps.db.raw.prepare(`SELECT session_id FROM bugs WHERE id = ?`).get(id) as { session_id?: string } | undefined
    if (session?.session_id) this.persistProject(session.session_id)
  }

  addAnnotation(args: { bugId: string; kind?: BugAnnotation['kind']; x: number; y: number; width: number; height: number; points?: BugAnnotation['points']; text?: string; startMs: number; endMs: number }): BugAnnotation {
    const row = this.deps.db.raw.prepare(`
      SELECT session_id, offset_ms, pre_sec, post_sec
      FROM bugs
      WHERE id = ?
    `).get(args.bugId) as AnnotationBugWindow | undefined
    if (!row?.session_id) throw new Error('bug not found')
    const window = clampAnnotationWindowForBug(row, args.startMs, args.endMs)
    if (!window) throw new Error('annotation outside marker clip window')
    const rect = sanitizeAnnotationRect(args)
    const annotation: BugAnnotation = {
      id: this.newId(),
      bugId: args.bugId,
      kind: sanitizeAnnotationKind(args.kind),
      ...rect,
      points: sanitizeAnnotationPoints(args.points),
      text: args.text?.trim() ?? '',
      startMs: window.startMs,
      endMs: window.endMs,
      createdAt: this.now(),
    }
    this.deps.db.insertAnnotation(annotation)
    this.persistProject(row.session_id)
    return annotation
  }

  updateAnnotation(id: string, patch: Partial<Pick<BugAnnotation, 'kind' | 'x' | 'y' | 'width' | 'height' | 'points' | 'text' | 'startMs' | 'endMs'>>): void {
    const row = this.deps.db.raw.prepare(`
      SELECT a.*, b.session_id, b.offset_ms, b.pre_sec, b.post_sec
      FROM bug_annotations a
      JOIN bugs b ON b.id = a.bug_id
      WHERE a.id = ?
    `).get(id) as (Record<string, unknown> & AnnotationBugWindow) | undefined
    if (!row?.session_id) throw new Error('annotation not found')
    const rectPatch = ['x', 'y', 'width', 'height'].some(key => typeof patch[key as keyof typeof patch] === 'number')
      ? sanitizeAnnotationRect({
          x: typeof patch.x === 'number' ? patch.x : Number(row.x),
          y: typeof patch.y === 'number' ? patch.y : Number(row.y),
          width: typeof patch.width === 'number' ? patch.width : Number(row.width),
          height: typeof patch.height === 'number' ? patch.height : Number(row.height),
        })
      : {}
    const requestedStartMs = typeof patch.startMs === 'number' ? patch.startMs : Number(row.start_ms)
    const requestedEndMs = typeof patch.endMs === 'number' ? patch.endMs : Number(row.end_ms)
    const window = clampAnnotationWindowForBug(row, requestedStartMs, requestedEndMs)
    if (!window) throw new Error('annotation outside marker clip window')
    this.deps.db.updateAnnotation(id, {
      ...patch,
      ...rectPatch,
      ...(patch.kind ? { kind: sanitizeAnnotationKind(patch.kind) } : {}),
      ...(patch.points ? { points: sanitizeAnnotationPoints(patch.points) } : {}),
      ...(typeof patch.text === 'string' ? { text: patch.text.trim() } : {}),
      startMs: window.startMs,
      endMs: window.endMs,
    })
    this.persistProject(row.session_id)
  }

  deleteAnnotation(id: string): void {
    const row = this.deps.db.raw.prepare(`
      SELECT b.session_id
      FROM bug_annotations a
      JOIN bugs b ON b.id = a.bug_id
      WHERE a.id = ?
    `).get(id) as { session_id?: string } | undefined
    this.deps.db.deleteAnnotation(id)
    if (row?.session_id) this.persistProject(row.session_id)
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
  deleteAutoAudioMarkers(sessionId: string): number {
    const removed = this.deps.db.deleteBugsBySourceForSession(sessionId, 'audio-auto')
    if (removed > 0) this.persistProject(sessionId)
    return removed
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
        logcat.dumpRecentLinesToFile(logcatPath, this.activeLogcatLineCount)
        logcatRel = `logcat/${bugId}.txt`
      } catch (err) {
        console.warn(`Loupe: failed to write logcat for marker ${bugId}`, err)
      }
    } else if (this.activeIosLogCapture) {
      try {
        this.iosSyslog.dumpRecentLinesToFile(logcatPath, this.activeLogcatLineCount)
        logcatRel = `logcat/${bugId}.txt`
      } catch (err) {
        console.warn(`Loupe: failed to write iOS syslog for marker ${bugId}`, err)
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
    const ffmpegPath = resolveBundledFfmpegPath()
    let lastError: unknown = null
    for (let attempt = 0; attempt <= VIDEO_FINALIZE_RETRY_DELAYS_MS.length; attempt++) {
      try {
        await waitForStableFile(inputPath)
        rmSync(outputPath, { force: true })
        await remuxForHtml5Playback(this.deps.runner, ffmpegPath, { inputPath, outputPath })
        lastError = null
        break
      } catch (err) {
        lastError = err
        rmSync(outputPath, { force: true })
        const delay = VIDEO_FINALIZE_RETRY_DELAYS_MS[attempt]
        if (delay === undefined || !isIncompleteMp4Error(err)) break
        await sleep(delay)
      }
    }
    if (lastError) throw lastError
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
