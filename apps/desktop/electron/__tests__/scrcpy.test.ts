import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Scrcpy } from '../scrcpy'
import type { IProcessRunner } from '../process-runner'

function makeMock() {
  const exitHandlers: ((c: number | null) => void)[] = []
  const proc = {
    pid: 999,
    stdout: new EventEmitter() as any,
    stderr: new EventEmitter() as any,
    kill: vi.fn().mockReturnValue(true),
    onExit: vi.fn((h: any) => { exitHandlers.push(h) }),
  }
  const runner: IProcessRunner = {
    run: vi.fn() as any,
    spawn: vi.fn().mockReturnValue(proc) as any,
  }
  const triggerExit = (code = 0) => exitHandlers.forEach(h => h(code))
  return { runner, proc, triggerExit }
}

describe('Scrcpy', () => {
  it('start passes -s deviceId and --record path', () => {
    const { runner, proc } = makeMock()
    const s = new Scrcpy(runner)
    s.start({ deviceId: 'ABC', recordPath: 'C:/tmp/v.mp4' })
    const args = (runner.spawn as any).mock.calls[0][1] as string[]
    expect(args).toContain('-s'); expect(args).toContain('ABC')
    expect(args).toContain('--record'); expect(args).toContain('C:/tmp/v.mp4')
    expect(s.isRunning()).toBe(true)
    expect(proc.pid).toBe(999)
  })

  it('throws when start called twice', () => {
    const { runner } = makeMock()
    const s = new Scrcpy(runner)
    s.start({ deviceId: 'A', recordPath: 'a.mp4' })
    expect(() => s.start({ deviceId: 'B', recordPath: 'b.mp4' })).toThrow()
  })

  it('elapsedMs grows over time', async () => {
    const { runner } = makeMock()
    const s = new Scrcpy(runner)
    s.start({ deviceId: 'A', recordPath: 'a.mp4' })
    await new Promise(r => setTimeout(r, 30))
    const e = s.elapsedMs()
    expect(e).not.toBeNull()
    expect(e!).toBeGreaterThanOrEqual(20)
  })

  it('elapsedMs is null before start', () => {
    const { runner } = makeMock()
    expect(new Scrcpy(runner).elapsedMs()).toBeNull()
  })

  it('stop kills with SIGINT and resolves on exit', async () => {
    const { runner, proc, triggerExit } = makeMock()
    const s = new Scrcpy(runner)
    s.start({ deviceId: 'A', recordPath: 'a.mp4' })
    const p = s.stop()
    expect(proc.kill).toHaveBeenCalledWith('SIGINT')
    triggerExit(0)
    await p
    expect(s.isRunning()).toBe(false)
  })

  it('stop is no-op when not running', async () => {
    const { runner } = makeMock()
    await new Scrcpy(runner).stop()  // does not throw
  })
})
