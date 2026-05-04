import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { UxPlayReceiver } from '../uxplay'
import type { IProcessRunner, SpawnedProcess } from '../process-runner'

const UXPLAY_LOOKUP_CMD = process.platform === 'win32' ? 'where' : '/usr/bin/which'

function mockSpawnedProcess(): SpawnedProcess {
  return {
    pid: 1,
    stdout: new EventEmitter() as any as Readable,
    stderr: new EventEmitter() as any as Readable,
    kill: vi.fn().mockReturnValue(true),
    onExit: vi.fn() as any,
  }
}

describe('UxPlayReceiver', () => {
  beforeEach(() => {
    vi.stubEnv('LOUPE_DISABLE_CWD_VENDOR_TOOLS', '1')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('starts uxplay with a predictable receiver name', async () => {
    vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', '/tmp/loupe-test-missing-tools')
    const proc = mockSpawnedProcess()
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '/tmp/uxplay\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn().mockReturnValue(proc) as any,
    }
    const receiver = new UxPlayReceiver(runner)

    const status = await receiver.start()
    expect(status).toMatchObject({ running: true, receiverName: 'Loupe iOS' })
    expect(runner.run).toHaveBeenCalledWith(UXPLAY_LOOKUP_CMD, ['uxplay'], expect.objectContaining({ env: expect.any(Object) }))
    expect(runner.spawn).toHaveBeenCalledWith('uxplay', ['-n', 'Loupe iOS', '-nh', '-p', '7100', '-vsync', 'no'], expect.objectContaining({ env: expect.any(Object) }))
  })

  it('returns an install hint when uxplay is unavailable', async () => {
    vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', '/tmp/loupe-test-missing-tools')
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'missing', code: 1 }) as any,
      spawn: vi.fn() as any,
    }
    const receiver = new UxPlayReceiver(runner)

    await expect(receiver.start()).resolves.toMatchObject({ running: false, message: expect.stringContaining('UxPlay is not available') })
    expect(runner.spawn).not.toHaveBeenCalled()
  })

  it('returns startup output when uxplay exits immediately', async () => {
    vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', '/tmp/loupe-test-missing-tools')
    const proc = mockSpawnedProcess()
    proc.onExit = vi.fn((handler) => {
      proc.stderr.emit('data', Buffer.from('Required gstreamer plugin app not found'))
      handler(1)
    }) as any
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '/tmp/uxplay\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn().mockReturnValue(proc) as any,
    }
    const receiver = new UxPlayReceiver(runner)

    await expect(receiver.start()).resolves.toMatchObject({
      running: false,
      message: expect.stringContaining('Required gstreamer plugin app not found'),
    })
  })

  it('stops a running receiver', async () => {
    vi.stubEnv('LOUPE_MANAGED_TOOLS_DIR', '/tmp/loupe-test-missing-tools')
    const proc = mockSpawnedProcess()
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '/tmp/uxplay\n', stderr: '', code: 0 }) as any,
      spawn: vi.fn().mockReturnValue(proc) as any,
    }
    const receiver = new UxPlayReceiver(runner)

    await receiver.start()
    const status = receiver.stop()
    expect(proc.kill).toHaveBeenCalled()
    expect(status.running).toBe(false)
  })
})
