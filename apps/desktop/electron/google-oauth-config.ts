export const GOOGLE_OAUTH_CONFIG = {
  clientId: __LOUPE_GOOGLE_OAUTH_CLIENT_ID__,
  clientSecret: __LOUPE_GOOGLE_OAUTH_CLIENT_SECRET__,
  redirectUri: __LOUPE_GOOGLE_OAUTH_REDIRECT_URI__ || 'http://127.0.0.1:38988/oauth/google/callback',
} as const
