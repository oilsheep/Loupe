export interface TranscriptSegment {
  startMs: number
  endMs: number
  text: string
  tokens?: TranscriptToken[]
}

export interface TranscriptToken {
  startMs: number
  endMs: number
  text: string
}

function toMs(value: unknown, numericIsMs = false): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return numericIsMs || value > 10_000 ? Math.round(value) : Math.round(value * 1000)
  }
  if (typeof value !== 'string') return 0
  const text = value.trim()
  const clock = text.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/)
  if (clock) {
    const [, h, m, s] = clock
    return Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000)
  }
  const numeric = Number(text.replace(',', '.'))
  return Number.isFinite(numeric) ? toMs(numeric, numericIsMs) : 0
}

function fromSegment(raw: any): TranscriptSegment | null {
  if (!raw || typeof raw !== 'object') return null
  const text = String(raw.text ?? raw.sentence ?? '').trim()
  if (!text) return null
  const offsets = raw.offsets ?? raw.timestamps ?? raw
  const numericIsMs = Boolean(raw.offsets)
  const startMs = toMs(offsets.from ?? offsets.start ?? raw.start, numericIsMs)
  const endMs = Math.max(startMs, toMs(offsets.to ?? offsets.end ?? raw.end, numericIsMs))
  const tokens = Array.isArray(raw.tokens)
    ? raw.tokens
        .map((token: any): TranscriptToken | null => {
          const tokenText = String(token?.text ?? '').trim()
          if (!tokenText || tokenText.startsWith('[_')) return null
          const tokenOffsets = token.offsets ?? token.timestamps ?? token
          const tokenNumericIsMs = Boolean(token.offsets)
          const tokenStartMs = toMs(tokenOffsets.from ?? tokenOffsets.start ?? token.start, tokenNumericIsMs)
          const tokenEndMs = Math.max(tokenStartMs, toMs(tokenOffsets.to ?? tokenOffsets.end ?? token.end, tokenNumericIsMs))
          return { startMs: tokenStartMs, endMs: tokenEndMs, text: tokenText }
        })
        .filter((token: TranscriptToken | null): token is TranscriptToken => Boolean(token))
    : undefined
  return { startMs, endMs, text, ...(tokens?.length ? { tokens } : {}) }
}

export function normalizeTranscriptJson(raw: unknown): TranscriptSegment[] {
  const root = raw as any
  const candidates: unknown[] = Array.isArray(root)
    ? root
    : Array.isArray(root?.transcription)
      ? root.transcription
      : Array.isArray(root?.segments)
        ? root.segments
        : []
  const segments = candidates
    .map(fromSegment)
    .filter((segment): segment is TranscriptSegment => Boolean(segment))
  return segments.sort((a: TranscriptSegment, b: TranscriptSegment) => a.startMs - b.startMs)
}
