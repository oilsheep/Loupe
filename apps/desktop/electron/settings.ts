import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AppLocale, AppSettings, AudioAnalysisSettings, BugSeverity, CommonSessionSettings, GitLabMentionUser, GitLabPublishSettings, GooglePublishSettings, HotkeySettings, MentionIdentity, RecordingPreferences, SeveritySettings, SlackChannel, SlackMentionUser, SlackPublishSettings } from '@shared/types'
import { normalizeMentionAliases, normalizeSlackMentionIds } from './mention-format'
import { GOOGLE_OAUTH_CONFIG } from './google-oauth-config'

export const DEFAULT_HOTKEYS: HotkeySettings = {
  improvement: 'F6',
  minor: 'F7',
  normal: 'F8',
  major: 'F9',
}

export const DEFAULT_SEVERITIES: SeveritySettings = {
  note: { label: 'default', color: '#a1a1aa' },
  major: { label: 'Critical', color: '#ff4d4f' },
  normal: { label: 'Bug', color: '#f59e0b' },
  minor: { label: 'Polish', color: '#22b8f0' },
  improvement: { label: 'Note', color: '#22c55e' },
  custom1: { label: '', color: '#8b5cf6' },
  custom2: { label: '', color: '#ec4899' },
  custom3: { label: '', color: '#14b8a6' },
  custom4: { label: '', color: '#eab308' },
}

export const DEFAULT_AUDIO_ANALYSIS: AudioAnalysisSettings = {
  enabled: true,
  engine: 'faster-whisper',
  modelPath: 'small',
  language: 'auto',
  triggerKeywords: '記錄, 紀錄, 记录, 標記, record, mark, log, 記録, マーク, ログ, 기록, 마크, 로그, grabar, marcar, registrar',
  showTriggerWords: false,
}
DEFAULT_AUDIO_ANALYSIS.chineseScript = 'zh-TW'
DEFAULT_AUDIO_ANALYSIS.triggerKeywords = 'record, mark, log, 記錄, 紀錄, 標記, 记录, 标记, 記一下, 记一下, マーク, ログ, 기록, 마크, 로그, grabar, marcar, registrar'

export const DEFAULT_COMMON_SESSION: CommonSessionSettings = {
  platforms: ['ios', 'android', 'windows', 'macOS', 'linux'],
  projects: [],
  testers: [],
  lastPlatform: '',
  lastProject: '',
  lastTester: '',
}

export const DEFAULT_RECORDING_PREFERENCES: RecordingPreferences = {
  recordMic: true,
  iosLaunchApp: true,
  recordSystemAudio: false,
}

const REQUIRED_SEVERITY_KEYS = ['note', 'major', 'normal', 'minor', 'improvement'] as const
const OPTIONAL_SEVERITY_KEYS = ['custom1', 'custom2', 'custom3', 'custom4'] as const
const SEVERITY_KEYS: BugSeverity[] = [...REQUIRED_SEVERITY_KEYS, ...OPTIONAL_SEVERITY_KEYS]
const LEGACY_DEFAULT_LABELS: Partial<Record<BugSeverity, string>> = {
  note: 'note',
  major: 'major',
  normal: 'normal',
  minor: 'minor',
  improvement: 'improvement',
}

function normalizeHotkeys(raw?: Partial<HotkeySettings> & { note?: string }): HotkeySettings {
  return {
    improvement: raw?.improvement || DEFAULT_HOTKEYS.improvement,
    minor: raw?.minor || DEFAULT_HOTKEYS.minor,
    normal: raw?.normal || DEFAULT_HOTKEYS.normal,
    major: raw?.major || DEFAULT_HOTKEYS.major,
  }
}

function normalizeSlack(raw?: Partial<SlackPublishSettings>): SlackPublishSettings {
  const mentionUserIds = normalizeSlackMentionIds(raw?.mentionUserIds)
  const mentionAliases = normalizeMentionAliases(raw?.mentionAliases)
  const mentionUsers = normalizeSlackMentionUsers(raw?.mentionUsers)
  for (const user of mentionUsers) {
    const label = user.displayName || user.realName || user.name
    if (label) mentionAliases[user.id] = label
  }
  const knownIds = new Set([...mentionUserIds, ...mentionUsers.map(user => user.id)])
  const publishIdentity = raw?.publishIdentity === 'bot'
    ? 'bot'
    : raw?.publishIdentity === 'user'
      ? 'user'
      : raw?.botToken && !raw?.userToken
        ? 'bot'
        : 'user'
  return {
    botToken: raw?.botToken || '',
    userToken: raw?.userToken || '',
    publishIdentity,
    channelId: raw?.channelId || '',
    oauthClientId: raw?.oauthClientId || '',
    oauthClientSecret: raw?.oauthClientSecret || '',
    oauthRedirectUri: 'loupe://slack-oauth',
    oauthUserId: raw?.oauthUserId || '',
    oauthTeamId: raw?.oauthTeamId || '',
    oauthTeamName: raw?.oauthTeamName || '',
    oauthConnectedAt: typeof raw?.oauthConnectedAt === 'string' ? raw.oauthConnectedAt : null,
    oauthUserScopes: Array.isArray(raw?.oauthUserScopes)
      ? raw.oauthUserScopes.map(scope => String(scope).trim()).filter(Boolean)
      : [],
    channels: normalizeSlackChannels(raw?.channels),
    channelsFetchedAt: typeof raw?.channelsFetchedAt === 'string' ? raw.channelsFetchedAt : null,
    mentionUserIds,
    mentionAliases: Object.fromEntries(Object.entries(mentionAliases).filter(([id]) => knownIds.has(id))),
    mentionUsers,
    usersFetchedAt: typeof raw?.usersFetchedAt === 'string' ? raw.usersFetchedAt : null,
  }
}

function normalizeSlackChannels(raw?: unknown): SlackChannel[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw
    .map((channel): SlackChannel | null => {
      if (!channel || typeof channel !== 'object') return null
      const value = channel as Partial<SlackChannel>
      const id = typeof value.id === 'string' ? value.id.trim() : ''
      const name = typeof value.name === 'string' ? value.name.trim() : ''
      if (!id || !name || seen.has(id)) return null
      seen.add(id)
      return {
        id,
        name,
        isPrivate: Boolean(value.isPrivate),
        isArchived: Boolean(value.isArchived),
        isMember: Boolean(value.isMember),
      }
    })
    .filter(Boolean) as SlackChannel[]
}

function normalizeSlackMentionUsers(raw?: unknown): SlackMentionUser[] {
  if (!Array.isArray(raw)) return []
  const users = raw
    .map((user): SlackMentionUser | null => {
      if (!user || typeof user !== 'object') return null
      const value = user as Partial<SlackMentionUser>
      const id = typeof value.id === 'string' ? value.id.trim() : ''
      if (!id) return null
      return {
        id,
        name: typeof value.name === 'string' ? value.name.trim() : '',
        displayName: typeof value.displayName === 'string' ? value.displayName.trim() : '',
        realName: typeof value.realName === 'string' ? value.realName.trim() : '',
        email: typeof value.email === 'string' ? value.email.trim().toLowerCase() || undefined : undefined,
        deleted: Boolean(value.deleted),
        isBot: Boolean(value.isBot),
      }
    })
    .filter(Boolean) as SlackMentionUser[]
  const byId = new Map(users.map(user => [user.id, user]))
  return [...byId.values()].sort((a, b) => (a.displayName || a.realName || a.name || a.id).localeCompare(b.displayName || b.realName || b.name || b.id))
}

function identityLabelFromSlackUser(user: SlackMentionUser): string {
  return user.displayName || user.realName || user.name || user.id
}

function identityIdFromLabel(label: string): string {
  const id = label
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return id || `person-${Date.now()}`
}

function normalizeGitLabUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^@/, '') : ''
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeGitLabMentionUsers(raw?: unknown): GitLabMentionUser[] {
  if (!Array.isArray(raw)) return []
  const users = raw
    .map((user): GitLabMentionUser | null => {
      if (!user || typeof user !== 'object') return null
      const value = user as Partial<GitLabMentionUser>
      const id = typeof value.id === 'number' && Number.isFinite(value.id) ? value.id : 0
      const username = typeof value.username === 'string' ? value.username.trim().replace(/^@/, '') : ''
      const name = typeof value.name === 'string' ? value.name.trim() : ''
      if (!id || !username) return null
      return {
        id,
        username,
        name: name || username,
        email: normalizeEmail((value as { email?: unknown; publicEmail?: unknown }).email ?? (value as { publicEmail?: unknown }).publicEmail) || undefined,
        state: typeof value.state === 'string' ? value.state.trim() : undefined,
        avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl.trim() : undefined,
        webUrl: typeof value.webUrl === 'string' ? value.webUrl.trim() : undefined,
      }
    })
    .filter(Boolean) as GitLabMentionUser[]
  const byUsername = new Map(users.map(user => [user.username, user]))
  return [...byUsername.values()].sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username))
}

function identityCompleteness(identity: MentionIdentity): number {
  return (identity.email ? 4 : 0) + (identity.slackUserId ? 2 : 0) + (identity.gitlabUsername ? 2 : 0) + (identity.googleEmail ? 2 : 0)
}

function mergeIdentity(primary: MentionIdentity, secondary: MentionIdentity): MentionIdentity {
  return {
    id: primary.id,
    displayName: primary.displayName || secondary.displayName,
    ...(primary.email || secondary.email ? { email: primary.email || secondary.email } : {}),
    ...(primary.slackUserId || secondary.slackUserId ? { slackUserId: primary.slackUserId || secondary.slackUserId } : {}),
    ...(primary.gitlabUsername || secondary.gitlabUsername ? { gitlabUsername: primary.gitlabUsername || secondary.gitlabUsername } : {}),
    ...(primary.googleEmail || secondary.googleEmail ? { googleEmail: primary.googleEmail || secondary.googleEmail } : {}),
  }
}

function identitiesMatch(a: MentionIdentity, b: MentionIdentity): boolean {
  return Boolean(
    (a.email && b.email && normalizeEmail(a.email) === normalizeEmail(b.email)) ||
    (a.slackUserId && b.slackUserId && a.slackUserId === b.slackUserId) ||
    (a.gitlabUsername && b.gitlabUsername && a.gitlabUsername === b.gitlabUsername) ||
    (a.googleEmail && b.googleEmail && normalizeEmail(a.googleEmail) === normalizeEmail(b.googleEmail)),
  )
}

function consolidateMentionIdentities(identities: MentionIdentity[]): MentionIdentity[] {
  const consolidated: MentionIdentity[] = []
  for (const identity of identities) {
    const index = consolidated.findIndex(existing => identitiesMatch(existing, identity))
    if (index < 0) {
      consolidated.push(identity)
      continue
    }
    const existing = consolidated[index]
    const identityScore = identityCompleteness(identity)
    const existingScore = identityCompleteness(existing)
    consolidated[index] = identityScore > existingScore
      ? mergeIdentity(identity, existing)
      : mergeIdentity(existing, identity)
  }
  return consolidated
}

function normalizeMentionIdentities(raw?: unknown, slack?: SlackPublishSettings, gitlab?: GitLabPublishSettings): MentionIdentity[] {
  const input = Array.isArray(raw) ? raw : []
  const identities = input
    .map((identity): MentionIdentity | null => {
      if (!identity || typeof identity !== 'object') return null
      const value = identity as Partial<MentionIdentity>
      const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : ''
      const email = normalizeEmail(value.email)
      const googleEmail = normalizeEmail(value.googleEmail)
      const slackUserId = typeof value.slackUserId === 'string' ? normalizeSlackMentionIds([value.slackUserId])[0] : ''
      const gitlabUsername = normalizeGitLabUsername(value.gitlabUsername)
      const id = typeof value.id === 'string' ? value.id.trim() : ''
      const normalizedId = id || identityIdFromLabel(displayName || email || googleEmail || gitlabUsername || slackUserId)
      if (!normalizedId || (!displayName && !email && !googleEmail && !slackUserId && !gitlabUsername)) return null
      return {
        id: normalizedId,
        displayName: displayName || email || googleEmail || gitlabUsername || slackUserId,
        ...(email ? { email } : {}),
        ...(slackUserId ? { slackUserId } : {}),
        ...(gitlabUsername ? { gitlabUsername } : {}),
        ...(googleEmail ? { googleEmail } : {}),
      }
    })
    .filter(Boolean) as MentionIdentity[]
  const byId = new Map(identities.map(identity => [identity.id, identity]))

  for (const user of slack?.mentionUsers ?? []) {
    if (user.deleted || user.isBot) continue
    const displayName = identityLabelFromSlackUser(user)
    const email = normalizeEmail(user.email)
    const existingByEmail = email ? [...byId.values()].find(identity => normalizeEmail(identity.email) === email) : undefined
    if (existingByEmail) {
      byId.set(existingByEmail.id, { ...existingByEmail, displayName: existingByEmail.displayName || displayName, email: existingByEmail.email || email, slackUserId: user.id })
      continue
    }
    const existing = [...byId.values()].find(identity => identity.slackUserId === user.id)
    if (existing) {
      byId.set(existing.id, { ...existing, displayName: existing.displayName || displayName, email: existing.email || email || undefined, slackUserId: user.id })
      continue
    }
    const id = identityIdFromLabel(displayName)
    byId.set(id, { id, displayName, ...(email ? { email } : {}), slackUserId: user.id })
  }

  for (const user of gitlab?.mentionUsers ?? []) {
    if (user.state && user.state !== 'active') continue
    const displayName = user.name || user.username
    const email = normalizeEmail(user.email)
    const existingByEmail = email ? [...byId.values()].find(identity => normalizeEmail(identity.email) === email) : undefined
    if (existingByEmail) {
      byId.set(existingByEmail.id, { ...existingByEmail, displayName: existingByEmail.displayName || displayName, email: existingByEmail.email || email, gitlabUsername: user.username })
      continue
    }
    const existingByUsername = [...byId.values()].find(identity => identity.gitlabUsername === user.username)
    if (existingByUsername) {
      byId.set(existingByUsername.id, { ...existingByUsername, displayName: existingByUsername.displayName || displayName, email: existingByUsername.email || email || undefined, gitlabUsername: user.username })
      continue
    }
    const existingByName = [...byId.values()].find(identity => identity.displayName.trim().toLowerCase() === displayName.trim().toLowerCase())
    if (existingByName && !existingByName.gitlabUsername) {
      byId.set(existingByName.id, { ...existingByName, email: existingByName.email || email || undefined, gitlabUsername: user.username })
      continue
    }
    const id = identityIdFromLabel(displayName)
    if (!byId.has(id)) byId.set(id, { id, displayName, ...(email ? { email } : {}), gitlabUsername: user.username })
  }

  return consolidateMentionIdentities([...byId.values()]).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

function normalizeManualMentionIdentities(raw?: unknown): MentionIdentity[] {
  return normalizeMentionIdentities(raw)
}

function normalizeCsvList(raw?: unknown): string[] {
  const text = Array.isArray(raw) ? raw.join(',') : String(raw ?? '')
  return Array.from(new Set(text.split(/[,;\n]+/).map(value => value.trim()).filter(Boolean)))
}

function uniqueList(values: unknown, fallback: string[] = []): string[] {
  const input = Array.isArray(values) ? values : fallback
  return Array.from(new Set(input.map(value => String(value).trim()).filter(Boolean)))
}

function normalizeCommonSession(raw?: Partial<CommonSessionSettings>): CommonSessionSettings {
  return {
    platforms: uniqueList(raw?.platforms, DEFAULT_COMMON_SESSION.platforms),
    projects: uniqueList(raw?.projects),
    testers: uniqueList(raw?.testers),
    lastPlatform: typeof raw?.lastPlatform === 'string' ? raw.lastPlatform.trim() : '',
    lastProject: typeof raw?.lastProject === 'string' ? raw.lastProject.trim() : '',
    lastTester: typeof raw?.lastTester === 'string' ? raw.lastTester.trim() : '',
  }
}

function normalizeRecordingPreferences(raw?: Partial<RecordingPreferences>): RecordingPreferences {
  return {
    recordMic: typeof raw?.recordMic === 'boolean' ? raw.recordMic : DEFAULT_RECORDING_PREFERENCES.recordMic,
    iosLaunchApp: typeof raw?.iosLaunchApp === 'boolean' ? raw.iosLaunchApp : DEFAULT_RECORDING_PREFERENCES.iosLaunchApp,
    recordSystemAudio: typeof raw?.recordSystemAudio === 'boolean' ? raw.recordSystemAudio : DEFAULT_RECORDING_PREFERENCES.recordSystemAudio,
  }
}

function normalizeGitLab(raw?: Partial<GitLabPublishSettings>): GitLabPublishSettings {
  const mode = raw?.mode === 'per-marker-issue' ? 'per-marker-issue' : 'single-issue'
  const emailLookup = raw?.emailLookup === 'admin-users-api' ? 'admin-users-api' : 'off'
  const authType = raw?.authType === 'oauth' ? 'oauth' : 'pat'
  return {
    baseUrl: (raw?.baseUrl?.trim() || 'https://gitlab.com').replace(/\/+$/, ''),
    token: raw?.token || '',
    authType,
    oauthClientId: typeof raw?.oauthClientId === 'string' ? raw.oauthClientId.trim() : '',
    oauthClientSecret: typeof raw?.oauthClientSecret === 'string' ? raw.oauthClientSecret.trim() : '',
    oauthRedirectUri: 'loupe://gitlab-oauth',
    projectId: raw?.projectId?.trim() || '',
    mode,
    emailLookup,
    labels: normalizeCsvList(raw?.labels),
    confidential: Boolean(raw?.confidential),
    mentionUsernames: normalizeCsvList(raw?.mentionUsernames).map(value => value.replace(/^@/, '')),
    mentionUsers: normalizeGitLabMentionUsers(raw?.mentionUsers),
    usersFetchedAt: typeof raw?.usersFetchedAt === 'string' ? raw.usersFetchedAt : null,
    lastUserSyncWarning: typeof raw?.lastUserSyncWarning === 'string' ? raw.lastUserSyncWarning : null,
  }
}

function normalizeGoogle(raw?: Partial<GooglePublishSettings>): GooglePublishSettings {
  return {
    token: typeof raw?.token === 'string' ? raw.token : '',
    refreshToken: typeof raw?.refreshToken === 'string' && raw.refreshToken.trim() ? raw.refreshToken.trim() : undefined,
    tokenExpiresAt: typeof raw?.tokenExpiresAt === 'number' && Number.isFinite(raw.tokenExpiresAt) ? raw.tokenExpiresAt : null,
    accountEmail: normalizeEmail(raw?.accountEmail) || undefined,
    oauthClientId: GOOGLE_OAUTH_CONFIG.clientId || (typeof raw?.oauthClientId === 'string' ? raw.oauthClientId.trim() : ''),
    oauthClientSecret: GOOGLE_OAUTH_CONFIG.clientSecret || (typeof raw?.oauthClientSecret === 'string' ? raw.oauthClientSecret.trim() : ''),
    oauthRedirectUri: GOOGLE_OAUTH_CONFIG.redirectUri || (typeof raw?.oauthRedirectUri === 'string' ? raw.oauthRedirectUri.trim() : ''),
    driveFolderId: typeof raw?.driveFolderId === 'string' ? raw.driveFolderId.trim() : '',
    driveFolderName: typeof raw?.driveFolderName === 'string' ? raw.driveFolderName.trim() : '',
    updateSheet: Boolean(raw?.updateSheet),
    spreadsheetId: typeof raw?.spreadsheetId === 'string' ? raw.spreadsheetId.trim() : '',
    spreadsheetName: typeof raw?.spreadsheetName === 'string' ? raw.spreadsheetName.trim() : '',
    sheetName: typeof raw?.sheetName === 'string' ? raw.sheetName.trim() : '',
  }
}

function normalizeAudioAnalysis(raw?: Partial<AudioAnalysisSettings>): AudioAnalysisSettings {
  const configuredModel = typeof raw?.modelPath === 'string' ? raw.modelPath.trim() : ''
  const triggerKeywords = typeof raw?.triggerKeywords === 'string' && raw.triggerKeywords.trim()
    ? raw.triggerKeywords.trim()
    : DEFAULT_AUDIO_ANALYSIS.triggerKeywords
  const engine = raw?.engine === 'whisper-cpp' && configuredModel
    ? 'whisper-cpp'
    : 'faster-whisper'
  return {
    enabled: true,
    engine,
    modelPath: configuredModel
      ? configuredModel
      : engine === 'faster-whisper'
        ? 'small'
        : '',
    language: typeof raw?.language === 'string' && raw.language.trim() ? raw.language.trim() : 'auto',
    chineseScript: raw?.chineseScript === 'zh-CN' ? 'zh-CN' : 'zh-TW',
    triggerKeywords,
    showTriggerWords: raw?.showTriggerWords === true,
  }
}

function normalizeLocale(raw?: string): AppLocale {
  if (raw === 'system' || raw === 'en' || raw === 'zh-TW' || raw === 'zh-CN' || raw === 'ja' || raw === 'ko' || raw === 'es') return raw
  return 'system'
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

function normalizeSeverities(raw?: Partial<SeveritySettings>): SeveritySettings {
  const out = { ...DEFAULT_SEVERITIES }
  for (const key of SEVERITY_KEYS) {
    const incoming = raw?.[key]
    const incomingLabel = incoming?.label?.trim()
    const legacyDefault = LEGACY_DEFAULT_LABELS[key]
    out[key] = {
      label: (REQUIRED_SEVERITY_KEYS as readonly string[]).includes(key)
        ? (!incomingLabel || incomingLabel === legacyDefault ? DEFAULT_SEVERITIES[key].label : incomingLabel)
        : (incomingLabel || ''),
      color: normalizeColor(incoming?.color, DEFAULT_SEVERITIES[key].color),
    }
  }
  for (const [key, incoming] of Object.entries(raw ?? {})) {
    if (key in out) continue
    const label = incoming?.label?.trim()
    if (!label) continue
    out[key] = {
      label,
      color: normalizeColor(incoming?.color, '#8b5cf6'),
    }
  }
  return out
}

export class SettingsStore {
  constructor(private filePath: string, private defaults: AppSettings) {}

  get(): AppSettings {
    if (!existsSync(this.filePath)) return this.defaults
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AppSettings>
      const slack = normalizeSlack(raw.slack)
      const gitlab = normalizeGitLab(raw.gitlab)
      const google = normalizeGoogle(raw.google)
      return {
        exportRoot: raw.exportRoot || this.defaults.exportRoot,
        hotkeys: normalizeHotkeys(raw.hotkeys),
        locale: normalizeLocale(raw.locale),
        severities: normalizeSeverities(raw.severities),
        audioAnalysis: normalizeAudioAnalysis(raw.audioAnalysis),
        commonSession: normalizeCommonSession(raw.commonSession),
        recordingPreferences: normalizeRecordingPreferences(raw.recordingPreferences),
        slack,
        gitlab,
        google,
        mentionIdentities: normalizeManualMentionIdentities(raw.mentionIdentities),
      }
    } catch {
      return this.defaults
    }
  }

  setExportRoot(exportRoot: string): AppSettings {
    const next = { ...this.get(), exportRoot }
    this.write(next)
    return next
  }

  setHotkeys(hotkeys: HotkeySettings): AppSettings {
    const next = { ...this.get(), hotkeys: normalizeHotkeys(hotkeys) }
    this.write(next)
    return next
  }

  setSlack(slack: SlackPublishSettings): AppSettings {
    const next = { ...this.get(), slack: normalizeSlack(slack) }
    this.write(next)
    return next
  }

  setGitLab(gitlab: GitLabPublishSettings): AppSettings {
    const next = { ...this.get(), gitlab: normalizeGitLab(gitlab) }
    this.write(next)
    return next
  }

  setGoogle(google: GooglePublishSettings): AppSettings {
    const next = { ...this.get(), google: normalizeGoogle(google) }
    this.write(next)
    return next
  }

  setMentionIdentities(mentionIdentities: MentionIdentity[]): AppSettings {
    const current = this.get()
    const next = { ...current, mentionIdentities: normalizeManualMentionIdentities(mentionIdentities) }
    this.write(next)
    return next
  }

  refreshMentionIdentities(): AppSettings {
    const current = this.get()
    const next = { ...current, mentionIdentities: normalizeMentionIdentities(current.mentionIdentities, current.slack, current.gitlab) }
    this.write(next)
    return next
  }

  setLocale(locale: AppLocale): AppSettings {
    const next = { ...this.get(), locale: normalizeLocale(locale) }
    this.write(next)
    return next
  }

  setSeverities(severities: SeveritySettings): AppSettings {
    const next = { ...this.get(), severities: normalizeSeverities(severities) }
    this.write(next)
    return next
  }

  setAudioAnalysis(audioAnalysis: AudioAnalysisSettings): AppSettings {
    const next = { ...this.get(), audioAnalysis: normalizeAudioAnalysis(audioAnalysis) }
    this.write(next)
    return next
  }

  setCommonSession(commonSession: CommonSessionSettings): AppSettings {
    const next = { ...this.get(), commonSession: normalizeCommonSession(commonSession) }
    this.write(next)
    return next
  }

  setRecordingPreferences(recordingPreferences: RecordingPreferences): AppSettings {
    const next = { ...this.get(), recordingPreferences: normalizeRecordingPreferences(recordingPreferences) }
    this.write(next)
    return next
  }

  private write(settings: AppSettings): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  }
}
