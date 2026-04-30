import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { LogcatBuffer } from '../logcat'
import type { IProcessRunner, SpawnedProcess } from '../process-runner'

function mockSpawnedProcess(): { proc: SpawnedProcess; emitLine: (s: string) => void; close: () => void } {
  const stdout = new EventEmitter() as any as Readable
  const stderr = new EventEmitter() as any as Readable
  const exitHandlers: any[] = []
  const proc: SpawnedProcess = {
    pid: 1, stdout, stderr,
    kill: vi.fn().mockReturnValue(true),
    onExit: (h) => exitHandlers.push(h),
  }
  return {
    proc,
    emitLine: (s) => stdout.emit('data', Buffer.from(s + '\n')),
    close: () => exitHandlers.forEach(h => h(0)),
  }
}

describe('LogcatBuffer', () => {
  it('appends incoming lines and dumps recent ones within window', async () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
    const buf = new LogcatBuffer(runner, 'ABC', { windowMs: 30_000, nowFn: () => 1000 })
    buf.start()
    m.emitLine('line @ t=0 (kept)')
    m.emitLine('line @ t=0 (kept 2)')
    const snap = buf.dumpRecent(/* now */ 1000)
    expect(snap.split('\n').filter(Boolean)).toEqual(['line @ t=0 (kept)', 'line @ t=0 (kept 2)'])
  })

  it('drops lines older than windowMs', () => {
    const buf = new LogcatBuffer({ run: vi.fn() as any, spawn: vi.fn() as any }, 'ABC', { windowMs: 5_000 })
    buf.appendLineForTest('old', 1000)
    buf.appendLineForTest('mid', 4000)
    buf.appendLineForTest('new', 6000)
    expect(buf.dumpRecent(7000)).toBe('mid\nnew')   // window: [2000, 7000]
  })

  it('returns only the latest recent lines when requested', () => {
    const buf = new LogcatBuffer({ run: vi.fn() as any, spawn: vi.fn() as any }, 'ABC', { windowMs: 5_000 })
    buf.appendLineForTest('old', 1000)
    buf.appendLineForTest('mid', 4000)
    buf.appendLineForTest('new', 6000)
    expect(buf.dumpRecentLines(2, 7000)).toBe('mid\nnew')
    expect(buf.dumpRecentLines(1, 7000)).toBe('new')
  })

  it('stop kills the process', () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
    const buf = new LogcatBuffer(runner, 'ABC')
    buf.start()
    buf.stop()
    expect(m.proc.kill).toHaveBeenCalled()
  })

  it('passes correct adb args', () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
    new LogcatBuffer(runner, 'ABC').start()
    const args = (runner.spawn as any).mock.calls[0][1] as string[]
    expect(args).toEqual(['-s', 'ABC', 'logcat', '-v', 'threadtime'])
  })

  it('keeps only lines whose pid belongs to the package filter', async () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '1234\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn().mockReturnValue(m.proc) as any,
    }
    const buf = new LogcatBuffer(runner, 'ABC', {
      packageName: 'com.example.app',
      pidRefreshMs: 60_000,
      nowFn: () => 1000,
    })
    buf.start()
    await Promise.resolve()

    expect(runner.run).toHaveBeenCalledWith('adb', ['-s', 'ABC', 'shell', 'pidof', 'com.example.app'])
    m.emitLine('04-30 12:00:00.000  1234  2222 I App: kept')
    m.emitLine('04-30 12:00:00.001  9999  2222 I Other: dropped')

    expect(buf.dumpRecent(1000)).toBe('04-30 12:00:00.000  1234  2222 I App: kept')
    buf.stop()
  })

  it('keeps only matching logcat tags when a tag filter is set', () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
    const buf = new LogcatBuffer(runner, 'ABC', {
      tagFilter: 'Unity',
      minPriority: 'V',
      nowFn: () => 1000,
    })
    buf.start()
    m.emitLine('04-30 13:38:34.602 19244 19348 V Unity   : verbose kept')
    m.emitLine('04-30 13:38:34.603 19244 19348 I Unity   : info kept')
    m.emitLine('04-30 13:38:34.604 19244 19348 E ActivityManager: dropped')

    expect(buf.dumpRecent(1000)).toBe([
      '04-30 13:38:34.602 19244 19348 V Unity   : verbose kept',
      '04-30 13:38:34.603 19244 19348 I Unity   : info kept',
    ].join('\n'))
    buf.stop()
  })

  it('keeps only lines at or above the minimum logcat priority', () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
    const buf = new LogcatBuffer(runner, 'ABC', {
      tagFilter: 'Unity',
      minPriority: 'I',
      nowFn: () => 1000,
    })
    buf.start()
    m.emitLine('04-30 13:38:34.602 19244 19348 D Unity   : debug dropped')
    m.emitLine('04-30 13:38:34.603 19244 19348 I Unity   : info kept')
    m.emitLine('04-30 13:38:34.604 19244 19348 E Unity   : error kept')

    expect(buf.dumpRecent(1000)).toBe([
      '04-30 13:38:34.603 19244 19348 I Unity   : info kept',
      '04-30 13:38:34.604 19244 19348 E Unity   : error kept',
    ].join('\n'))
    buf.stop()
  })
})
