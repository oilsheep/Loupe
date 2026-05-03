import type { TranscriptSegment, TranscriptToken } from './transcript'

type ChineseScript = 'zh-TW' | 'zh-CN'

const PAIRS: Array<[string, string]> = [
  ['記', '记'], ['錄', '录'], ['標', '标'], ['點', '点'], ['測', '测'], ['試', '试'],
  ['錯', '错'], ['誤', '误'], ['問', '问'], ['題', '题'], ['觸', '触'], ['發', '发'],
  ['開', '开'], ['關', '关'], ['顯', '显'], ['視', '视'], ['畫', '画'], ['檔', '档'],
  ['輸', '输'], ['匯', '汇'], ['導', '导'], ['轉', '转'], ['語', '语'], ['音', '音'],
  ['體', '体'], ['簡', '简'], ['繁', '繁'], ['錄製', '录制'], ['螢幕', '屏幕'],
  ['應用程式', '应用程序'], ['資訊', '信息'], ['裝置', '设备'], ['電腦', '电脑'],
]

function replaceAllLiteral(text: string, from: string, to: string): string {
  return text.split(from).join(to)
}

export function convertChineseText(text: string, script?: ChineseScript): string {
  if (!script || !text) return text
  return PAIRS.reduce((out, [traditional, simplified]) => {
    return script === 'zh-TW'
      ? replaceAllLiteral(out, simplified, traditional)
      : replaceAllLiteral(out, traditional, simplified)
  }, text)
}

function convertToken(token: TranscriptToken, script: ChineseScript): TranscriptToken {
  return { ...token, text: convertChineseText(token.text, script) }
}

export function convertTranscriptChineseScript(segments: TranscriptSegment[], script?: ChineseScript): TranscriptSegment[] {
  if (!script) return segments
  return segments.map(segment => ({
    ...segment,
    text: convertChineseText(segment.text, script),
    ...(segment.tokens?.length ? { tokens: segment.tokens.map(token => convertToken(token, script)) } : {}),
  }))
}
