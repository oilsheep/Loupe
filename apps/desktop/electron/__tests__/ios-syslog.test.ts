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
  it('prefers go-ios syslog when available', async () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ stdout: '1.0.211\n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: 'launched\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn().mockReturnValue(m.proc) as any,
    }
    const buf = new IosSyslogBuffer(runner, { nowFn: () => 1000 })

    await expect(buf.start({ bundleId: 'com.example.game', launchApp: true, textFilter: 'foreground', minLevel: 'I' })).resolves.toBe(true)
    expect(runner.run).toHaveBeenCalledWith('ios', ['--version'])
    expect(runner.run).toHaveBeenCalledWith('ios', ['launch', 'com.example.game'])
    expect(runner.run).not.toHaveBeenCalledWith('pymobiledevice3', ['-h'])
    expect(runner.spawn).toHaveBeenCalledWith('ios', ['syslog', '--parse'])

    m.emitLine('{"process":"game","level":"DEBUG","message":"foreground app changed"}')
    m.emitLine('{"process":"game","level":"INFO","message":"foreground app changed"}')
    m.emitLine('{"process":"other","level":"INFO","message":"foreground app changed"}')
    expect(buf.dumpRecentLines(10, 1000)).toContain('foreground app changed')
    expect(buf.dumpRecentLines(10, 1000)).not.toContain('"DEBUG"')
    expect(buf.dumpRecentLines(10, 1000)).not.toContain('"other"')

    buf.stop()
    expect(m.proc.kill).toHaveBeenCalled()
  })

  it('does not treat a short bundle suffix as a broad substring filter', async () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ stdout: '1.0.211\n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: 'launched\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn().mockReturnValue(m.proc) as any,
    }
    const buf = new IosSyslogBuffer(runner, { nowFn: () => 1000 })

    await expect(buf.start({ bundleId: 'com.pinkcore.ig', launchApp: true })).resolves.toBe(true)
    m.emitLine(JSON.stringify({
      error: 'failed to parse syslog message',
      msg: 'May  2 01:09:23 Miki20 CursedBlossom(BackBoardServices)[4389] <Notice>: platformInputModeConfiguration changed',
    }))

    const lines = buf.dumpRecentLines(10, 1000)
    expect(lines).not.toContain('BackBoardServices')
  })

  it('keeps logs whose process name matches the selected iOS app name', async () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ stdout: '1.0.211\n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: 'launched\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn().mockReturnValue(m.proc) as any,
    }
    const buf = new IosSyslogBuffer(runner, { nowFn: () => 1000 })

    await expect(buf.start({ bundleId: 'com.pinkcore.ig', appName: 'CursedBlossom', launchApp: true })).resolves.toBe(true)
    m.emitLine(JSON.stringify({
      msg: 'May  2 01:09:23 Miki20 CursedBlossom(BackBoardServices)[4389] <Notice>: disconnected',
    }))
    m.emitLine(JSON.stringify({
      msg: 'May  2 01:09:23 Miki20 BackBoardServices[4389] <Notice>: disconnected',
    }))

    const lines = buf.dumpRecentLines(10, 1000)
    expect(lines).toContain('CursedBlossom')
    expect(lines).not.toContain('BackBoardServices[4389]')
  })

  it('kills an existing app then retries launch after a process start timeout', async () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ stdout: '1.0.211\n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'Timed out waiting for response for message:1 channel:1', code: 1 })
        .mockResolvedValueOnce({ stdout: 'killed\n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: 'launched\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn().mockReturnValue(m.proc) as any,
    }
    const buf = new IosSyslogBuffer(runner, { tunnelStartDelayMs: 0 })

    await expect(buf.start({ bundleId: 'com.example.game', launchApp: true })).resolves.toBe(true)
    expect(runner.run).toHaveBeenNthCalledWith(2, 'ios', ['launch', 'com.example.game'])
    expect(runner.run).toHaveBeenNthCalledWith(3, 'ios', ['kill', 'com.example.game'])
    expect(runner.run).toHaveBeenNthCalledWith(4, 'ios', ['launch', 'com.example.game'])
  })

  it('falls back to pymobiledevice3 syslog live when go-ios is unavailable', async () => {
    const m = mockSpawnedProcess()
    const runner: IProcessRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: 'ios not found', code: 1 })
        .mockResolvedValueOnce({ stdout: 'Usage: pymobiledevice3 [OPTIONS] COMMAND [ARGS]...\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn().mockReturnValue(m.proc) as any,
    }
    const buf = new IosSyslogBuffer(runner, { nowFn: () => 1000 })

    await expect(buf.start()).resolves.toBe(true)
    expect(runner.run).toHaveBeenCalledWith('ios', ['--version'])
    expect(runner.run).toHaveBeenCalledWith('pymobiledevice3', ['-h'])
    expect(runner.spawn).toHaveBeenCalledWith('pymobiledevice3', ['syslog', 'live', '--label'])

    m.emitLine('SpringBoard: foreground app changed')
    expect(buf.dumpRecentLines(10, 1000)).toContain('SpringBoard: foreground app changed')

    buf.stop()
    expect(m.proc.kill).toHaveBeenCalled()
  })

  it('fails session start when auto-launching the selected iOS app fails', async () => {
    const runner: IProcessRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ stdout: '1.0.211\n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '{"level":"fatal","msg":"Device not found","err":"device locked"}\n', code: 1 }) as any,
      spawn: vi.fn() as any,
    }
    const buf = new IosSyslogBuffer(runner)

    await expect(buf.start({ bundleId: 'com.example.game', launchApp: true })).rejects.toThrow(/Device not found/)
    expect(runner.spawn).not.toHaveBeenCalled()
  })

  it('mounts the Developer Image and retries go-ios launch when required', async () => {
    const m = mockSpawnedProcess()
    const tunnel = mockSpawnedProcess()
    const runner: IProcessRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ stdout: '1.0.211\n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '{"level":"fatal","msg":"InvalidService","err":"Have you mounted the Developer Image?"}\n', code: 1 })
        .mockResolvedValueOnce({ stdout: '', stderr: '{"level":"fatal","msg":"InvalidService","err":"Have you mounted the Developer Image?"}\n', code: 1 })
        .mockResolvedValueOnce({ stdout: '{"msg":"mounted"}\n', stderr: '', code: 0 })
        .mockResolvedValueOnce({ stdout: 'launched\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn()
        .mockReturnValueOnce(tunnel.proc)
        .mockReturnValueOnce(m.proc) as any,
    }
    const buf = new IosSyslogBuffer(runner, { tunnelStartDelayMs: 0 })

    await expect(buf.start({ bundleId: 'com.example.game', launchApp: true })).resolves.toBe(true)
    expect(runner.spawn).toHaveBeenCalledWith('ios', ['tunnel', 'start', '--userspace'])
    expect(runner.run).toHaveBeenCalledWith('ios', ['image', 'auto'])
    expect(runner.run).toHaveBeenCalledTimes(5)
    expect(runner.spawn).toHaveBeenCalledWith('ios', ['syslog', '--parse'])
  })

  it('fails before spawning when both providers are unavailable', async () => {
    const runner: IProcessRunner = {
      run: vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: 'ios not found', code: 1 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'pymobiledevice3 not found', code: 1 }) as any,
      spawn: vi.fn() as any,
    }
    const buf = new IosSyslogBuffer(runner)

    await expect(buf.start()).rejects.toThrow(/pymobiledevice3 unavailable/)
    expect(runner.spawn).not.toHaveBeenCalled()
  })
})
