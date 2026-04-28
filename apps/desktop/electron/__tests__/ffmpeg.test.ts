import { describe, it, expect, vi } from 'vitest'
import {
  extractClip,
  buildClipArgs,
  buildContactSheetArgs,
  buildFaststartArgs,
  clampClipWindow,
  remuxForHtml5Playback,
} from '../ffmpeg'
import type { IProcessRunner } from '../process-runner'

describe('buildClipArgs', () => {
  it('uses -ss/-t in seconds with html5-ready encoding and -y', () => {
    const args = buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: 5000, endMs: 12000 })
    expect(args).toEqual([
      '-y',
      '-fflags', '+genpts',
      '-i', 'in.mp4',
      '-ss', '5.000',
      '-t', '7.000',
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      'out.mp4',
    ])
  })

  it('clamps negative start to 0', () => {
    const args = buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: -200, endMs: 5000 })
    expect(args).toContain('0.000')
  })

  it('adds a bottom caption area when note is present', () => {
    const args = buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: 0, endMs: 5000, note: 'line 1\nline 2' })
    const filterIndex = args.indexOf('-filter:v')
    expect(filterIndex).toBeGreaterThan(-1)
    expect(args[filterIndex + 1]).toContain('pad=iw:ih+')
    expect(args[filterIndex + 1]).toContain('drawtext=')
    expect(args[filterIndex + 1]).toContain('fontcolor=black')
    expect(args[filterIndex + 1]).toContain("text='line 1 line 2'")
    expect(args[filterIndex + 1]).toContain('fontsize=25')
  })

  it('adds export metadata to the caption', () => {
    const args = buildClipArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startMs: 0,
      endMs: 5000,
      markerMs: 12_000,
      severity: 'major',
      deviceModel: 'Pixel 7 Pro',
      buildVersion: 'Daily Alpha',
      androidVersion: '16',
      testNote: 'login flow',
      tester: 'Avery',
      testedAtMs: new Date(2026, 3, 29, 14, 5, 6).getTime(),
      note: 'button failed',
    })
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).toContain('drawbox=')
    expect(filter).toContain('drawbox=x=18:y=ih-')
    expect(filter).toContain('color=0xff4d4f@1')
    expect(filter).toContain("text='major'")
    expect(filter).toContain("text='/ button failed'")
    expect(filter).toContain('Daily Alpha / Android 16 / Pixel 7 Pro')
    expect(filter).not.toContain('Test\\:')
    expect(filter).toContain('Avery / 2026-04-29 14\\:05')
  })

  it('does not render non-major severity labels', () => {
    const args = buildClipArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startMs: 0,
      endMs: 5000,
      severity: 'improvement',
      note: 'nice to have',
    })
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).not.toContain('drawbox=')
    expect(filter).not.toContain("text='improvement'")
    expect(filter).toContain("text='nice to have'")
  })

  it('wraps long caption lines into separate drawtext layers', () => {
    const args = buildClipArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startMs: 0,
      endMs: 5000,
      note: 'This is a very long note that should wrap before it runs past the right side of the exported video frame.',
    })
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).toContain("text='This is a very long'")
    expect(filter).toContain("text='note that should'")
    expect(filter).toContain("text='wrap before it runs'")
  })

  it('does not add a caption filter for blank notes', () => {
    const args = buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: 0, endMs: 5000, note: '  ' })
    expect(args).not.toContain('-filter:v')
  })

  it('uses narration audio and extends the last frame when audio is longer than the clip', () => {
    const args = buildClipArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startMs: 1000,
      endMs: 3000,
      narrationPath: 'note.webm',
      narrationDurationMs: 5000,
    })
    expect(args).toEqual(expect.arrayContaining(['-i', 'note.webm', '-t', '5.000', '-map', '[v]', '-map', '[a]']))
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('[0:v:0]trim=start=1.000:duration=2.000,setpts=PTS-STARTPTS')
    expect(filter).toContain('tpad=stop_mode=clone:stop_duration=3.000')
    expect(filter).toContain('[1:a:0]atrim=start=0:duration=5.000,asetpts=PTS-STARTPTS')
  })

  it('throws when end<=start', () => {
    expect(() => buildClipArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4', startMs: 5000, endMs: 5000 })).toThrow()
  })
})

describe('clampClipWindow', () => {
  it('uses the requested pre/post window when it fits', () => {
    expect(clampClipWindow({ offsetMs: 10_000, preSec: 5, postSec: 7, durationMs: 30_000 }))
      .toEqual({ startMs: 5_000, endMs: 17_000 })
  })

  it('clamps a marker near the recording start', () => {
    expect(clampClipWindow({ offsetMs: 1_000, preSec: 5, postSec: 5, durationMs: 30_000 }))
      .toEqual({ startMs: 0, endMs: 6_000 })
  })

  it('clamps a marker near the recording end', () => {
    expect(clampClipWindow({ offsetMs: 29_000, preSec: 5, postSec: 5, durationMs: 30_000 }))
      .toEqual({ startMs: 24_000, endMs: 30_000 })
  })

  it('falls back to a non-empty clip when the marker is at the exact end', () => {
    expect(clampClipWindow({ offsetMs: 30_000, preSec: 0, postSec: 0, durationMs: 30_000 }))
      .toEqual({ startMs: 29_000, endMs: 30_000 })
  })
})

describe('extractClip', () => {
  it('invokes runner with ffmpeg path + computed args, resolves on success', async () => {
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }) as any,
      spawn: vi.fn() as any,
    }
    await extractClip(runner, '/path/to/ffmpeg', { inputPath: 'a.mp4', outputPath: 'b.mp4', startMs: 1000, endMs: 3000 })
    expect(runner.run).toHaveBeenCalledWith('/path/to/ffmpeg', expect.arrayContaining(['-ss', '1.000', '-t', '2.000']))
    expect(runner.run).toHaveBeenCalledWith('/path/to/ffmpeg', expect.arrayContaining(['-map', '0:v:0', '-map', '0:a?']))
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

describe('buildContactSheetArgs', () => {
  it('captures nine evenly-spaced frames into a 3x3 sheet with the same caption block', () => {
    const args = buildContactSheetArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.jpg',
      startMs: 1000,
      endMs: 10_000,
      severity: 'major',
      note: 'button failed',
      buildVersion: 'Daily Alpha',
      testedAtMs: new Date(2026, 3, 29, 14, 5, 6).getTime(),
    })
    expect(args).toEqual(expect.arrayContaining(['-i', 'in.mp4', '-frames:v', '1', '-q:v', '2', 'out.jpg']))
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).toContain('trim=start=1.000:duration=9.000')
    expect(filter).toContain('fps=1.000000')
    expect(filter).toContain('tile=3x3')
    expect(filter).toContain('color=0xff4d4f@1')
    expect(filter).toContain("text='major'")
    expect(filter).toContain("text='/ button failed'")
    expect(filter).toContain('Daily Alpha')
    expect(filter).toContain('2026-04-29 14\\:05')
  })
})

describe('buildFaststartArgs', () => {
  it('copy-remuxes with generated pts and faststart metadata', () => {
    const args = buildFaststartArgs({ inputPath: 'in.mp4', outputPath: 'out.mp4' })
    expect(args).toEqual([
      '-y',
      '-fflags', '+genpts',
      '-i', 'in.mp4',
      '-map', '0',
      '-c', 'copy',
      '-movflags', '+faststart',
      'out.mp4',
    ])
  })
})

describe('remuxForHtml5Playback', () => {
  it('invokes runner with faststart args', async () => {
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }) as any,
      spawn: vi.fn() as any,
    }
    await remuxForHtml5Playback(runner, '/path/to/ffmpeg', { inputPath: 'a.mp4', outputPath: 'a.faststart.mp4' })
    expect(runner.run).toHaveBeenCalledWith('/path/to/ffmpeg', expect.arrayContaining(['-movflags', '+faststart']))
  })

  it('throws on non-zero exit', async () => {
    const runner: IProcessRunner = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'remux failed', code: 1 }) as any,
      spawn: vi.fn() as any,
    }
    await expect(remuxForHtml5Playback(runner, '/ff', { inputPath: 'a', outputPath: 'b' }))
      .rejects.toThrow(/remux failed/)
  })
})
