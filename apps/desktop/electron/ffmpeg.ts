import type { IProcessRunner } from './process-runner'

export interface ClipOptions {
  inputPath: string
  outputPath: string
  startMs: number
  endMs: number
}

function ms(n: number): string {
  return (Math.max(0, n) / 1000).toFixed(3)
}

export function buildClipArgs(opts: ClipOptions): string[] {
  if (opts.endMs <= opts.startMs) throw new Error(`endMs (${opts.endMs}) must be > startMs (${opts.startMs})`)
  return [
    '-y',
    '-ss', ms(opts.startMs),
    '-to', ms(opts.endMs),
    '-i', opts.inputPath,
    '-c', 'copy',
    opts.outputPath,
  ]
}

export async function extractClip(runner: IProcessRunner, ffmpegPath: string, opts: ClipOptions): Promise<void> {
  const r = await runner.run(ffmpegPath, buildClipArgs(opts))
  if (r.code !== 0) throw new Error(`ffmpeg failed (code ${r.code}): ${r.stderr.trim()}`)
}

/** Resolved at runtime so tests don't import the binary. */
export function resolveBundledFfmpegPath(): string {
  // Lazy require so test suite (vitest) doesn't pull binary.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const installer = require('@ffmpeg-installer/ffmpeg') as { path: string }
  return installer.path
}
