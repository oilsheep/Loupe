const clientId = typeof __LOUPE_SLACK_OAUTH_CLIENT_ID__ === 'string' ? __LOUPE_SLACK_OAUTH_CLIENT_ID__ : ''
const clientSecret = typeof __LOUPE_SLACK_OAUTH_CLIENT_SECRET__ === 'string' ? __LOUPE_SLACK_OAUTH_CLIENT_SECRET__ : ''
const redirectUri = typeof __LOUPE_SLACK_OAUTH_REDIRECT_URI__ === 'string' ? __LOUPE_SLACK_OAUTH_REDIRECT_URI__ : ''

export const SLACK_OAUTH_CONFIG = {
  clientId,
  clientSecret,
  redirectUri: redirectUri || 'loupe://slack-oauth',
} as const