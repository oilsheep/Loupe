export const AUDIO_ANALYSIS_LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'System / Auto' },
  { value: 'zh', label: 'Chinese' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
] as const

export const CHINESE_SCRIPT_OPTIONS = [
  { value: 'zh-TW', label: 'Traditional Chinese' },
  { value: 'zh-CN', label: 'Simplified Chinese' },
] as const

export const TRIGGER_PRESETS: Record<string, { words: string; hint: string }> = {
  auto: {
    words: 'record, mark, log, 記錄, 紀錄, 標記, 记录, 标记, 記一下, 记一下, マーク, ログ, 기록, 마크, 로그, grabar, marcar, registrar',
    hint: 'Say trigger + label, for example "record Bug", "record Critical", "記錄 Bug", or "標記 Critical".',
  },
  zh: {
    words: '記錄, 紀錄, 標記, 记录, 标记, 記一下, 记一下',
    hint: '說「觸發詞 + 標籤」，例如「記錄 Bug」、「標記 Critical」，再描述問題。',
  },
  en: {
    words: 'record, mark, log',
    hint: 'Say trigger + label, for example "record Bug" or "record Critical", then describe the issue.',
  },
  ja: {
    words: '記録, マーク, ログ',
    hint: '「記録 Bug」や「マーク Critical」のように、トリガーとラベルを続けて話します。',
  },
  ko: {
    words: '기록, 마크, 로그',
    hint: '"기록 Bug" 또는 "마크 Critical"처럼 트리거와 라벨을 이어서 말합니다.',
  },
  es: {
    words: 'grabar, marcar, registrar',
    hint: 'Di disparador + etiqueta, por ejemplo "grabar Bug" o "marcar Critical".',
  },
}

export function triggerPreset(language: string): { words: string; hint: string } {
  return TRIGGER_PRESETS[language] ?? TRIGGER_PRESETS.auto
}

export function normalizeTriggerWords(value: string): string {
  return value.split(/[,;\n、，]+/u).map(item => item.trim()).filter(Boolean).join(', ').toLowerCase()
}

export function isPresetTriggerWords(value: string): boolean {
  const normalized = normalizeTriggerWords(value)
  return Object.values(TRIGGER_PRESETS).some(preset => normalizeTriggerWords(preset.words) === normalized)
}
