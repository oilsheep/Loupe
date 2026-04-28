import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager, makeSessionId } from '../session'
import { openDb } from '../db'
import { createPaths } from '../paths'
import type { Adb } from '../adb'
import type { Scrcpy } from '../scrcpy'
import type { LogcatBuffer } from '../logcat'

let nowMs = 1_700_000_000_000
const advance = (ms: number) => { nowMs += ms }

function makeStubs() {
  const adb = {
    getDeviceInfo: vi.fn().mockResolvedValue({ model: 'Pixel 7', androidVersion: '14' }),
  } as unknown as Adb
  const scrcpy = {
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    elapsedMs: vi.fn().mockImplementation(() => nowMs - 1_700_000_000_000),
    isRunning: vi.fn().mockReturnValue(true),
  } as unknown as Scrcpy
  const logcat = {
    start: vi.fn(),
    stop: vi.fn(),
    dumpRecentToFile: vi.fn().mockImplementation((path: string) => writeFileSync(path, 'log line\n')),
  } as unknown as LogcatBuffer
  const screenshot = vi.fn().mockImplementation(async (_runner, _id, out: string) => {
    writeFileSync(out, Buffer.from([0x89, 0x50]))
  })
  return { adb, scrcpy, logcat, screenshot }
}

describe('SessionManager', () => {
  let root: string
  let db: ReturnType<typeof openDb>
  let paths: ReturnType<typeof createPaths>
  let stubs: ReturnType<typeof makeStubs>
  let mgr: SessionManager

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sess-'))
    paths = createPaths(root)
    paths.ensureRoot()
    db = openDb(paths.dbFile())
    stubs = makeStubs()
    nowMs = 1_700_000_000_000
    mgr = new SessionManager({
      db, paths, adb: stubs.adb, scrcpy: stubs.scrcpy, logcat: stubs.logcat,
      runner: { run: vi.fn() as any, spawn: vi.fn() as any },
      captureScreenshot: stubs.screenshot,
      now: () => nowMs,
      newId: ((seq) => () => `bug-${seq++}`)(1),
      makeSessionId: () => 'sess-1',
    })
  })

  afterEach(() => { db.close(); rmSync(root, { recursive: true, force: true }) })

  it('start creates session row, starts scrcpy + logcat, ensures dirs', async () => {
    const s = await mgr.start({
      deviceId: 'ABC', connectionMode: 'usb', buildVersion: '1.0', testNote: 'note',
    })
    expect(s.id).toBe('sess-1')
    expect(s.deviceModel).toBe('Pixel 7')
    expect(s.status).toBe('recording')
    expect(stubs.scrcpy.start).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: 'ABC', recordPath: paths.videoFile('sess-1'),
    }))
    expect(stubs.logcat.start).toHaveBeenCalled()
    expect(existsSync(paths.screenshotsDir('sess-1'))).toBe(true)
  })

  it('throws when starting while already active', async () => {
    await mgr.start({ deviceId: 'A', connectionMode: 'usb', buildVersion: '', testNote: '' })
    await expect(mgr.start({ deviceId: 'B', connectionMode: 'usb', buildVersion: '', testNote: '' }))
      .rejects.toThrow(/already/)
  })

  it('markBug snapshots scrcpy elapsed, captures screenshot+logcat, inserts row', async () => {
    await mgr.start({ deviceId: 'ABC', connectionMode: 'usb', buildVersion: '', testNote: '' })
    advance(7000)
    const bug = await mgr.markBug({ severity: 'major', note: 'crash' })
    expect(bug.offsetMs).toBe(7000)
    expect(bug.severity).toBe('major')
    expect(existsSync(paths.screenshotFile('sess-1', bug.id))).toBe(true)
    expect(existsSync(paths.logcatFile('sess-1', bug.id))).toBe(true)
    expect(stubs.logcat.dumpRecentToFile).toHaveBeenCalledWith(paths.logcatFile('sess-1', bug.id))
    expect(db.listBugs('sess-1')).toHaveLength(1)
  })

  it('markBug throws when no active session', async () => {
    await expect(mgr.markBug({ severity: 'normal', note: 'x' })).rejects.toThrow(/no active/)
  })

  it('stop transitions session to draft, stops scrcpy + logcat, sets duration', async () => {
    await mgr.start({ deviceId: 'A', connectionMode: 'usb', buildVersion: '', testNote: '' })
    advance(60_000)
    const s = await mgr.stop()
    expect(s.status).toBe('draft')
    expect(s.durationMs).toBe(60_000)
    expect(stubs.scrcpy.stop).toHaveBeenCalled()
    expect(stubs.logcat.stop).toHaveBeenCalled()
    expect(mgr.activeSessionId()).toBeNull()
  })

  it('discard deletes session row + files', async () => {
    const s = await mgr.start({ deviceId: 'A', connectionMode: 'usb', buildVersion: '', testNote: '' })
    await mgr.stop()
    await mgr.discard(s.id)
    expect(db.getSession(s.id)).toBeUndefined()
    expect(existsSync(paths.sessionDir(s.id))).toBe(false)
  })
})

describe('makeSessionId (default)', () => {
  it('builds <YYYY-MM-DD>_<HH-mm-ss>_<build> from local time', () => {
    const id = makeSessionId('1.4.2-RC3', Date.now())
    // Date and time portions are local-tz-dependent; assert structure not exact value.
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_1\.4\.2-RC3$/)
  })

  it('sanitises illegal Windows filename chars in build version', () => {
    const id = makeSessionId('feat/foo:bar*baz', 0)
    expect(id).toMatch(/_feat_foo_bar_baz$/)
  })

  it('falls back to "untitled" when build version is blank', () => {
    expect(makeSessionId('', 0)).toMatch(/_untitled$/)
    expect(makeSessionId('   ', 0)).toMatch(/_untitled$/)
  })
})
