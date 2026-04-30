import type { SlackPublishSettings } from '@shared/types'
import { createHash, randomBytes } from 'node:crypto'

export const SLACK_USER_OAUTH_SCOPES = ['chat:write', 'files:write', 'users:read', 'channels:read', 'groups:read']
export const DEFAULT_SLACK_OAUTH_CLIENT_ID = '2178062560.11055652367536'
export const DEFAULT_SLACK_OAUTH_REDIRECT_URI = 'loupe://slack-oauth'

function slackOAuthConfig(settings: SlackPublishSettings): { clientId: string; clientSecret: string; redirectUri: string } {
  return {
    clientId: settings.oauthClientId?.trim() || process.env.LOUPE_SLACK_OAUTH_CLIENT_ID?.trim() || DEFAULT_SLACK_OAUTH_CLIENT_ID,
    clientSecret: settings.oauthClientSecret?.trim() || process.env.LOUPE_SLACK_OAUTH_CLIENT_SECRET?.trim() || '',
    redirectUri: settings.oauthRedirectUri?.trim() || process.env.LOUPE_SLACK_OAUTH_REDIRECT_URI?.trim() || DEFAULT_SLACK_OAUTH_REDIRECT_URI,
  }
}

interface SlackOAuthAccessResponse {
  ok: boolean
  error?: string
  authed_user?: {
    id?: string
    scope?: string
    access_token?: string
    token_type?: string
  }
  team?: {
    id?: string
    name?: string
  }
}

export interface SlackOAuthResult {
  userToken: string
  userId: string
  teamId: string
  teamName: string
  scopes: string[]
}

export function createSlackPkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(48).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

export function buildSlackUserOAuthUrl(settings: SlackPublishSettings, state: string, codeChallenge: string): string {
  const { clientId, redirectUri } = slackOAuthConfig(settings)
  if (!clientId) throw new Error('Slack OAuth client ID is missing')
  if (!redirectUri) throw new Error('Slack OAuth redirect URL is missing')

  const url = new URL('https://slack.com/oauth/v2/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('user_scope', SLACK_USER_OAUTH_SCOPES.join(','))
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export function parseSlackOAuthCallback(callbackUrl: string): { code: string; state: string } {
  const url = new URL(callbackUrl)
  if (url.protocol !== 'loupe:' || url.hostname !== 'slack-oauth') throw new Error('Invalid Loupe Slack OAuth callback URL')
  const error = url.searchParams.get('error')?.trim()
  if (error) throw new Error(`Slack OAuth failed: ${error}`)
  const code = url.searchParams.get('code')?.trim()
  const state = url.searchParams.get('state')?.trim()
  if (!code) throw new Error('Slack OAuth callback is missing code')
  if (!state) throw new Error('Slack OAuth callback is missing state')
  return { code, state }
}

export async function exchangeSlackOAuthCode(args: {
  code: string
  codeVerifier: string
  settings: SlackPublishSettings
  fetchImpl?: typeof fetch
}): Promise<SlackOAuthResult> {
  const { clientId, clientSecret, redirectUri } = slackOAuthConfig(args.settings)
  if (!clientId) throw new Error('Slack OAuth client ID is missing')
  if (!redirectUri) throw new Error('Slack OAuth redirect URL is missing')

  const fetchImpl = args.fetchImpl ?? fetch
  const body = new URLSearchParams()
  body.set('code', args.code)
  body.set('redirect_uri', redirectUri)
  body.set('client_id', clientId)
  body.set('code_verifier', args.codeVerifier)
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
  }
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  }
  const response = await fetchImpl('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers,
    body: body.toString(),
  })
  const payload = await response.json() as SlackOAuthAccessResponse
  if (!response.ok || !payload.ok) throw new Error(`Slack oauth.v2.access failed: ${payload.error || response.statusText}`)
  const userToken = payload.authed_user?.access_token?.trim()
  const userId = payload.authed_user?.id?.trim()
  if (!userToken) throw new Error('Slack OAuth did not return a user access token')
  if (!userId) throw new Error('Slack OAuth did not return an authenticated user ID')
  return {
    userToken,
    userId,
    teamId: payload.team?.id?.trim() || '',
    teamName: payload.team?.name?.trim() || '',
    scopes: (payload.authed_user?.scope ?? '').split(',').map(scope => scope.trim()).filter(Boolean),
  }
}
