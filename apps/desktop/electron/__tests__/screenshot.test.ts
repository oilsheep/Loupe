import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { captureScreenshot } from '../screenshot'
import type { IProcessRunner, SpawnedProcess } from '../process-runner'

function mockProc(payload: Buffer): { proc: SpawnedProcess; complete: () => void } {
  const stdout = Readable.from([payload])
  const stderr = new EventEmitter() as any
  const exitHandlers: any[] = []
  return {
    proc: {
      pid: 1, stdout: stdout as any, stderr,
      kill: () => true,
      onExit: (h) => exitHandlers.push(h),
    },
    complete: () => exitHandlers.forEach(h => h(0)),
  }
}

describe('captureScreenshot', () => {
  it('writes adb stdout bytes to outPath', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shot-'))
    const out = join(dir, 'a.png')
    try {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      const m = mockProc(png)
      const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
      const p = captureScreenshot(runner, 'ABC', out)
      // Readable.from emits 'end' immediately after data; trigger exit:
      m.complete()
      await p
      const args = (runner.spawn as any).mock.calls[0][1] as string[]
      expect(args).toEqual(['-s', 'ABC', 'exec-out', 'screencap', '-p'])
      expect(readFileSync(out).equals(png)).toBe(true)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('strips warning text before the PNG payload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shot-'))
    const out = join(dir, 'a.png')
    try {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02])
      const warning = Buffer.from('[Warning] Multiple displays were found, using the default display.\n')
      const m = mockProc(Buffer.concat([warning, png]))
      const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
      const p = captureScreenshot(runner, 'ABC', out)
      m.complete()
      await p
      expect(readFileSync(out).equals(png)).toBe(true)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('throws when adb stdout does not contain a PNG', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shot-'))
    const out = join(dir, 'a.png')
    try {
      const m = mockProc(Buffer.from('not a png'))
      const runner: IProcessRunner = { run: vi.fn() as any, spawn: vi.fn().mockReturnValue(m.proc) as any }
      const p = captureScreenshot(runner, 'ABC', out)
      m.complete()
      await expect(p).rejects.toThrow(/did not return a PNG/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
