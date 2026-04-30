import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
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
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

function makeStubs() {
  const adb = {
    getDeviceInfo: vi.fn().mockResolvedValue({ model: 'Pixel 7', androidVersion: '14', ramTotalGb: 8, graphicsDevice: 'Qualcomm Adreno 740' }),
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
    dumpRecentLinesToFile: vi.fn().mockImplementation((path: string) => writeFileSync(path, 'line 1\nline 2\nline 3\nline 4\nline 5\n')),
  } as unknown as LogcatBuffer
  const screenshot = vi.fn().mockImplementation(async (_runner, _id, out: string) => {
    writeFileSync(out, Buffer.from([0x89, 0x50]))
  })
  const prepareVideo = vi.fn().mockResolvedValue(undefined)
  const clickRecorder = { start: vi.fn(), stop: vi.fn() }
  const telemetrySampler = { start: vi.fn(), stop: vi.fn() }
  return { adb, scrcpy, logcat, screenshot, prepareVideo, clickRecorder, telemetrySampler }
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
      prepareVideoForPlayback: stubs.prepareVideo,
      clickRecorder: stubs.clickRecorder,
      telemetrySampler: stubs.telemetrySampler,
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
    expect(s.ramTotalGb).toBe(8)
    expect(s.graphicsDevice).toBe('Qualcomm Adreno 740')
    expect(s.status).toBe('recording')
    expect(stubs.scrcpy.start).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: 'ABC', recordPath: paths.videoFile('sess-1'),
    }))
    expect(stubs.logcat.start).toHaveBeenCalled()
    expect(stubs.clickRecorder.start).toHaveBeenCalledWith({
      outputPath: paths.clicksFile('sess-1'),
      windowTitle: 'Loupe - Pixel 7',
    })
    expect(stubs.telemetrySampler.start).toHaveBeenCalledWith({
      adb: stubs.adb,
      deviceId: 'ABC',
      sessionStartedAt: 1_700_000_000_000,
      outputPath: paths.telemetryFile('sess-1'),
    })
    expect(existsSync(paths.screenshotsDir('sess-1'))).toBe(true)
    expect(existsSync(paths.projectFile('sess-1'))).toBe(true)
    expect(JSON.parse(readFileSync(paths.projectFile('sess-1'), 'utf8')).session.videoPath).toBe(paths.videoFile('sess-1'))
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
    expect(bug.screenshotRel).toBeNull()
    expect(db.listBugs('sess-1')).toHaveLength(1)
    expect(JSON.parse(readFileSync(paths.projectFile('sess-1'), 'utf8')).bugs).toHaveLength(1)

    await flushPromises()
    expect(existsSync(paths.screenshotFile('sess-1', bug.id))).toBe(true)
    expect(existsSync(paths.logcatFile('sess-1', bug.id))).toBe(true)
    expect(stubs.logcat.dumpRecentLinesToFile).toHaveBeenCalledWith(paths.logcatFile('sess-1', bug.id), 50)
    expect(db.listBugs('sess-1')[0].screenshotRel).toBe(`screenshots/${bug.id}.png`)
    expect(JSON.parse(readFileSync(paths.projectFile('sess-1'), 'utf8')).bugs[0].screenshotRel).toBe(`screenshots/${bug.id}.png`)
  })

  it('uses the requested marker logcat line count', async () => {
    await mgr.start({ deviceId: 'ABC', connectionMode: 'usb', buildVersion: '', testNote: '', logcatLineCount: 100 })
    const bug = await mgr.markBug()
    await flushPromises()
    expect(stubs.logcat.dumpRecentLinesToFile).toHaveBeenCalledWith(paths.logcatFile('sess-1', bug.id), 100)
  })

  it('markBug returns before a slow screenshot finishes', async () => {
    let finishScreenshot!: () => void
    stubs.screenshot.mockImplementationOnce(async (_runner, _id, out: string) => {
      await new Promise<void>(resolve => { finishScreenshot = resolve })
      writeFileSync(out, Buffer.from([0x89, 0x50]))
    })
    await mgr.start({ deviceId: 'ABC', connectionMode: 'usb', buildVersion: '', testNote: '' })

    const bug = await mgr.markBug()
    expect(bug.id).toBe('bug-1')
    expect(db.listBugs('sess-1')[0].screenshotRel).toBeNull()

    finishScreenshot()
    await flushPromises()
    expect(db.listBugs('sess-1')[0].screenshotRel).toBe('screenshots/bug-1.png')
  })

  it('uses the PC-side scrcpy window thumbnail for Android markers when available', async () => {
    const order: string[] = []
    const capturePcThumbnail = vi.fn().mockImplementation(async (sourceId: string, out: string) => {
      order.push('thumbnail')
      expect(sourceId).toBe('Loupe - Pixel 7')
      writeFileSync(out, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    })
    stubs.logcat.dumpRecentLinesToFile = vi.fn().mockImplementation((path: string) => {
      order.push('logcat')
      writeFileSync(path, 'log line\n')
    }) as any
    mgr = new SessionManager({
      db, paths, adb: stubs.adb, scrcpy: stubs.scrcpy, logcat: stubs.logcat,
      runner: { run: vi.fn() as any, spawn: vi.fn() as any },
      captureScreenshot: stubs.screenshot,
      capturePcThumbnail,
      prepareVideoForPlayback: stubs.prepareVideo,
      clickRecorder: stubs.clickRecorder,
      telemetrySampler: stubs.telemetrySampler,
      now: () => nowMs,
      newId: ((seq) => () => `bug-${seq++}`)(1),
      makeSessionId: () => 'sess-1',
    })
    await mgr.start({ deviceId: 'ABC', connectionMode: 'wifi', buildVersion: '', testNote: '' })
    const bug = await mgr.markBug()
    await flushPromises()

    expect(capturePcThumbnail).toHaveBeenCalledWith('Loupe - Pixel 7', paths.screenshotFile('sess-1', bug.id))
    expect(stubs.screenshot).not.toHaveBeenCalled()
    expect(order).toEqual(expect.arrayContaining(['thumbnail', 'logcat']))
    expect(order).toHaveLength(2)
    expect(db.listBugs('sess-1')[0].screenshotRel).toBe('screenshots/bug-1.png')
  })

  it('does not block Android recording with adb or ffmpeg fallback when PC-side thumbnail capture fails', async () => {
    const runner = { run: vi.fn() as any, spawn: vi.fn() as any }
    const capturePcThumbnail = vi.fn().mockRejectedValue(new Error('window not ready'))
    mgr = new SessionManager({
      db, paths, adb: stubs.adb, scrcpy: stubs.scrcpy, logcat: stubs.logcat,
      runner,
      captureScreenshot: stubs.screenshot,
      capturePcThumbnail,
      prepareVideoForPlayback: stubs.prepareVideo,
      clickRecorder: stubs.clickRecorder,
      telemetrySampler: stubs.telemetrySampler,
      now: () => nowMs,
      newId: ((seq) => () => `bug-${seq++}`)(1),
      makeSessionId: () => 'sess-1',
    })
    await mgr.start({ deviceId: 'ABC', connectionMode: 'wifi', buildVersion: '', testNote: '' })
    await mgr.markBug()
    await flushPromises()

    expect(capturePcThumbnail).toHaveBeenCalled()
    expect(stubs.screenshot).not.toHaveBeenCalled()
    expect(runner.run).not.toHaveBeenCalled()
    expect(db.listBugs('sess-1')[0].screenshotRel).toBeNull()
  })

  it('captures PC window thumbnails immediately while recording', async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }) as any,
      spawn: vi.fn() as any,
    }
    const capturePcThumbnail = vi.fn().mockImplementation(async (_sourceId: string, out: string) => {
      writeFileSync(out, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    })
    mgr = new SessionManager({
      db, paths, adb: stubs.adb, scrcpy: stubs.scrcpy, logcat: stubs.logcat,
      runner,
      captureScreenshot: stubs.screenshot,
      capturePcThumbnail,
      prepareVideoForPlayback: stubs.prepareVideo,
      clickRecorder: stubs.clickRecorder,
      telemetrySampler: stubs.telemetrySampler,
      now: () => nowMs,
      newId: ((seq) => () => `bug-${seq++}`)(1),
      makeSessionId: () => 'sess-1',
    })

    await mgr.start({
      deviceId: 'window:123:0',
      connectionMode: 'pc',
      buildVersion: '',
      testNote: '',
      pcCaptureSourceName: 'Chrome',
    })
    const bug = await mgr.markBug()
    await flushPromises()

    expect(capturePcThumbnail).toHaveBeenCalledWith('window:123:0', paths.screenshotFile('sess-1', bug.id))
    expect(runner.run).not.toHaveBeenCalled()
    expect(db.listBugs('sess-1')[0].screenshotRel).toBe(`screenshots/${bug.id}.png`)
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
    expect(stubs.clickRecorder.stop).toHaveBeenCalled()
    expect(stubs.telemetrySampler.stop).toHaveBeenCalled()
    expect(stubs.prepareVideo).toHaveBeenCalledWith(paths.videoFile('sess-1'))
    expect(stubs.logcat.stop).toHaveBeenCalled()
    expect(mgr.activeSessionId()).toBeNull()
    expect(JSON.parse(readFileSync(paths.projectFile('sess-1'), 'utf8')).session.status).toBe('draft')
  })

  it('finalizes the session when Android recording exits unexpectedly', async () => {
    const onInterrupted = vi.fn()
    mgr = new SessionManager({
      db, paths, adb: stubs.adb, scrcpy: stubs.scrcpy, logcat: stubs.logcat,
      runner: { run: vi.fn() as any, spawn: vi.fn() as any },
      captureScreenshot: stubs.screenshot,
      prepareVideoForPlayback: stubs.prepareVideo,
      clickRecorder: stubs.clickRecorder,
      telemetrySampler: stubs.telemetrySampler,
      onInterrupted,
      now: () => nowMs,
      newId: ((seq) => () => `bug-${seq++}`)(1),
      makeSessionId: () => 'sess-1',
    })
    await mgr.start({ deviceId: 'A', connectionMode: 'usb', buildVersion: '', testNote: '' })
    advance(12_000)
    const onExit = (stubs.scrcpy.start as any).mock.calls[0][0].onUnexpectedExit as (code: number | null) => void
    onExit(1)
    await flushPromises()

    const session = db.getSession('sess-1')
    expect(session?.status).toBe('draft')
    expect(session?.durationMs).toBe(12_000)
    expect(stubs.scrcpy.stop).not.toHaveBeenCalled()
    expect(stubs.clickRecorder.stop).toHaveBeenCalled()
    expect(stubs.logcat.stop).toHaveBeenCalled()
    expect(stubs.prepareVideo).toHaveBeenCalledWith(paths.videoFile('sess-1'))
    expect(onInterrupted).toHaveBeenCalledWith(expect.objectContaining({ id: 'sess-1', status: 'draft' }), expect.stringContaining('Android recording stopped'))
  })

  it('importProject restores session and bugs into the db and writes a project file', () => {
    const session = {
      id: 'imported', buildVersion: '2.0', testNote: 'regression', tester: 'Avery', deviceId: 'D',
      deviceModel: 'Pixel 8', androidVersion: '15', connectionMode: 'usb' as const,
      status: 'draft' as const, durationMs: 10_000, startedAt: 1, endedAt: 2,
      videoPath: join(root, 'external.mp4'),
      pcRecordingEnabled: false,
      pcVideoPath: null,
    }
    const bug = {
      id: 'b-imported', sessionId: 'imported', offsetMs: 1_000, severity: 'normal' as const,
      note: 'restored', screenshotRel: null, logcatRel: null, createdAt: 3,
      audioRel: null, audioDurationMs: null,
      preSec: 5, postSec: 5,
    }
    mgr.importProject(session, [bug])
    expect(db.getSession('imported')?.videoPath).toBe(session.videoPath)
    expect(db.listBugs('imported')[0].note).toBe('restored')
    expect(existsSync(paths.projectFile('imported'))).toBe(true)
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
