import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { IosSyslogBuffer } from '../ios-syslog'
import type { IProcessRunner, SpawnedProcess } from '../process-runner'

function mockSpawnedProcess(): { proc: SpawnedProcess; emitLine: (s: string) => void } {
  const stdout = new EventEmitter() as any as Readable
  const stderr = new EventEmitter() as any as Readable
  const proc: SpawnedProcess = {
    pid: 1,
    stdout,
    stderr,
    kill: vi.fn().mockReturnValue(true),
    onExit: vi.fn() as any,
  }
  return {
    proc,
    emitLine: (s) => stdout.emit('data', Buffer.from(`${s}\n`)),
  }
}

describe('IosSyslogBuffer', () => {
  it('checks pymobiledevice3 help then starts syslog live', async () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: 'Usage: pymobiledevice3 [OPTIONS] COMMAND [ARGS]...\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn().mockReturnValue(m.proc) as any,
    }
    const buf = new IosSyslogBuffer(runner, { nowFn: () => 1000 })

    await expect(buf.start()).resolves.toBe(true)
    expect(runner.run).toHaveBeenCalledWith('pymobiledevice3', ['-h'])
    expect(runner.spawn).toHaveBeenCalledWith('pymobiledevice3', ['syslog', 'live'])

    m.emitLine('SpringBoard: foreground app changed')
    expect(buf.dumpRecentLines(10, 1000)).toBe('SpringBoard: foreground app changed')

    buf.stop()
    expect(m.proc.kill).toHaveBeenCalled()
  })

  it('fails before spawning when pymobiledevice3 is unavailable', async () => {
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'not found', code: 1 }) as any,
      spawn: vi.fn() as any,
    }
    const buf = new IosSyslogBuffer(runner)

    await expect(buf.start()).rejects.toThrow(/not found/)
    expect(runner.spawn).not.toHaveBeenCalled()
  })
})
