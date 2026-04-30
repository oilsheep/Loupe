const clientId = typeof __LOUPE_GOOGLE_OAUTH_CLIENT_ID__ === 'string' ? __LOUPE_GOOGLE_OAUTH_CLIENT_ID__ : ''
const clientSecret = typeof __LOUPE_GOOGLE_OAUTH_CLIENT_SECRET__ === 'string' ? __LOUPE_GOOGLE_OAUTH_CLIENT_SECRET__ : ''
const redirectUri = typeof __LOUPE_GOOGLE_OAUTH_REDIRECT_URI__ === 'string' ? __LOUPE_GOOGLE_OAUTH_REDIRECT_URI__ : ''

export const GOOGLE_OAUTH_CONFIG = {
  clientId,
  clientSecret,
  redirectUri: redirectUri || 'http://127.0.0.1:38988/oauth/google/callback',
} as const
