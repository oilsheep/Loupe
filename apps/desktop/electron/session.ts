import { rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Adb } from './adb'
import type { Scrcpy } from './scrcpy'
import type { LogcatBuffer } from './logcat'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { Paths } from './paths'
import type { Session, Bug, BugSeverity } from '@shared/types'
import { captureScreenshot as defaultCapture } from './screenshot'

export interface SessionDeps {
  db: Db
  paths: Paths
  adb: Adb
  scrcpy: Scrcpy
  logcat: LogcatBuffer
  runner: IProcessRunner
  captureScreenshot?: typeof defaultCapture
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
}

export interface MarkBugArgs {
  severity: BugSeverity
  note: string
}

export class SessionManager {
  private active: Session | null = null
  private capture: typeof defaultCapture
  private now: () => number
  private newId: () => string
  private makeSessionId: (buildVersion: string, nowMs: number) => string

  constructor(private deps: SessionDeps) {
    this.capture = deps.captureScreenshot ?? defaultCapture
    this.now = deps.now ?? Date.now
    this.newId = deps.newId ?? randomUUID
    this.makeSessionId = deps.makeSessionId ?? makeSessionId
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
      deviceId: args.deviceId, deviceModel: info.model, androidVersion: info.androidVersion,
      connectionMode: args.connectionMode, status: 'recording',
      durationMs: null, startedAt, endedAt: null,
    }
    db.insertSession(sess)
    scrcpy.start({ deviceId: args.deviceId, recordPath: paths.videoFile(id), windowTitle: `Loupe — ${info.model}` })
    logcat.start()
    this.active = sess
    return sess
  }

  async markBug(args: MarkBugArgs): Promise<Bug> {
    if (!this.active) throw new Error('no active session')
    const { db, paths, scrcpy, logcat, runner } = this.deps
    const sess = this.active
    const offsetMs = scrcpy.elapsedMs() ?? 0
    const bugId = this.newId()
    const screenshotPath = paths.screenshotFile(sess.id, bugId)
    const logcatPath = paths.logcatFile(sess.id, bugId)

    // Run side effects in parallel; tolerate screenshot failure (don't block bug record).
    const shotP = this.capture(runner, sess.deviceId, screenshotPath).then(() => true).catch(() => false)
    logcat.dumpRecentToFile(logcatPath)
    const shotOk = await shotP

    const bug: Bug = {
      id: bugId, sessionId: sess.id, offsetMs, severity: args.severity, note: args.note,
      screenshotRel: shotOk ? `screenshots/${bugId}.png` : null,
      logcatRel: `logcat/${bugId}.txt`,
      createdAt: this.now(),
      preSec: 5, postSec: 5,
    }
    db.insertBug(bug)
    return bug
  }

  async stop(): Promise<Session> {
    if (!this.active) throw new Error('no active session')
    const { db, scrcpy, logcat } = this.deps
    const sess = this.active
    await scrcpy.stop()
    logcat.stop()
    const endedAt = this.now()
    const durationMs = endedAt - sess.startedAt
    db.finalizeSession(sess.id, { durationMs, endedAt })
    this.active = null
    const updated = db.getSession(sess.id)!
    return updated
  }

  async discard(sessionId: string): Promise<void> {
    if (this.active?.id === sessionId) {
      try { await this.deps.scrcpy.stop() } catch {}
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
  updateBug(id: string, patch: { note: string; severity: BugSeverity; preSec: number; postSec: number }) {
    this.deps.db.updateBug(id, patch)
  }
  deleteBug(id: string) { this.deps.db.deleteBug(id) }
}
