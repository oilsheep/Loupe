import type { IProcessRunner } from './process-runner'

export interface ClipOptions {
  inputPath: string
  outputPath: string
  startMs: number
  endMs: number
  narrationPath?: string | null
  narrationDurationMs?: number | null
  severity?: 'note' | 'major' | 'normal' | 'minor' | 'improvement' | null
  note?: string | null
  markerMs?: number | null
  deviceModel?: string | null
  buildVersion?: string | null
  androidVersion?: string | null
  testNote?: string | null
  tester?: string | null
  testedAtMs?: number | null
}

export interface FaststartOptions {
  inputPath: string
  outputPath: string
}

export interface ContactSheetOptions extends ClipOptions {
  outputPath: string
}

export interface ClipWindowOptions {
  offsetMs: number
  preSec: number
  postSec: number
  durationMs?: number | null
}

function ms(n: number): string {
  return (Math.max(0, n) / 1000).toFixed(3)
}

function escapeDrawtextValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, ' ')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/;/g, '\\;')
}

interface CaptionLine {
  text: string
  bold: boolean
  x?: number
  color?: string
  afterText?: string
  afterX?: number
  box?: {
    color: string
    width: number
    height: number
    textColor: string
  }
}

const SEVERITY_STYLE: Record<NonNullable<ClipOptions['severity']>, { label: string; color: string }> = {
  note: { label: 'note', color: '0x8b5cf6' },
  major: { label: 'major', color: '0xff4d4f' },
  normal: { label: 'normal', color: '0xffa500' },
  minor: { label: 'minor', color: '0x22b8f0' },
  improvement: { label: 'improvement', color: '0x22c55e' },
}

function formatDateTime(msValue: number): string {
  const d = new Date(msValue)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function wrapTextLine(line: string, maxChars: number): string[] {
  const trimmed = line.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= maxChars) return [trimmed]
  const out: string[] = []
  let remaining = trimmed
  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(' ', maxChars)
    if (splitAt < Math.floor(maxChars * 0.6)) splitAt = maxChars
    out.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }
  if (remaining) out.push(remaining)
  return out
}

function buildCaptionLines(opts: ClipOptions): CaptionLine[] {
  const lines: CaptionLine[] = []
  const addWrapped = (text: string | null | undefined, maxChars: number, bold = false) => {
    const value = text?.trim()
    if (!value) return
    for (const line of wrapTextLine(value, maxChars)) lines.push({ text: line, bold })
  }
  const compactLine = (parts: Array<string | null | undefined>) => {
    const values = parts.map(p => p?.trim()).filter(Boolean) as string[]
    return values.length > 0 ? values.join(' / ') : null
  }

  const severity = opts.severity ? SEVERITY_STYLE[opts.severity] : null
  const note = opts.note?.trim()
  if (severity) {
    const labelWidth = Math.max(76, severity.label.length * 15 + 24)
    const firstLineMax = note ? Math.max(8, 22 - Math.ceil(labelWidth / 16)) : 0
    const noteLines = note ? wrapTextLine(note, firstLineMax) : []
    lines.push({
      text: severity.label,
      bold: true,
      afterText: noteLines[0] ? `/ ${noteLines[0]}` : undefined,
      afterX: 18 + labelWidth + 12,
      box: { color: severity.color, width: labelWidth, height: 30, textColor: 'white' },
    })
    for (const line of noteLines.slice(1)) lines.push({ text: line, bold: true })
  } else if (note) {
    addWrapped(note, 20, true)
  }

  addWrapped(compactLine([
    opts.buildVersion,
    opts.androidVersion ? `Android ${opts.androidVersion}` : null,
    opts.deviceModel,
  ]), 44)
  addWrapped(compactLine([
    opts.tester,
    opts.testedAtMs != null ? formatDateTime(opts.testedAtMs) : null,
  ]), 44)
  return lines
}

function captionFilter(lines: CaptionLine[]): string {
  if (lines.length === 0) return ''
  const regularFont = 'C\\:/Windows/Fonts/msjh.ttc'
  const boldFont = 'C\\:/Windows/Fonts/msjhbd.ttc'
  const topPad = 18
  const bottomPad = 16
  const lineGap = 8
  const lineHeights = lines.map(line => line.box ? 34 : line.bold ? 31 : 24)
  const captionHeight = topPad + bottomPad + lineHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, lines.length - 1) * lineGap
  const filters = [`pad=iw:ih+${captionHeight}:0:0:color=#d9d9d9`]
  let y = topPad
  for (const line of lines) {
    const fontSize = line.bold ? 25 : 18
    const fontFile = line.bold ? boldFont : regularFont
    const x = line.x ?? 18
    if (line.box) {
      filters.push(
        `drawbox=x=${x}:y=h-${captionHeight - y}:w=${line.box.width}:h=${line.box.height}:color=${line.box.color}@1:t=fill`,
      )
    }
    filters.push(
      `drawtext=fontfile='${fontFile}':text='${escapeDrawtextValue(line.text)}':fontcolor=${line.box?.textColor ?? line.color ?? 'black'}:fontsize=${fontSize}:x=${x + (line.box ? 11 : 0)}:y=h-${captionHeight - y}`,
    )
    if (line.afterText) {
      filters.push(
        `drawtext=fontfile='${boldFont}':text='${escapeDrawtextValue(line.afterText)}':fontcolor=black:fontsize=25:x=${line.afterX ?? 18}:y=h-${captionHeight - y}`,
      )
    }
    y += (line.box ? 34 : line.bold ? 31 : 24) + lineGap
  }
  return filters.join(',')
}

function videoCaptionFilters(opts: ClipOptions, prefixFilters: string[] = []): string[] {
  const captionLines = buildCaptionLines(opts)
  const filters = [...prefixFilters]
  if (captionLines.length > 0) filters.push(captionFilter(captionLines))
  return filters
}

export function clampClipWindow(opts: ClipWindowOptions): { startMs: number; endMs: number } {
  const fallbackDurationMs = opts.offsetMs + opts.postSec * 1_000
  const durationMs = Math.max(0, opts.durationMs ?? fallbackDurationMs)
  if (durationMs <= 0) throw new Error('session has no recorded duration')

  const markerMs = Math.max(0, Math.min(durationMs, opts.offsetMs))
  const requestedStartMs = markerMs - opts.preSec * 1_000
  const requestedEndMs = markerMs + opts.postSec * 1_000
  const startMs = Math.max(0, Math.min(durationMs, requestedStartMs))
  const endMs = Math.max(0, Math.min(durationMs, requestedEndMs))
  if (endMs > startMs) return { startMs, endMs }

  const fallbackEndMs = Math.min(durationMs, markerMs + 1_000)
  if (fallbackEndMs > markerMs) return { startMs: markerMs, endMs: fallbackEndMs }

  const fallbackStartMs = Math.max(0, markerMs - 1_000)
  if (markerMs > fallbackStartMs) return { startMs: fallbackStartMs, endMs: markerMs }

  throw new Error('clip window is empty')
}

export function buildClipArgs(opts: ClipOptions): string[] {
  const startMs = Math.max(0, opts.startMs)
  const endMs = Math.max(0, opts.endMs)
  if (endMs <= startMs) throw new Error(`endMs (${opts.endMs}) must be > startMs (${opts.startMs})`)
  const durationMs = endMs - startMs
  const narrationDurationMs = Math.max(0, opts.narrationDurationMs ?? 0)
  const outputDurationMs = opts.narrationPath ? Math.max(durationMs, narrationDurationMs) : durationMs
  const freezeDurationMs = Math.max(0, outputDurationMs - durationMs)
  const filters: string[] = []
  if (freezeDurationMs > 0) filters.push(`tpad=stop_mode=clone:stop_duration=${ms(freezeDurationMs)}`)
  const captionedFilters = videoCaptionFilters(opts, filters)
  if (opts.narrationPath) {
    const videoFilter = [
      `[0:v:0]trim=start=${ms(startMs)}:duration=${ms(durationMs)}`,
      'setpts=PTS-STARTPTS',
      ...captionedFilters,
    ].join(',')
    const audioFilter = `[1:a:0]atrim=start=0:duration=${ms(outputDurationMs)},asetpts=PTS-STARTPTS`
    return [
      '-y',
      '-fflags', '+genpts',
      '-i', opts.inputPath,
      '-i', opts.narrationPath,
      '-filter_complex', `${videoFilter}[v];${audioFilter}[a]`,
      '-map', '[v]',
      '-map', '[a]',
      '-t', ms(outputDurationMs),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      opts.outputPath,
    ]
  }

  const filterArgs = captionedFilters.length > 0 ? ['-filter:v', captionedFilters.join(',')] : []
  return [
    '-y',
    '-fflags', '+genpts',
    '-i', opts.inputPath,
    '-ss', ms(startMs),
    '-t', ms(outputDurationMs),
    '-map', '0:v:0',
    '-map', '0:a?',
    ...filterArgs,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    opts.outputPath,
  ]
}

export async function extractClip(runner: IProcessRunner, ffmpegPath: string, opts: ClipOptions): Promise<void> {
  const r = await runner.run(ffmpegPath, buildClipArgs(opts))
  if (r.code !== 0) throw new Error(`ffmpeg failed (code ${r.code}): ${r.stderr.trim()}`)
}

export function buildContactSheetArgs(opts: ContactSheetOptions): string[] {
  const startMs = Math.max(0, opts.startMs)
  const endMs = Math.max(0, opts.endMs)
  if (endMs <= startMs) throw new Error(`endMs (${opts.endMs}) must be > startMs (${opts.startMs})`)
  const durationMs = endMs - startMs
  const fps = (9_000 / durationMs).toFixed(6)
  const filters = videoCaptionFilters(opts, [
    `trim=start=${ms(startMs)}:duration=${ms(durationMs)}`,
    'setpts=PTS-STARTPTS',
    `fps=${fps}`,
    'scale=240:426:force_original_aspect_ratio=decrease',
    'pad=240:426:(ow-iw)/2:(oh-ih)/2:color=black',
    'tile=3x3',
  ])
  return [
    '-y',
    '-fflags', '+genpts',
    '-i', opts.inputPath,
    '-filter:v', filters.join(','),
    '-frames:v', '1',
    '-q:v', '2',
    opts.outputPath,
  ]
}

export async function extractContactSheet(runner: IProcessRunner, ffmpegPath: string, opts: ContactSheetOptions): Promise<void> {
  const r = await runner.run(ffmpegPath, buildContactSheetArgs(opts))
  if (r.code !== 0) throw new Error(`ffmpeg contact sheet failed (code ${r.code}): ${r.stderr.trim()}`)
}

export function buildFaststartArgs(opts: FaststartOptions): string[] {
  return [
    '-y',
    '-fflags', '+genpts',
    '-i', opts.inputPath,
    '-map', '0',
    '-c', 'copy',
    '-movflags', '+faststart',
    opts.outputPath,
  ]
}

export async function remuxForHtml5Playback(runner: IProcessRunner, ffmpegPath: string, opts: FaststartOptions): Promise<void> {
  const r = await runner.run(ffmpegPath, buildFaststartArgs(opts))
  if (r.code !== 0) throw new Error(`ffmpeg faststart failed (code ${r.code}): ${r.stderr.trim()}`)
}

/** Resolved at runtime so tests don't import the binary. */
export function resolveBundledFfmpegPath(): string {
  // Lazy require so test suite (vitest) doesn't pull binary.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const installer = require('@ffmpeg-installer/ffmpeg') as { path: string }
  return installer.path
}
