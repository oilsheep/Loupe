import { describe, expect, it } from 'vitest'
import { buildSlackUserOAuthUrl, SLACK_USER_OAUTH_SCOPES } from '../slack-oauth'

describe('Slack OAuth', () => {
  it('requests email scope for user directory refreshes', () => {
    expect(SLACK_USER_OAUTH_SCOPES).toContain('users:read')
    expect(SLACK_USER_OAUTH_SCOPES).toContain('users:read.email')

    const url = new URL(buildSlackUserOAuthUrl({
      botToken: '',
      channelId: '',
      oauthClientId: 'client-id',
    }, 'state', 'challenge'))
    expect(url.searchParams.get('user_scope')?.split(',')).toEqual(SLACK_USER_OAUTH_SCOPES)
  })
})
