export function normalizeSlackMentionIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(' ') : String(value ?? '')
  const ids = raw
    .split(/[\s,;]+/)
    .map(part => part.trim().replace(/^<@([^>|]+)(?:\|[^>]+)?>$/, '$1'))
    .map(part => part.replace(/^@/, ''))
    .filter(Boolean)
  return Array.from(new Set(ids))
}

export function normalizeMentionAliases(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const aliases: Record<string, string> = {}
  for (const [id, label] of Object.entries(value)) {
    const normalizedId = normalizeSlackMentionIds([id])[0]
    const normalizedLabel = typeof label === 'string' ? label.trim() : ''
    if (normalizedId && normalizedLabel) aliases[normalizedId] = normalizedLabel
  }
  return aliases
}

export function mentionLabel(id: string, aliases: Record<string, string>): string {
  return aliases[id]?.trim() || id
}

export function slackMentionText(userIds: string[]): string {
  return normalizeSlackMentionIds(userIds)
    .map(id => `<@${id}>`)
    .join(' ')
}

export function appendMentionLine(text: string, mentionText: string): string {
  const mention = mentionText.trim()
  if (!mention) return text
  return `${mention}\n${text}`
}
