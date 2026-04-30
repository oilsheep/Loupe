const clientId = typeof __LOUPE_GOOGLE_OAUTH_CLIENT_ID__ === 'string' ? __LOUPE_GOOGLE_OAUTH_CLIENT_ID__ : ''
const clientSecret = typeof __LOUPE_GOOGLE_OAUTH_CLIENT_SECRET__ === 'string' ? __LOUPE_GOOGLE_OAUTH_CLIENT_SECRET__ : ''

export const GOOGLE_OAUTH_CONFIG = {
  clientId,
  clientSecret,
  redirectUri: 'http://127.0.0.1:38988/oauth/google/callback',
} as const
