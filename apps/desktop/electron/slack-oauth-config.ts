const clientId = typeof __LOUPE_SLACK_OAUTH_CLIENT_ID__ === 'string' ? __LOUPE_SLACK_OAUTH_CLIENT_ID__ : ''
const clientSecret = typeof __LOUPE_SLACK_OAUTH_CLIENT_SECRET__ === 'string' ? __LOUPE_SLACK_OAUTH_CLIENT_SECRET__ : ''

export const SLACK_OAUTH_CONFIG = {
  clientId,
  clientSecret,
  redirectUri: 'loupe://slack-oauth',
} as const
