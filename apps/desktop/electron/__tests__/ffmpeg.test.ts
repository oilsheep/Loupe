import { describe, it, expect, vi } from 'vitest'
import { extractClip, buildClipArgs } from '../ffmpeg'
import type { IProcessRunner } from '../process-runner'

describe('buildClipArgs', () => {
  it('uses -ss/-to in seconds with -c copy and -y', () => {
    const args = buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: 5000, endMs: 12000 })
    expect(args).toEqual(['-y', '-ss', '5.000', '-to', '12.000', '-i', 'in.mp4', '-c', 'copy', 'out.mp4'])
  })

  it('clamps negative start to 0', () => {
    const args = buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: -200, endMs: 5000 })
    expect(args).toContain('0.000')
  })

  it('throws when end<=start', () => {
    expect(() => buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: 5000, endMs: 5000 })).toThrow()
  })
})

describe('extractClip', () => {
  it('invokes runner with ffmpeg path + computed args, resolves on success', async () => {
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }) as any,
      spawn: vi.fn() as any,
    }
    await extractClip(runner, '/path/to/ffmpeg', { inputPath: 'a.mp4', outputPath: 'b.mp4', startMs: 1000, endMs: 3000 })
    expect(runner.run).toHaveBeenCalledWith('/path/to/ffmpeg', expect.arrayContaining(['-ss', '1.000', '-to', '3.000']))
  })

  it('throws on non-zero exit', async () => {
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'bad input', code: 1 }) as any,
      spawn: vi.fn() as any,
    }
    await expect(extractClip(runner, '/ff', { inputPath: 'a', outputPath: 'b', startMs: 0, endMs: 1000 }))
      .rejects.toThrow(/bad input/)
  })
})
