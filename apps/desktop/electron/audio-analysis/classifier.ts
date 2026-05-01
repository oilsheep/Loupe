import type { BugSeverity, SeveritySettings } from '@shared/types'
import type { TranscriptSegment, TranscriptToken } from './transcript'

export interface MarkerSuggestion {
  offsetMs: number
  severity: BugSeverity
  note: string
  sourceText: string
  preSec: number
  postSec: number
}

export interface MarkerSuggestionOptions {
  severities?: SeveritySettings
  triggerKeywords?: string
}

const DEFAULT_TRIGGER_KEYWORDS = ['記錄', '紀錄', '记录', '標記', 'record', 'mark', 'log', '記録', 'マーク', 'ログ', '기록', '마크', '로그', 'grabar', 'marcar', 'registrar']
const TRIGGER_ASR_ALIASES: Record<string, string[]> = {
  記錄: ['记录', '記住', '记住', 'zero', 'ziru', 'zilu', 'jilu', '基督', '祝福', '進入', '进入'],
  紀錄: ['记录', '記住', '记住', 'zero', 'ziru', 'zilu', 'jilu', '基督', '祝福', '進入', '进入'],
  记录: ['記錄', '紀錄', '記住', '记住', 'zero', 'ziru', 'zilu', 'jilu', '基督', '祝福', '進入', '进入'],
  記録: ['记录', '記住', '记住', 'zero', 'ziru', 'zilu', 'jilu', '基督', '祝福', '進入', '进入'],
}
const LABEL_ASR_ALIASES: Partial<Record<BugSeverity, Record<string, string[]>>> = {
  major: {
    critical: ['crito', 'critto', 'crital', 'criter', 'critico', 'criticalo', 'kritikal', 'crítico', 'creatical', 'cretical'],
  },
  normal: {
    bug: ['bag', 'buck', 'pack', 'bugged', '\u5df4\u514b', '\u5df4\u683c', '\u9738\u514b', '\u9738\u683c', '\u62cd\u683c'],
  },
  minor: {
    polish: ['palish', 'pullage', 'pullish', 'polish'],
  },
}
const RECORD_TRIGGER_KEYWORDS = ['\u8a18\u9304', '\u7d00\u9304', '\u8bb0\u5f55', '\u7eaa\u5f55', '\u8a18\u9332', '\u6a19\u8a18', '\u6807\u8bb0', '\u30de\u30fc\u30af', '\u30ed\u30b0', '\uae30\ub85d', '\ub9c8\ud06c', '\ub85c\uadf8']
const RECORD_TRIGGER_ASR_ALIASES = [
  'zero',
  'ziru',
  'zilu',
  'jilu',
  '\u57fa\u7763',
  '\u8a18\u4f4f',
  '\u8bb0\u4f4f',
  '\u9032\u5165',
  '\u8fdb\u5165',
  '\u63a5\u4f4f',
  '\u63a5\u8457',
  '\u63a5\u7740',
  '\u5730\u7344',
  '\u5730\u72f1',
  '\u8a18\u9678',
  '\u8bb0\u9646',
]
const SEVERITY_ORDER: BugSeverity[] = ['major', 'normal', 'minor', 'improvement', 'note', 'custom1', 'custom2', 'custom3', 'custom4']
const FALLBACK_LABELS: Record<BugSeverity, string[]> = {
  note: ['note'],
  major: ['critical', 'major'],
  normal: ['bug', 'normal'],
  minor: ['polish', 'minor'],
  improvement: ['note', 'improvement'],
  custom1: [],
  custom2: [],
  custom3: [],
  custom4: [],
}
const COMMAND_RADIUS = 24
const NOTE_CONTEXT_MS = 10_000
const MAX_NOTE_LENGTH = 800

interface AlignedText {
  value: string
  sourceIndexes: number[]
}

interface CommandMatch {
  severity: BugSeverity
  trigger: string
  label: string
  triggerIndex: number
  labelIndex: number
}

interface TimedCommandMatch {
  segment: TranscriptSegment
  match: CommandMatch
  offsetMs: number
  endMs: number
  sourceStart: number
  sourceEnd: number
}

function compactText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function alignText(text: string): AlignedText {
  let value = ''
  const sourceIndexes: number[] = []
  Array.from(text.toLowerCase()).forEach((char, sourceIndex) => {
    if (/\s/u.test(char)) return
    value += char
    sourceIndexes.push(sourceIndex)
  })
  return { value, sourceIndexes }
}

function alignedValue(text: string): string {
  return alignText(text).value
}

const CHINESE_VARIANT_PAIRS: Array<[string, string]> = [
  ['\u8a18', '\u8bb0'],
  ['\u7d00', '\u7eaa'],
  ['\u9304', '\u5f55'],
  ['\u6a19', '\u6807'],
  ['\u8a8c', '\u5fd7'],
  ['\u9ede', '\u70b9'],
  ['\u9ede', '\u70b9'],
  ['\u56b4', '\u4e25'],
  ['\u932f', '\u9519'],
  ['\u8aa4', '\u8bef'],
  ['\u554f', '\u95ee'],
  ['\u984c', '\u9898'],
  ['\u89f8', '\u89e6'],
  ['\u767c', '\u53d1'],
  ['\u958b', '\u5f00'],
  ['\u95dc', '\u5173'],
  ['\u8853', '\u672f'],
  ['\u66f8', '\u4e66'],
]

function replaceAllLiteral(text: string, from: string, to: string): string {
  return text.split(from).join(to)
}

function expandChineseScriptVariants(text: string): string[] {
  let variants = new Set([text])
  for (const [traditional, simplified] of CHINESE_VARIANT_PAIRS) {
    const next = new Set(variants)
    for (const value of variants) {
      if (value.includes(traditional)) next.add(replaceAllLiteral(value, traditional, simplified))
      if (value.includes(simplified)) next.add(replaceAllLiteral(value, simplified, traditional))
    }
    variants = next
    if (variants.size > 64) break
  }
  return [...variants]
}

function expandTriggerVariants(keyword: string): string[] {
  const expanded = new Set<string>()
  for (const variant of expandChineseScriptVariants(keyword)) {
    expanded.add(variant)
    for (const alias of TRIGGER_ASR_ALIASES[variant] ?? []) expanded.add(alias)
    if (isRecordTriggerKeyword(variant)) {
      for (const alias of RECORD_TRIGGER_ASR_ALIASES) expanded.add(alias)
    }
  }
  return [...expanded]
}

function isRecordTriggerKeyword(keyword: string): boolean {
  const value = alignedValue(keyword)
  return RECORD_TRIGGER_KEYWORDS.some(candidate => value === alignedValue(candidate))
}

function expandLabelVariants(severity: BugSeverity, label: string): string[] {
  const expanded = new Set<string>()
  for (const variant of expandChineseScriptVariants(label)) {
    expanded.add(variant)
    for (const alias of LABEL_ASR_ALIASES[severity]?.[variant.toLowerCase()] ?? []) expanded.add(alias)
  }
  return [...expanded]
}

function parseTriggerKeywords(raw?: string): string[] {
  const parsed = (raw ?? '')
    .split(/[,\n，、;；]/u)
    .map(item => item.trim())
    .filter(Boolean)
  const all = parsed.length > 0 ? parsed : DEFAULT_TRIGGER_KEYWORDS
  const expanded = all.flatMap(expandTriggerVariants)
  return [...new Set(expanded.map(item => alignedValue(item)).filter(Boolean))]
}

function labelNeedlesForSeverity(severities: SeveritySettings | undefined, severity: BugSeverity): string[] {
  const configured = severities?.[severity]?.label?.trim()
  const labels = [
    configured,
    ...FALLBACK_LABELS[severity],
  ].filter((item): item is string => Boolean(item?.trim()))
  const expanded = labels.flatMap(item => expandLabelVariants(severity, item))
  return [...new Set(expanded.map(item => alignedValue(item)).filter(Boolean))]
}

function findIndexes(text: string, needle: string): number[] {
  if (!needle) return []
  const indexes: number[] = []
  let index = text.indexOf(needle)
  while (index >= 0) {
    indexes.push(index)
    index = text.indexOf(needle, index + Math.max(1, needle.length))
  }
  return indexes
}

function isLatinWordNeedle(needle: string): boolean {
  return /^[a-z0-9_]+$/iu.test(needle)
}

function isLatinWordChar(char: string | undefined): boolean {
  return Boolean(char && /[a-z0-9_]/iu.test(char))
}

function isValidAlignedNeedle(sourceText: string, aligned: AlignedText, alignedIndex: number, alignedLength: number, needle: string): boolean {
  if (!isLatinWordNeedle(needle)) return true
  const sourceStart = aligned.sourceIndexes[alignedIndex]
  const sourceEnd = aligned.sourceIndexes[alignedIndex + alignedLength - 1]
  if (sourceStart === undefined || sourceEnd === undefined) return false
  return !isLatinWordChar(sourceText[sourceStart - 1]) && !isLatinWordChar(sourceText[sourceEnd + 1])
}

function findCommandMatches(segment: TranscriptSegment, options: MarkerSuggestionOptions): CommandMatch[] {
  const aligned = alignText(segment.text)
  if (!aligned.value) return []
  const triggers = parseTriggerKeywords(options.triggerKeywords)
  const bestByTrigger = new Map<number, CommandMatch>()

  for (const trigger of triggers) {
    for (const triggerIndex of findIndexes(aligned.value, trigger)) {
      if (!isValidAlignedNeedle(segment.text, aligned, triggerIndex, trigger.length, trigger)) continue
      for (const severity of SEVERITY_ORDER) {
        for (const label of labelNeedlesForSeverity(options.severities, severity)) {
          if (!label) continue
          for (const labelIndex of findIndexes(aligned.value, label)) {
            if (!isValidAlignedNeedle(segment.text, aligned, labelIndex, label.length, label)) continue
            if (labelIndex === triggerIndex && label === trigger) continue
            const commandFirstDistance = labelIndex - (triggerIndex + trigger.length)
            const labelFirstDistance = triggerIndex - (labelIndex + label.length)
            const isNearby = (
              (commandFirstDistance >= 0 && commandFirstDistance <= COMMAND_RADIUS) ||
              (labelFirstDistance >= 0 && labelFirstDistance <= COMMAND_RADIUS)
            )
            if (!isNearby) continue
            const candidate = { severity, trigger, label, triggerIndex, labelIndex }
            const existing = bestByTrigger.get(triggerIndex)
            if (!existing || commandCandidateScore(candidate) < commandCandidateScore(existing)) {
              bestByTrigger.set(triggerIndex, candidate)
            }
          }
        }
      }
    }
  }

  return [...bestByTrigger.values()].sort((a, b) => commandSortKey(a) - commandSortKey(b))
}

function commandSortKey(match: CommandMatch): number {
  const first = Math.min(match.triggerIndex, match.labelIndex)
  const distance = Math.abs(match.triggerIndex - match.labelIndex)
  return first * 1000 + distance
}

function commandCandidateScore(match: CommandMatch): number {
  const distance = Math.abs(match.triggerIndex - match.labelIndex)
  const directionPenalty = match.labelIndex >= match.triggerIndex ? 0 : 10_000
  const severityRank = SEVERITY_ORDER.indexOf(match.severity)
  return directionPenalty + distance * 100 + (severityRank >= 0 ? severityRank : 99)
}

function tokenAtAlignedIndex(segment: TranscriptSegment, alignedIndex: number): TranscriptToken | null {
  let cursor = 0
  for (const token of segment.tokens ?? []) {
    const tokenLength = alignedValue(token.text).length
    if (tokenLength <= 0) continue
    if (alignedIndex < cursor + tokenLength) return token
    cursor += tokenLength
  }
  return null
}

function tokenAtSourceIndex(segment: TranscriptSegment, sourceIndex: number): TranscriptToken | null {
  if (!segment.tokens?.length) return null
  const source = segment.text.toLowerCase()
  let cursor = 0
  for (const token of segment.tokens) {
    const text = token.text.trim().toLowerCase()
    if (!text) continue
    const index = source.indexOf(text, cursor)
    if (index < 0) continue
    const end = index + text.length
    if (sourceIndex >= index && sourceIndex < end) return token
    cursor = end
  }
  return null
}

function estimateOffsetAtAlignedIndex(segment: TranscriptSegment, alignedIndex: number): number {
  const alignedLength = alignedValue(segment.text).length
  if (alignedLength <= 0) return segment.startMs
  const duration = Math.max(0, segment.endMs - segment.startMs)
  const ratio = Math.min(1, Math.max(0, alignedIndex / alignedLength))
  return Math.round(segment.startMs + duration * ratio)
}

function markerOffsetForCommand(segment: TranscriptSegment, match: CommandMatch): number {
  const aligned = alignText(segment.text)
  const sourceIndex = aligned.sourceIndexes[match.triggerIndex]
  const token = sourceIndex === undefined ? tokenAtAlignedIndex(segment, match.triggerIndex) : tokenAtSourceIndex(segment, sourceIndex) ?? tokenAtAlignedIndex(segment, match.triggerIndex)
  if (token) return Math.max(segment.startMs, Math.min(segment.endMs, token.startMs))
  return estimateOffsetAtAlignedIndex(segment, match.triggerIndex)
}

function markerEndForCommand(segment: TranscriptSegment, match: CommandMatch): number {
  const endIndex = Math.max(match.triggerIndex + match.trigger.length, match.labelIndex + match.label.length)
  const aligned = alignText(segment.text)
  const sourceIndex = aligned.sourceIndexes[Math.max(0, endIndex - 1)]
  const token = sourceIndex === undefined ? tokenAtAlignedIndex(segment, Math.max(0, endIndex - 1)) : tokenAtSourceIndex(segment, sourceIndex) ?? tokenAtAlignedIndex(segment, Math.max(0, endIndex - 1))
  if (token) return Math.max(segment.startMs, Math.min(segment.endMs, token.endMs))
  return estimateOffsetAtAlignedIndex(segment, endIndex)
}

function sourceRangeForCommand(segment: TranscriptSegment, match: CommandMatch): { sourceStart: number; sourceEnd: number } {
  const aligned = alignText(segment.text)
  const startIndex = Math.min(match.triggerIndex, match.labelIndex)
  const endIndex = Math.max(match.triggerIndex + match.trigger.length, match.labelIndex + match.label.length)
  const sourceStart = aligned.sourceIndexes[startIndex] ?? 0
  const sourceEnd = (aligned.sourceIndexes[Math.max(0, endIndex - 1)] ?? Math.max(0, segment.text.length - 1)) + 1
  return { sourceStart, sourceEnd }
}

function isCjk(char: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u.test(char)
}

function joinTranscriptTokens(tokens: TranscriptToken[]): string {
  let output = ''
  for (const token of tokens) {
    const text = token.text.trim()
    if (!text) continue
    if (!output) {
      output = text
      continue
    }
    const prev = output.at(-1) ?? ''
    const next = text.at(0) ?? ''
    const needsSpace = !isCjk(prev) && !isCjk(next) && !/^[,.!?;:，。！？、；：）\])}]/u.test(next)
    output += needsSpace ? ` ${text}` : text
  }
  return output
}

function textForSegmentWindow(segment: TranscriptSegment, startMs: number, endMs: number): string {
  const tokens = (segment.tokens ?? []).filter(token => token.endMs > startMs && token.startMs < endMs)
  if (tokens.length > 0) return joinTranscriptTokens(tokens)
  if (segment.endMs >= startMs && segment.startMs <= endMs) return compactText(segment.text)
  return ''
}

function contextTextForWindow(segments: TranscriptSegment[], startMs: number, endMs: number): string {
  const text = compactText(
    segments
      .map(segment => textForSegmentWindow(segment, startMs, endMs))
      .filter(Boolean)
      .join(' '),
  )
  if (text.length <= MAX_NOTE_LENGTH) return text
  return `${text.slice(0, MAX_NOTE_LENGTH - 3)}...`
}

function textBetweenCommands(
  segments: TranscriptSegment[],
  command: TimedCommandMatch,
  next: TimedCommandMatch | undefined,
  endMs: number,
): string {
  const parts: string[] = []
  for (const segment of segments) {
    if (segment.endMs <= command.endMs && segment !== command.segment) continue
    if (segment.startMs >= endMs && segment !== command.segment) continue

    if (segment === command.segment) {
      const endSource = next?.segment === segment ? next.sourceStart : segment.text.length
      parts.push(segment.text.slice(command.sourceEnd, Math.max(command.sourceEnd, endSource)))
      continue
    }

    if (next?.segment === segment) {
      parts.push(segment.text.slice(0, next.sourceStart))
      break
    }

    if (next && segment.startMs >= next.offsetMs) break
    parts.push(segment.text)
  }
  return compactText(parts.filter(Boolean).join(' '))
}

function textAfterCommandUntilNext(
  segments: TranscriptSegment[],
  command: TimedCommandMatch,
  next: TimedCommandMatch | undefined,
  options: MarkerSuggestionOptions,
): string {
  const endMs = next && next.offsetMs - command.offsetMs < NOTE_CONTEXT_MS * 2
    ? next.offsetMs
    : command.offsetMs + NOTE_CONTEXT_MS
  const boundedBody = textBetweenCommands(segments, command, next, endMs)
  if (boundedBody) return cleanNoteText(boundedBody.length <= MAX_NOTE_LENGTH ? boundedBody : `${boundedBody.slice(0, MAX_NOTE_LENGTH - 3)}...`, options)
  if (next) return ''

  if (!command.segment.tokens?.length) {
    const body = compactText(command.segment.text.slice(command.sourceEnd))
    return cleanNoteText(body.length <= MAX_NOTE_LENGTH ? body : `${body.slice(0, MAX_NOTE_LENGTH - 3)}...`, options)
  }

  const tokenText = compactText(
    segments
      .map(segment => textForSegmentWindow(segment, command.endMs, endMs))
      .filter(Boolean)
      .join(' '),
  )
  if (tokenText) return cleanNoteText(tokenText.length <= MAX_NOTE_LENGTH ? tokenText : `${tokenText.slice(0, MAX_NOTE_LENGTH - 3)}...`, options)
  return ''
}

function cleanNoteText(text: string, options: MarkerSuggestionOptions): string {
  let cleaned = compactText(text)
  for (let pass = 0; pass < 4; pass += 1) {
    const matches = findCommandMatches({ startMs: 0, endMs: cleaned.length, text: cleaned }, options)
    if (matches.length === 0) break
    const ranges = matches
      .map(match => sourceRangeForCommand({ startMs: 0, endMs: cleaned.length, text: cleaned }, match))
      .sort((a, b) => a.sourceStart - b.sourceStart)
    let cursor = 0
    let next = ''
    for (const range of ranges) {
      if (range.sourceStart < cursor) continue
      next += cleaned.slice(cursor, range.sourceStart)
      cursor = Math.max(cursor, range.sourceEnd)
    }
    next += cleaned.slice(cursor)
    cleaned = compactText(next.replace(/^[\s,，、:：;；.。!?！？-]+|[\s,，、:：;；.。!?！？-]+$/gu, ''))
  }
  return hasSemanticText(cleaned) ? cleaned : ''
}

function hasSemanticText(text: string): boolean {
  return /[\p{L}\p{N}\u3400-\u9fff]/u.test(text)
}

export function transcriptToMarkerSuggestions(
  segments: TranscriptSegment[],
  options: MarkerSuggestionOptions = {},
): MarkerSuggestion[] {
  const commands: TimedCommandMatch[] = []
  for (const segment of segments) {
    const sourceText = compactText(segment.text)
    if (!sourceText) continue
    for (const match of findCommandMatches(segment, options)) {
      const range = sourceRangeForCommand(segment, match)
      commands.push({
        segment,
        match,
        offsetMs: Math.max(0, markerOffsetForCommand(segment, match)),
        endMs: Math.max(0, markerEndForCommand(segment, match)),
        sourceStart: range.sourceStart,
        sourceEnd: range.sourceEnd,
      })
    }
  }

  const sorted = commands.sort((a, b) => a.offsetMs - b.offsetMs)
  const suggestions: MarkerSuggestion[] = []
  for (let index = 0; index < sorted.length; index += 1) {
    const command = sorted[index]
    const next = sorted[index + 1]
    const sourceText = compactText(command.segment.text)
    suggestions.push({
      offsetMs: command.offsetMs,
      severity: command.match.severity,
      sourceText,
      preSec: 10,
      postSec: 10,
      note: textAfterCommandUntilNext(segments, command, next, options),
    })
  }
  return suggestions
}
