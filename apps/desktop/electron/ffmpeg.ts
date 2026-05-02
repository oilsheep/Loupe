import { existsSync } from 'node:fs'
import type { SpawnOptions } from 'node:child_process'
import type { IProcessRunner } from './process-runner'

export interface ClipOptions {
  inputPath: string
  outputPath: string
  startMs: number
  endMs: number
  narrationPath?: string | null
  narrationDurationMs?: number | null
  sessionMicPath?: string | null
  severity?: string | null
  note?: string | null
  markerMs?: number | null
  deviceModel?: string | null
  buildVersion?: string | null
  androidVersion?: string | null
  testNote?: string | null
  tester?: string | null
  testedAtMs?: number | null
  clicks?: ClickPoint[]
  severityLabel?: string | null
  severityColor?: string | null
  clipStartMs?: number | null
  clipEndMs?: number | null
  telemetryLine?: string | null
  logcatText?: string | null
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

export interface VideoInputReadableOptions {
  inputPath: string
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
  outputWidth?: number | null
  outputHeight?: number | null
}

export interface IntroClipOptions extends ClipOptions {
  introImagePath: string
  introDurationMs?: number
  introFadeMs?: number
  canvasWidth: number
  canvasHeight: number
  sourceHasAudio?: boolean
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
  small?: boolean
}

interface CaptionLayout {
  noteChars: number
  metaChars: number
}

interface CaptionFonts {
  regular: string
  bold: string
}

const SEVERITY_STYLE: Record<string, { label: string; color: string }> = {
  note: { label: 'note', color: '#a1a1aa' },
  major: { label: 'Critical', color: '#ff4d4f' },
  normal: { label: 'Bug', color: '#f59e0b' },
  minor: { label: 'Polish', color: '#22b8f0' },
  improvement: { label: 'Note', color: '#22c55e' },
  custom1: { label: 'custom 1', color: '#8b5cf6' },
  custom2: { label: 'custom 2', color: '#ec4899' },
  custom3: { label: 'custom 3', color: '#14b8a6' },
  custom4: { label: 'custom 4', color: '#eab308' },
}

function ffmpegColor(value: string): string {
  return value.startsWith('#') ? `0x${value.slice(1)}` : value
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

function formatClipTime(msValue: number): string {
  const totalTenths = Math.max(0, Math.round(msValue / 100))
  const totalSeconds = Math.floor(totalTenths / 10)
  const tenths = totalTenths % 10
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`
    : `${m}:${String(s).padStart(2, '0')}.${tenths}`
}

function formatOsLabel(androidVersion: string | null | undefined): string | null {
  const value = androidVersion?.trim()
  if (!value) return null
  return value.toLowerCase() === 'windows' ? 'Windows' : `Android ${value}`
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

  const severityStyle = opts.severity
    ? {
        label: opts.severityLabel?.trim() || SEVERITY_STYLE[opts.severity].label,
        color: ffmpegColor(opts.severityColor?.trim() || SEVERITY_STYLE[opts.severity].color),
      }
    : null
  const note = opts.note?.trim()
  if (severityStyle) {
    const labelWidth = Math.max(76, severityStyle.label.length * 15 + 24)
    const firstLineMax = note ? Math.max(8, layout.noteChars - Math.ceil(labelWidth / 16)) : 0
    const noteLines = note ? wrapTextLine(note, firstLineMax) : []
    lines.push({
      text: severityStyle.label,
      bold: true,
      afterText: noteLines[0] ? `/ ${noteLines[0]}` : undefined,
      afterX: 18 + labelWidth + 12,
      box: { color: severityStyle.color, width: labelWidth, height: 30, textColor: 'black' },
    })
    for (const line of noteLines.slice(1)) lines.push({ text: line, bold: true })
  } else if (note) {
    addWrapped(note, layout.noteChars, true)
  }

  addWrapped(compactLine([
    opts.buildVersion,
    formatOsLabel(opts.androidVersion),
    opts.deviceModel,
  ]), layout.metaChars)
  const tester = opts.tester?.trim()
  if (opts.testedAtMs != null) {
    addWrapped(`Tester: ${tester || '-'} / ${formatDateTime(opts.testedAtMs)}`, layout.metaChars)
  } else if (tester) {
    addWrapped(`Tester: ${tester}`, layout.metaChars)
  }
  const telemetryLine = opts.telemetryLine?.trim()
  const clipLine = opts.clipStartMs != null && opts.clipEndMs != null
    ? `Clip ${formatClipTime(opts.clipStartMs)} - ${formatClipTime(opts.clipEndMs)}`
    : null
  if (telemetryLine) {
    for (const line of wrapTextLine([telemetryLine, clipLine].filter(Boolean).join(' / '), layout.metaChars)) {
      lines.push({ text: line, bold: false, small: true })
    }
  } else if (clipLine) {
    addWrapped(clipLine, layout.metaChars)
  }
  return lines
}

function captionFilter(lines: CaptionLine[], layout: { x?: number } = {}): string {
  if (lines.length === 0) return ''
  const { regular: regularFont, bold: boldFont } = resolveCaptionFonts()
  const topPad = 18
  const bottomPad = 16
  const lineGap = 8
  const lineHeights = lines.map(line => line.box ? 34 : line.bold ? 31 : line.small ? 19 : 24)
  const captionHeight = topPad + bottomPad + lineHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, lines.length - 1) * lineGap
  const filters = [`pad=iw:ih+${captionHeight}:0:0:color=#d9d9d9`]
  let y = topPad
  for (const line of lines) {
    const fontSize = line.bold ? 25 : line.small ? 14 : 18
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
    y += (line.box ? 34 : line.bold ? 31 : line.small ? 19 : 24) + lineGap
  }
  return filters.join(',')
}

function captionOverlayFilters(lines: CaptionLine[], layout: { x?: number; y: number; height: number }): string[] {
  if (lines.length === 0 || layout.height <= 0) return []
  const { regular: regularFont, bold: boldFont } = resolveCaptionFonts()
  const baseLineHeight = (line: CaptionLine) => line.box ? 34 : line.bold ? 31 : line.small ? 19 : 24
  const baseTotalHeight = 18 + lines.reduce((sum, line) => sum + baseLineHeight(line), 0) + Math.max(0, lines.length - 1) * 8
  const scale = Math.max(0.72, Math.min(1, (layout.height - 12) / Math.max(1, baseTotalHeight)))
  const topPad = Math.max(8, Math.round(18 * scale))
  const lineGap = Math.max(4, Math.round(8 * scale))
  const xBase = layout.x ?? 18
  const filters = [`drawbox=x=0:y=${layout.y}:w=iw:h=${layout.height}:color=#d9d9d9@1:t=fill`]
  let y = layout.y + topPad
  for (const line of lines) {
    const fontSize = Math.max(10, Math.round((line.bold ? 25 : line.small ? 14 : 18) * scale))
    const fontFile = line.bold ? boldFont : regularFont
    const lineHeight = Math.max(13, Math.round(baseLineHeight(line) * scale))
    const x = line.x ?? xBase
    if (line.box) {
      filters.push(`drawbox=x=${x}:y=${y}:w=${line.box.width}:h=${Math.max(22, Math.round(line.box.height * scale))}:color=${line.box.color}@1:t=fill`)
    }
    filters.push(
      `drawtext=fontfile='${fontFile}':text='${escapeDrawtextValue(line.text)}':fontcolor=${line.box?.textColor ?? line.color ?? 'black'}:fontsize=${fontSize}:x=${x + (line.box ? 11 : 0)}:y=${y}`,
    )
    if (line.afterText) {
      filters.push(
        `drawtext=fontfile='${boldFont}':text='${escapeDrawtextValue(line.afterText)}':fontcolor=black:fontsize=${fontSize}:x=${line.afterX ?? 18}:y=${y}`,
      )
    }
    y += lineHeight + lineGap
  }
  return filters
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

function buildLogcatCaptionLines(text: string | null | undefined, maxChars: number, maxLines = 12): CaptionLine[] {
  const value = text?.trim()
  if (!value) return []
  const sourceLines = value
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-maxLines)
  const wrapped = sourceLines.flatMap(line => wrapTextLine(line, maxChars))
  return [
    { text: 'logcat', bold: false, small: true },
    ...wrapped.slice(0, maxLines).map(line => ({ text: line, bold: false, small: true } satisfies CaptionLine)),
  ]
}

function buildContactSheetCaptionLines(opts: ContactSheetOptions, width: number): CaptionLine[] {
  const maxChars = Math.max(42, Math.floor((width - 52) / 7))
  return [
    ...buildCaptionLines(opts, { noteChars: 52, metaChars: 96 }),
    ...buildLogcatCaptionLines(opts.logcatText, maxChars),
  ]
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
  const outputDurationMs = opts.sessionMicPath ? durationMs : opts.narrationPath ? Math.max(durationMs, narrationDurationMs) : durationMs
  const freezeDurationMs = Math.max(0, outputDurationMs - durationMs)
  const filters: string[] = [...clickOverlayFilters(opts.clicks, startMs, endMs)]
  if (freezeDurationMs > 0) filters.push(`tpad=stop_mode=clone:stop_duration=${ms(freezeDurationMs)}`)
  const captionedFilters = videoCaptionFilters(opts, filters)
  if (opts.sessionMicPath || opts.narrationPath) {
    const audioPath = opts.sessionMicPath ?? opts.narrationPath!
    const audioTrimStart = opts.sessionMicPath ? ms(startMs) : '0'
    const videoFilter = [
      `[0:v:0]trim=start=${ms(startMs)}:duration=${ms(durationMs)}`,
      'setpts=PTS-STARTPTS',
      ...captionedFilters,
    ].join(',')
    const audioFilter = `[1:a:0]atrim=start=${audioTrimStart}:duration=${ms(outputDurationMs)},asetpts=PTS-STARTPTS`
    return [
      '-y',
      '-fflags', '+genpts',
      '-i', opts.inputPath,
      '-i', audioPath,
      '-filter_complex', `${videoFilter}[v];${audioFilter}[a]`,
      '-map', '[v]',
      '-map', '[a]',
      '-t', ms(outputDurationMs),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-r', '30',
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
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    opts.outputPath,
  ]
}

export async function extractClip(runner: IProcessRunner, ffmpegPath: string, opts: ClipOptions, runOpts?: SpawnOptions): Promise<void> {
  const args = buildClipArgs(opts)
  const r = runOpts ? await runner.run(ffmpegPath, args, runOpts) : await runner.run(ffmpegPath, args)
  if (r.code !== 0) throw new Error(`ffmpeg failed (code ${r.code}): ${r.stderr.trim()}`)
}

export function buildIntroClipArgs(opts: IntroClipOptions): string[] {
  const startMs = Math.max(0, opts.startMs)
  const endMs = Math.max(0, opts.endMs)
  if (endMs <= startMs) throw new Error(`endMs (${opts.endMs}) must be > startMs (${opts.startMs})`)
  const durationMs = endMs - startMs
  const introDurationMs = Math.max(500, opts.introDurationMs ?? 3_000)
  const introFadeMs = Math.max(0, Math.min(introDurationMs, opts.introFadeMs ?? 500))
  const introDurationSec = ms(introDurationMs)
  const fadeStartSec = ms(Math.max(0, introDurationMs - introFadeMs))
  const fadeDurationSec = ms(introFadeMs)
  const canvasWidth = Math.max(2, Math.floor(opts.canvasWidth / 2) * 2)
  const canvasHeight = Math.max(2, Math.floor(opts.canvasHeight / 2) * 2)
  const clipFilters = clickOverlayFilters(opts.clicks, startMs, endMs)
  const sourceHasAudio = opts.sourceHasAudio ?? true
  const hasSessionMic = Boolean(opts.sessionMicPath)
  const clipFilter = [
    `[1:v:0]trim=start=${ms(startMs)}:duration=${ms(durationMs)}`,
    'setpts=PTS-STARTPTS',
    ...clipFilters,
    'fps=30',
    `scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=decrease`,
    `pad=${canvasWidth}:${canvasHeight}:(ow-iw)/2:0:color=black`,
    'format=yuv420p',
    'setsar=1',
  ].join(',')
  const filterComplex = [
    `[0:v:0]fps=30,scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=decrease,pad=${canvasWidth}:${canvasHeight}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p,setsar=1[introfit]`,
    `[introfit]fade=t=out:st=${fadeStartSec}:d=${fadeDurationSec},format=yuv420p,setsar=1[intro]`,
    `${clipFilter}[clip]`,
    '[intro][clip]concat=n=2:v=1:a=0[v]',
    ...(hasSessionMic
      ? [`[2:a:0]atrim=start=${ms(startMs)}:duration=${ms(durationMs)},asetpts=PTS-STARTPTS,adelay=${introDurationMs}|${introDurationMs}[a]`]
      : sourceHasAudio
        ? [`[1:a:0]atrim=start=${ms(startMs)}:duration=${ms(durationMs)},asetpts=PTS-STARTPTS,adelay=${introDurationMs}|${introDurationMs}[a]`]
        : []),
  ].join(';')

  return [
    '-y',
    '-fflags', '+genpts',
    '-loop', '1',
    '-framerate', '30',
    '-t', introDurationSec,
    '-i', opts.introImagePath,
    '-i', opts.inputPath,
    ...(opts.sessionMicPath ? ['-i', opts.sessionMicPath] : []),
    '-filter_complex', filterComplex,
    '-map', '[v]',
    ...(hasSessionMic || sourceHasAudio ? ['-map', '[a]'] : []),
    '-t', ms(introDurationMs + durationMs),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    ...(hasSessionMic || sourceHasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
    '-max_muxing_queue_size', '4096',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    opts.outputPath,
  ]
}

export async function extractClipWithIntro(runner: IProcessRunner, ffmpegPath: string, opts: IntroClipOptions, runOpts?: SpawnOptions): Promise<void> {
  const args = buildIntroClipArgs(opts)
  const r = runOpts ? await runner.run(ffmpegPath, args, runOpts) : await runner.run(ffmpegPath, args)
  if (r.code !== 0) throw new Error(`ffmpeg intro clip failed (code ${r.code}): ${r.stderr.trim()}`)
}

export function buildContactSheetArgs(opts: ContactSheetOptions): string[] {
  const startMs = Math.max(0, opts.startMs)
  const endMs = Math.max(0, opts.endMs)
  if (endMs <= startMs) throw new Error(`endMs (${opts.endMs}) must be > startMs (${opts.startMs})`)
  const durationMs = endMs - startMs
  const fps = (6_000 / durationMs).toFixed(6)
  const tileWidth = opts.tileWidth ?? 240
  const tileHeight = opts.tileHeight === undefined ? 426 : opts.tileHeight
  const outputWidth = opts.outputWidth ? Math.max(2, Math.floor(opts.outputWidth / 2) * 2) : null
  const outputHeight = opts.outputHeight ? Math.max(2, Math.floor(opts.outputHeight / 2) * 2) : null
  const gridWidth = tileWidth * 3
  const gridHeight = tileHeight ? tileHeight * 2 : null
  const scaleAndPad = tileHeight
    ? [
        `scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease`,
        `pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
      ]
    : [
        `scale=${tileWidth}:-2`,
      ]
  const filters = [
    `trim=start=${ms(startMs)}:duration=${ms(durationMs)}`,
    'setpts=PTS-STARTPTS',
    `fps=${fps}`,
    ...scaleAndPad,
    'tile=3x2',
    ...(outputWidth && outputHeight
      ? [`pad=${outputWidth}:${outputHeight}:(ow-iw)/2:0:color=black`]
      : outputWidth && outputWidth > gridWidth
        ? [`pad=${outputWidth}:ih:(ow-iw)/2:0:color=black`]
        : []),
  ]
  const captionLines = buildContactSheetCaptionLines(opts, outputWidth ?? gridWidth)
  if (captionLines.length > 0) {
    if (outputHeight && gridHeight && outputHeight > gridHeight) {
      filters.push(...captionOverlayFilters(captionLines, { x: 26, y: gridHeight, height: outputHeight - gridHeight }))
    } else {
      filters.push(captionFilter(captionLines, { x: 26 }))
    }
  }
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

export async function extractContactSheet(runner: IProcessRunner, ffmpegPath: string, opts: ContactSheetOptions, runOpts?: SpawnOptions): Promise<void> {
  const args = buildContactSheetArgs(opts)
  const r = runOpts ? await runner.run(ffmpegPath, args, runOpts) : await runner.run(ffmpegPath, args)
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

export async function assertVideoInputReadable(runner: IProcessRunner, ffmpegPath: string, opts: VideoInputReadableOptions): Promise<void> {
  const r = await runner.run(ffmpegPath, [
    '-v', 'error',
    '-i', opts.inputPath,
    '-map', '0:v:0',
    '-frames:v', '1',
    '-f', 'null',
    '-',
  ]).catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    return { code: -1, stdout: '', stderr: message }
  })
  if (r.code === 0) return

  const streamInfo = await runner.run(ffmpegPath, [
    '-hide_banner',
    '-i',
    opts.inputPath,
  ]).catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    return { code: -1, stdout: '', stderr: message }
  })

  const detail = streamInfo.stderr.trim() || streamInfo.stdout.trim() || r.stderr.trim() || r.stdout.trim() || 'no readable video stream was found'
  const hint = /moov atom not found|Invalid data found when processing input/i.test(detail)
    ? 'The recording looks incomplete or corrupt, usually because scrcpy stopped before the MP4 metadata was finalized.'
    : 'The recording could not be opened as a video file.'
  throw new Error(`Cannot export this session because the source recording is not readable: ${opts.inputPath}\n${hint}\n${detail}`)
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
