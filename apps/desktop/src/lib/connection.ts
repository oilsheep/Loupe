import type {
  GitLabPublishSettings,
  GooglePublishSettings,
  SlackPublishSettings,
} from '@shared/types'

export function slackPublishToken(settings: SlackPublishSettings | null): string {
  if (!settings) return ''
  const userToken = settings.userToken?.trim() ?? ''
  const botToken = settings.botToken.trim()
  return settings.publishIdentity === 'bot' ? botToken : userToken
}

export function isSlackConnected(settings: SlackPublishSettings | null): boolean {
  return Boolean(slackPublishToken(settings))
}

export function slackConnectionLabel(
  settings: SlackPublishSettings | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (!settings) return t('publish.notConnected')
  if (settings.publishIdentity === 'bot') {
    return settings.botToken.trim() ? t('publish.connectedByBot') : t('publish.botTokenMissing')
  }
  if (settings.userToken?.trim()) {
    const workspace = settings.oauthTeamName ? ` / ${settings.oauthTeamName}` : ''
    const user = settings.oauthUserId ? ` ${settings.oauthUserId}` : ''
    return `${t('publish.connectedByOAuth')}${user}${workspace}`
  }
  return t('publish.oauthTokenMissing')
}

export function isGitLabConnected(settings: GitLabPublishSettings | null): boolean {
  return Boolean(settings?.token?.trim() && settings?.baseUrl?.trim())
}

export function gitlabConnectionLabel(
  settings: GitLabPublishSettings | null,
  t: (key: string) => string,
): string {
  if (!settings || !settings.baseUrl?.trim()) return t('publish.notConnected')
  if (settings.token?.trim()) {
    try {
      return `${t('common.connected')} / ${new URL(settings.baseUrl).host}`
    } catch {
      return `${t('common.connected')} / ${settings.baseUrl}`
    }
  }
  return t('publish.notConnected')
}

export function isGoogleDriveConnected(settings: GooglePublishSettings | null): boolean {
  return Boolean((settings?.token?.trim() || settings?.refreshToken?.trim()) && settings?.driveFolderId?.trim())
}

export function friendlySlackRefreshMessage(message: string, t: (key: string) => string): string {
  if (/token_expired/i.test(message)) return t('publish.slackOauthExpired')
  if (/invalid_auth|not_authed|account_inactive/i.test(message)) return t('publish.slackAuthInvalid')
  if (/missing_scope/i.test(message)) return t('publish.slackMissingScope')
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
}

export function googleDriveConnectionLabel(
  settings: GooglePublishSettings | null,
  t: (key: string) => string,
): string {
  if (!settings) return t('publish.notConnected')
  const tokenOk = Boolean(settings.token?.trim() || settings.refreshToken?.trim())
  if (!tokenOk) return t('publish.notConnected')
  if (settings.accountEmail?.trim()) return `${t('common.connected')} / ${settings.accountEmail.trim()}`
  return t('common.connected')
}
