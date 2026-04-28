import { describe, it, expect, vi } from 'vitest'
import { doctor } from '../doctor'
import type { IProcessRunner } from '../process-runner'

function fakeRunner(behaviour: Record<string, { code: number; stdout?: string; stderr?: string } | Error>): IProcessRunner {
  return {
    async run(cmd) {
      const r = behaviour[cmd]
      if (r instanceof Error) throw r
      if (!r) throw new Error(`unexpected cmd: ${cmd}`)
      return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', code: r.code }
    },
    spawn: vi.fn() as any,
  }
}

describe('doctor', () => {
  it('reports ok when all tools present', async () => {
    const r = fakeRunner({
      adb: { code: 0, stdout: 'Android Debug Bridge version 1.0.41' },
      scrcpy: { code: 0, stdout: 'scrcpy 2.7' },
    })
    const checks = await doctor(r)
    expect(checks).toHaveLength(2)
    expect(checks.every(c => c.ok)).toBe(true)
    expect(checks[0].version).toContain('1.0.41')
    expect(checks[1].version).toContain('2.7')
  })

  it('reports not ok when binary missing', async () => {
    const r = fakeRunner({
      adb: new Error("ENOENT: spawn adb"),
      scrcpy: { code: 0, stdout: 'scrcpy 2.7' },
    })
    const checks = await doctor(r)
    expect(checks[0].ok).toBe(false)
    expect(checks[0].error).toContain('ENOENT')
    expect(checks[1].ok).toBe(true)
  })

  it('reports not ok when binary returns non-zero', async () => {
    const r = fakeRunner({
      adb: { code: 1, stderr: 'broken' },
      scrcpy: { code: 0, stdout: 'scrcpy 2.7' },
    })
    const checks = await doctor(r)
    expect(checks[0].ok).toBe(false)
    expect(checks[0].error).toContain('broken')
  })
})
