import { describe, it, expect, vi } from 'vitest'
import {
  extractClip,
  buildClipArgs,
  buildIntroClipArgs,
  buildContactSheetArgs,
  buildFaststartArgs,
  clampClipWindow,
  remuxForHtml5Playback,
  resolveAsarUnpackedPath,
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
      '-r', '30',
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
      clipStartMs: 1000,
      clipEndMs: 6500,
      telemetryLine: 'RAM 4.2/8.0G, 73% charging / 38.2°C',
    })
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).toContain('drawbox=')
    expect(filter).toContain('drawbox=x=18:y=ih-')
    expect(filter).toContain('color=0xff4d4f@1')
    expect(filter).toContain("text='Critical'")
    expect(filter).toContain("text='/ button'")
    expect(filter).toContain("text='failed'")
    expect(filter).toContain('Daily Alpha / Android 16 / Pixel 7 Pro')
    expect(filter).not.toContain('Test\\:')
    expect(filter).toContain('Tester\\: Avery / 2026-04-29 14\\:05')
    expect(filter).toContain('Clip')
    expect(filter).toContain('0\\:01.0 - 0\\:06.5')
    expect(filter).toContain('RAM 4.2/8.0G')
    expect(filter).toContain('fontsize=14')
  })

  it('renders non-major severity labels with the same colored label treatment as major', () => {
    const args = buildClipArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startMs: 0,
      endMs: 5000,
      severity: 'improvement',
      note: 'nice to have',
    })
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).toContain('drawbox=')
    expect(filter).toContain('color=0x22c55e@1')
    expect(filter).toContain("text='Note'")
    expect(filter).toContain("text='/ nice to have'")
  })

  it('uses a platform font path instead of hardcoded Windows fonts on non-Windows hosts', () => {
    const args = buildClipArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startMs: 0,
      endMs: 5000,
      severity: 'improvement',
      note: 'nice to have',
    })
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).toContain("drawtext=fontfile='")
    if (process.platform === 'darwin') {
      expect(filter).toContain('/System/Library/Fonts/')
      expect(filter).not.toContain('C\\:/Windows/Fonts/msjhbd.ttc')
    }
  })

  it('renders colored non-major severity label even without a note', () => {
    const args = buildClipArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startMs: 0,
      endMs: 5000,
      severity: 'minor',
      note: '',
    })
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).toContain('drawbox=')
    expect(filter).toContain('color=0x22b8f0@1')
    expect(filter).toContain("text='Polish'")
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

  it('adds PC click overlays inside the exported clip window', () => {
    const args = buildClipArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      startMs: 10_000,
      endMs: 15_000,
      clicks: [
        { t: 9_000, x: 0.1, y: 0.1 },
        { t: 12_000, x: 0.5, y: 0.25 },
      ],
    })
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).toContain('drawbox=x=iw*0.500000-15:y=ih*0.250000-15')
    expect(filter).toContain("enable='between(t\\,2.000\\,2.450)'")
    expect(filter).not.toContain('0.100000')
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

describe('buildIntroClipArgs', () => {
  it('prepends a 3 second review card and pads the clip to the card width without per-frame captions', () => {
    const args = buildIntroClipArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      introImagePath: 'card.jpg',
      startMs: 5000,
      endMs: 12000,
      canvasWidth: 720,
      canvasHeight: 1450,
    })
    expect(args).toEqual(expect.arrayContaining(['-loop', '1', '-t', '3.000', '-i', 'card.jpg', '-i', 'in.mp4']))
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('fade=t=out:st=2.500:d=0.500')
    expect(filter).toContain('[1:v:0]trim=start=5.000:duration=7.000,setpts=PTS-STARTPTS')
    expect(filter).toContain('setpts=PTS-STARTPTS,fps=30')
    expect(filter).toContain('[1:a:0]atrim=start=5.000:duration=7.000,asetpts=PTS-STARTPTS,adelay=3000|3000[a]')
    expect(filter).toContain('scale=720:1450:force_original_aspect_ratio=decrease')
    expect(filter).toContain('pad=720:1450:(ow-iw)/2:0:color=black')
    expect(filter).toContain('concat=n=2:v=1:a=0')
    expect(filter).not.toContain('drawtext=')
    expect(args).toEqual(expect.arrayContaining(['-map', '[a]']))
    expect(args).not.toContain('-af')
    expect(args).toEqual(expect.arrayContaining(['-max_muxing_queue_size', '4096']))
  })

  it('can build a no-audio intro clip for PC recordings without audio streams', () => {
    const args = buildIntroClipArgs({
      inputPath: 'in.webm',
      outputPath: 'out.mp4',
      introImagePath: 'card.jpg',
      startMs: 5000,
      endMs: 12000,
      canvasWidth: 1280,
      canvasHeight: 720,
      sourceHasAudio: false,
    })
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).not.toContain('[1:a:0]')
    expect(args).not.toContain('[a]')
    expect(args).not.toContain('-c:a')
  })
})

describe('buildContactSheetArgs', () => {
  it('captures six evenly-spaced frames into a 3x2 intro card with a fixed bottom caption panel', () => {
    const args = buildContactSheetArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.jpg',
      startMs: 1000,
      endMs: 10_000,
      severity: 'major',
      note: 'button failed',
      buildVersion: 'Daily Alpha',
      testedAtMs: new Date(2026, 3, 29, 14, 5, 6).getTime(),
      tileWidth: 240,
      tileHeight: 426,
      outputWidth: 720,
      outputHeight: 1280,
    })
    expect(args).toEqual(expect.arrayContaining(['-i', 'in.mp4', '-frames:v', '1', '-q:v', '2', 'out.jpg']))
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).toContain('trim=start=1.000:duration=9.000')
    expect(filter).toContain('fps=0.666667')
    expect(filter).toContain('tile=3x2')
    expect(filter).toContain('pad=720:1280:(ow-iw)/2:0:color=black')
    expect(filter).toContain('drawbox=x=0:y=852:w=iw:h=428:color=#d9d9d9@1:t=fill')
    expect(filter).toContain('color=0xff4d4f@1')
    expect(filter).toContain("text='Critical'")
    expect(filter).toContain("text='/ button failed'")
    expect(filter).toContain('Daily Alpha')
    expect(filter).toContain('2026-04-29 14\\:05')
  })

  it('writes wrapped logcat lines below the 3x2 image info panel', () => {
    const args = buildContactSheetArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.jpg',
      startMs: 1000,
      endMs: 10_000,
      severity: 'major',
      note: 'button failed',
      buildVersion: 'Daily Alpha',
      testedAtMs: new Date(2026, 3, 29, 14, 5, 6).getTime(),
      tileWidth: 120,
      tileHeight: 213,
      outputWidth: 360,
      outputHeight: 620,
      logcatText: '04-30 12:48:52.344 WifiHAL : Creating message to get link statistics; iface = 47',
    })
    const filter = args[args.indexOf('-filter:v') + 1]
    expect(filter).toContain('tile=3x2')
    expect(filter).toContain('drawbox=x=0:y=426:w=iw:h=194:color=#d9d9d9@1:t=fill')
    expect(filter).toContain("text='logcat'")
    expect(filter).toContain("text='04-30 12\\:48\\:52.344 WifiHAL \\: Creating'")
    expect(filter).toContain("text='message to get link statistics\\; iface = 47'")
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

describe('resolveAsarUnpackedPath', () => {
  it('uses app.asar.unpacked when a packaged binary exists there', () => {
    const packed = String.raw`C:\Program Files\Loupe\resources\app.asar\node_modules\@ffmpeg-installer\win32-x64\ffmpeg.exe`
    const unpacked = String.raw`C:\Program Files\Loupe\resources\app.asar.unpacked\node_modules\@ffmpeg-installer\win32-x64\ffmpeg.exe`
    expect(resolveAsarUnpackedPath(packed, path => path === unpacked)).toBe(unpacked)
  })

  it('keeps the original path outside packaged asar builds', () => {
    const devPath = String.raw`C:\projects\Loupe\node_modules\@ffmpeg-installer\win32-x64\ffmpeg.exe`
    expect(resolveAsarUnpackedPath(devPath, () => false)).toBe(devPath)
  })
})
