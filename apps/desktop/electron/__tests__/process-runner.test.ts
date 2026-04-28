import { describe, it, expect } from 'vitest'
import { RealProcessRunner } from '../process-runner'

describe('RealProcessRunner.run', () => {
  const runner = new RealProcessRunner()

  it('captures stdout and exit code 0', async () => {
    const r = await runner.run(process.execPath, ['-e', 'process.stdout.write("hello")'])
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('hello')
  })

  it('captures stderr', async () => {
    const r = await runner.run(process.execPath, ['-e', 'process.stderr.write("oops")'])
    expect(r.stderr).toBe('oops')
  })

  it('captures non-zero exit code', async () => {
    const r = await runner.run(process.execPath, ['-e', 'process.exit(7)'])
    expect(r.code).toBe(7)
  })

  it('rejects when binary missing', async () => {
    await expect(runner.run('this-binary-does-not-exist-xyz', [])).rejects.toThrow()
  })
})

describe('RealProcessRunner.spawn', () => {
  const runner = new RealProcessRunner()

  it('returns a SpawnedProcess that emits exit', async () => {
    const proc = runner.spawn(process.execPath, ['-e', 'process.exit(0)'])
    const code = await new Promise<number | null>((r) => proc.onExit(r))
    expect(code).toBe(0)
  })

  it('kill() terminates the process', async () => {
    const proc = runner.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    proc.kill('SIGTERM')
    const code = await new Promise<number | null>((r) => proc.onExit(r))
    expect(code).not.toBe(0)
  })
})
