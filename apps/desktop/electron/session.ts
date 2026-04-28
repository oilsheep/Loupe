import { renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Adb } from './adb'
import type { Scrcpy } from './scrcpy'
import type { LogcatBuffer } from './logcat'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { Paths } from './paths'
import type { Session, Bug, BugSeverity } from '@shared/types'
import { captureScreenshot as defaultCapture } from './screenshot'
import { remuxForHtml5Playback, resolveBundledFfmpegPath } from './ffmpeg'
import { writeProjectFile } from './project-file'
import { ClickRecorder } from './click-recorder'

export interface SessionDeps {
  db: Db
  paths: Paths
  adb: Adb
  scrcpy: Scrcpy
  logcat: LogcatBuffer
  runner: IProcessRunner
  captureScreenshot?: typeof defaultCapture
  prepareVideoForPlayback?: (inputPath: string) => Promise<void>
  clickRecorder?: Pick<ClickRecorder, 'start' | 'stop'>
  now?: () => number
  /** Generates IDs for individual bugs (random UUID by default). */
  newId?: () => string
  /** Generates the session id / on-disk folder name. Default = `<YYYY-MM-DD>_<HH-mm-ss>_<sanitized-build>`. */
  makeSessionId?: (buildVersion: string, nowMs: number) => string
}

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g

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
  connectionMode: 'usb' | 'wifi'
  buildVersion: string
  testNote: string
  tester?: string
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
  private active: Session | null = null
  private capture: typeof defaultCapture
  private prepareVideo: (inputPath: string) => Promise<void>
  private now: () => number
  private newId: () => string
  private makeSessionId: (buildVersion: string, nowMs: number) => string
  private clickRecorder: Pick<ClickRecorder, 'start' | 'stop'>

  constructor(private deps: SessionDeps) {
    this.capture = deps.captureScreenshot ?? defaultCapture
    this.prepareVideo = deps.prepareVideoForPlayback ?? this.defaultPrepareVideoForPlayback.bind(this)
    this.now = deps.now ?? Date.now
    this.newId = deps.newId ?? randomUUID
    this.makeSessionId = deps.makeSessionId ?? makeSessionId
    this.clickRecorder = deps.clickRecorder ?? new ClickRecorder(deps.runner)
  }

  activeSessionId(): string | null { return this.active?.id ?? null }

  async start(args: StartArgs): Promise<Session> {
    if (this.active) throw new Error('a session is already active')
    const { db, paths, adb, scrcpy, logcat } = this.deps
    const info = await adb.getDeviceInfo(args.deviceId)
    const startedAt = this.now()
    const id = this.makeSessionId(args.buildVersion, startedAt)
    paths.ensureSessionDirs(id)
    const sess: Session = {
      id, buildVersion: args.buildVersion, testNote: args.testNote,
      tester: args.tester?.trim() ?? '',
      deviceId: args.deviceId, deviceModel: info.model, androidVersion: info.androidVersion,
      connectionMode: args.connectionMode, status: 'recording',
      durationMs: null, startedAt, endedAt: null,
      videoPath: paths.videoFile(id),
    }
    db.insertSession(sess)
    this.persistProject(sess.id)
    const windowTitle = `Loupe - ${info.model}`
    scrcpy.start({
      deviceId: args.deviceId,
      recordPath: paths.videoFile(id),
      windowTitle,
    })
    this.clickRecorder.start({ outputPath: paths.clicksFile(id), windowTitle })
    logcat.start()
    this.active = sess
    return sess
  }

  async markBug(args: MarkBugArgs = {}): Promise<Bug> {
    if (!this.active) throw new Error('no active session')
    const { db, paths, scrcpy } = this.deps
    const sess = this.active
    const offsetMs = scrcpy.elapsedMs() ?? 0
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
    const { db, paths, scrcpy, logcat } = this.deps
    const sess = this.active
    await scrcpy.stop()
    this.clickRecorder.stop()
    logcat.stop()
    const endedAt = this.now()
    const durationMs = endedAt - sess.startedAt
    await this.prepareVideo(paths.videoFile(sess.id)).catch((err) => {
      console.warn(`Loupe: video remux failed for session ${sess.id}; keeping original recording`, err)
    })
    db.finalizeSession(sess.id, { durationMs, endedAt })
    this.active = null
    const updated = db.getSession(sess.id)!
    this.persistProject(sess.id)
    return updated
  }

  async discard(sessionId: string): Promise<void> {
    if (this.active?.id === sessionId) {
      try { await this.deps.scrcpy.stop() } catch {}
      this.clickRecorder.stop()
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
  updateSessionMetadata(id: string, patch: { testNote: string; tester: string }) {
    const session = this.deps.db.getSession(id)
    if (!session) throw new Error('session not found')
    this.deps.db.updateSessionMetadata(id, {
      testNote: patch.testNote.trim(),
      tester: patch.tester.trim(),
    })
    this.persistProject(id)
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
    const screenshotPath = paths.screenshotFile(session.id, bugId)
    const logcatPath = paths.logcatFile(session.id, bugId)
    let logcatRel: string | null = null
    let screenshotRel: string | null = null

    try {
      logcat.dumpRecentToFile(logcatPath)
      logcatRel = `logcat/${bugId}.txt`
    } catch (err) {
      console.warn(`Loupe: failed to write logcat for marker ${bugId}`, err)
    }

    try {
      await this.capture(runner, session.deviceId, screenshotPath)
      screenshotRel = `screenshots/${bugId}.png`
    } catch (err) {
      console.warn(`Loupe: failed to capture screenshot for marker ${bugId}`, err)
    }

    db.updateBugAssets(bugId, { screenshotRel, logcatRel })
    this.persistProject(session.id)
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
