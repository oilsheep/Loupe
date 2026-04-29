import { existsSync } from 'node:fs'
import type { IProcessRunner } from './process-runner'
import { existsSync } from 'node:fs'

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
  clicks?: ClickPoint[]
}

export interface ClickPoint {
  t: number
  x: number
  y: number
}

export interface FaststartOptions {
  inputPath: string
  outputPath: string
}

export interface ThumbnailOptions {
  inputPath: string
  outputPath: string
  offsetMs: number
}

export interface ContactSheetOptions extends ClipOptions {
  outputPath: string
  tileWidth?: number
  tileHeight?: number | null
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

interface CaptionLayout {
  noteChars: number
  metaChars: number
}

interface CaptionFonts {
  regular: string
  bold: string
}

const SEVERITY_STYLE: Record<NonNullable<ClipOptions['severity']>, { label: string; color: string }> = {
  note: { label: 'note', color: '0x8b5cf6' },
  major: { label: 'major', color: '0xff4d4f' },
  normal: { label: 'normal', color: '0xffa500' },
  minor: { label: 'minor', color: '0x22b8f0' },
  improvement: { label: 'improvement', color: '0x22c55e' },
}

function escapeFontFile(path: string): string {
  return path.replace(/\\/g, '/').replace(/:/g, '\\:')
}

function resolveCaptionFonts(): CaptionFonts {
  const windows = {
    regular: 'C:/Windows/Fonts/msjh.ttc',
    bold: 'C:/Windows/Fonts/msjhbd.ttc',
  }
  const macCandidates: CaptionFonts[] = [
    {
      regular: '/System/Library/Fonts/PingFang.ttc',
      bold: '/System/Library/Fonts/PingFang.ttc',
    },
    {
      regular: '/System/Library/Fonts/Hiragino Sans GB.ttc',
      bold: '/System/Library/Fonts/Hiragino Sans GB.ttc',
    },
    {
      regular: '/System/Library/Fonts/STHeiti Light.ttc',
      bold: '/System/Library/Fonts/STHeiti Medium.ttc',
    },
  ]
  const linuxCandidates: CaptionFonts[] = [
    {
      regular: '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
      bold: '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
    },
    {
      regular: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      bold: '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    },
    {
      regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    },
  ]

  const candidates = process.platform === 'win32'
    ? [windows]
    : process.platform === 'darwin'
      ? macCandidates
      : linuxCandidates

  const match = candidates.find(fonts => existsSync(fonts.regular) && existsSync(fonts.bold))
  const fallback = match ?? candidates[0] ?? windows
  return {
    regular: escapeFontFile(fallback.regular),
    bold: escapeFontFile(fallback.bold),
  }
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

function buildCaptionLines(opts: ClipOptions, layout: CaptionLayout = { noteChars: 20, metaChars: 44 }): CaptionLine[] {
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

  const majorSeverity = opts.severity === 'major' ? SEVERITY_STYLE.major : null
  const severityPrefix = opts.severity && opts.severity !== 'major' ? `[${opts.severity}]` : null
  const note = opts.note?.trim()
  if (majorSeverity) {
    const labelWidth = Math.max(76, majorSeverity.label.length * 15 + 24)
    const firstLineMax = note ? Math.max(8, layout.noteChars - Math.ceil(labelWidth / 16)) : 0
    const noteLines = note ? wrapTextLine(note, firstLineMax) : []
    lines.push({
      text: majorSeverity.label,
      bold: true,
      afterText: noteLines[0] ? `/ ${noteLines[0]}` : undefined,
      afterX: 18 + labelWidth + 12,
      box: { color: majorSeverity.color, width: labelWidth, height: 30, textColor: 'white' },
    })
    for (const line of noteLines.slice(1)) lines.push({ text: line, bold: true })
  } else if (severityPrefix) {
    const text = note ? `${severityPrefix} ${note}` : severityPrefix
    addWrapped(text, layout.noteChars, true)
  } else if (note) {
    addWrapped(note, layout.noteChars, true)
  }

  addWrapped(compactLine([
    opts.buildVersion,
    opts.androidVersion ? `Android ${opts.androidVersion}` : null,
    opts.deviceModel,
  ]), layout.metaChars)
  addWrapped(compactLine([
    opts.tester,
    opts.testedAtMs != null ? formatDateTime(opts.testedAtMs) : null,
  ]), layout.metaChars)
  return lines
}

function captionFilter(lines: CaptionLine[], layout: { x?: number } = {}): string {
  if (lines.length === 0) return ''
  const { regular: regularFont, bold: boldFont } = resolveCaptionFonts()
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
    const x = line.x ?? layout.x ?? 18
    if (line.box) {
      filters.push(
        `drawbox=x=${x}:y=ih-${captionHeight - y}:w=${line.box.width}:h=${line.box.height}:color=${line.box.color}@1:t=fill`,
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

function clickOverlayFilters(clicks: ClickPoint[] | undefined, startMs: number, endMs: number): string[] {
  if (!clicks?.length) return []
  const out: string[] = []
  for (const click of clicks) {
    if (!Number.isFinite(click.t) || !Number.isFinite(click.x) || !Number.isFinite(click.y)) continue
    if (click.t < startMs - 450 || click.t > endMs) continue
    const x = Math.max(0, Math.min(1, click.x)).toFixed(6)
    const y = Math.max(0, Math.min(1, click.y)).toFixed(6)
    const from = Math.max(0, (click.t - startMs) / 1000).toFixed(3)
    const to = (Math.max(0, click.t - startMs) / 1000 + 0.45).toFixed(3)
    const enable = `enable='between(t\\,${from}\\,${to})'`
    out.push(`drawbox=x=iw*${x}-15:y=ih*${y}-15:w=30:h=30:color=red@0.85:t=4:${enable}`)
    out.push(`drawbox=x=iw*${x}-3:y=ih*${y}-3:w=6:h=6:color=white@0.95:t=fill:${enable}`)
  }
  return out
}

function videoCaptionFilters(opts: ClipOptions, prefixFilters: string[] = [], layout?: CaptionLayout & { x?: number }): string[] {
  const captionLines = buildCaptionLines(opts, layout)
  const filters = [...prefixFilters]
  if (captionLines.length > 0) filters.push(captionFilter(captionLines, layout))
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
  const filters: string[] = [...clickOverlayFilters(opts.clicks, startMs, endMs)]
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
  const tileWidth = opts.tileWidth ?? 240
  const tileHeight = opts.tileHeight === undefined ? 426 : opts.tileHeight
  const scaleAndPad = tileHeight
    ? [
        `scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease`,
        `pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
      ]
    : [
        `scale=${tileWidth}:-2`,
      ]
  const filters = videoCaptionFilters(opts, [
    `trim=start=${ms(startMs)}:duration=${ms(durationMs)}`,
    'setpts=PTS-STARTPTS',
    `fps=${fps}`,
    ...scaleAndPad,
    'tile=3x3',
  ], { noteChars: 44, metaChars: 96, x: 26 })
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

export function buildThumbnailArgs(opts: ThumbnailOptions): string[] {
  return [
    '-y',
    '-ss', ms(opts.offsetMs),
    '-i', opts.inputPath,
    '-frames:v', '1',
    '-vf', 'scale=320:-2',
    '-q:v', '3',
    opts.outputPath,
  ]
}

export async function extractThumbnail(runner: IProcessRunner, ffmpegPath: string, opts: ThumbnailOptions): Promise<void> {
  const r = await runner.run(ffmpegPath, buildThumbnailArgs(opts))
  if (r.code !== 0) throw new Error(`ffmpeg thumbnail failed (code ${r.code}): ${r.stderr.trim()}`)
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
  return resolveAsarUnpackedPath(installer.path)
}

export function resolveAsarUnpackedPath(filePath: string, exists: (path: string) => boolean = existsSync): string {
  if (!filePath.includes('app.asar')) return filePath
  const unpackedPath = filePath.replace('app.asar', 'app.asar.unpacked')
  return exists(unpackedPath) ? unpackedPath : filePath
}
