import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_AUDIO_ANALYSIS, DEFAULT_HOTKEYS, DEFAULT_RECORDING_PREFERENCES, DEFAULT_SEVERITIES, SettingsStore } from '../settings'
import { refreshAllExpiringTokens, type RefreshDeps } from '../token-refresh'
import type { AppSettings } from '@shared/types'

const MIN_DEFAULTS: AppSettings = {
  exportRoot: '/default',
  hotkeys: DEFAULT_HOTKEYS,
  locale: 'system',
  severities: DEFAULT_SEVERITIES,
  audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
  recordingPreferences: DEFAULT_RECORDING_PREFERENCES,
  mentionIdentities: [],
  profiles: [{
    id: 'default-fallback',
    name: 'Default',
    slack: { botToken: '', channelId: '' },
    gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue' },
    google: { token: '', oauthClientId: 'client', oauthClientSecret: 'secret', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback' },
  }],
  activeProfileId: 'default-fallback',
}

const TMP_DIRS: string[] = []
function makeStore(): { store: SettingsStore; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'loupe-token-refresh-'))
  TMP_DIRS.push(tmp)
  return { store: new SettingsStore(join(tmp, 'settings.json'), MIN_DEFAULTS), tmp }
}

// Most tests focus on one service; provide a default no-op for the others
// so consumers can pass partial deps.
function deps(overrides: Partial<RefreshDeps>): RefreshDeps {
  return {
    refreshGoogle: vi.fn().mockResolvedValue({ token: 'unused', tokenExpiresAt: 0 }),
    refreshGitLab: vi.fn().mockResolvedValue({ token: 'unused', tokenExpiresAt: 0 }),
    refreshSlack: vi.fn().mockResolvedValue({ token: 'unused', tokenExpiresAt: 0 }),
    ...overrides,
  }
}

afterEach(() => {
  while (TMP_DIRS.length) rmSync(TMP_DIRS.pop()!, { recursive: true, force: true })
})

describe('refreshAllExpiringTokens', () => {
  it('attempts a refresh for each project with a Google refreshToken', async () => {
    const { store } = makeStore()
    const defId = store.get().profiles[0].id
    store.setProfile(defId, {
      google: { ...store.get().profiles[0].google, accountEmail: 'a@b.com', refreshToken: 'r1', token: 'old', tokenExpiresAt: 0 },
    })
    const refreshFn = vi.fn().mockResolvedValue({ token: 'NEW', tokenExpiresAt: Date.now() + 3600_000 })
    await refreshAllExpiringTokens(store, deps({ refreshGoogle: refreshFn }))
    expect(refreshFn).toHaveBeenCalledTimes(1)
    expect(store.get().profiles[0].google.token).toBe('NEW')
    expect(store.get().profiles[0].google.refreshError).toBeUndefined()
  })

  it('skips projects without a Google refreshToken', async () => {
    const { store } = makeStore()
    const refreshFn = vi.fn()
    await refreshAllExpiringTokens(store, deps({ refreshGoogle: refreshFn }))
    expect(refreshFn).not.toHaveBeenCalled()
  })

  it('sets refreshError on the failing project; does not affect others', async () => {
    const { store } = makeStore()
    store.addProfile({ name: 'Cytus' })
    const projects = store.get().profiles
    store.setProfile(projects[0].id, {
      google: { ...projects[0].google, accountEmail: 'a@b.com', refreshToken: 'good', tokenExpiresAt: 0 },
    })
    store.setProfile(projects[1].id, {
      google: { ...projects[1].google, accountEmail: 'c@d.com', refreshToken: 'bad', tokenExpiresAt: 0 },
    })
    const refreshFn = vi.fn()
      .mockResolvedValueOnce({ token: 'NEW', tokenExpiresAt: Date.now() + 3600_000 })
      .mockRejectedValueOnce(Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' }))
    await refreshAllExpiringTokens(store, deps({ refreshGoogle: refreshFn }))
    const after = store.get()
    expect(after.profiles[0].google.token).toBe('NEW')
    expect(after.profiles[0].google.refreshError).toBeUndefined()
    expect(after.profiles[1].google.refreshError).toBeDefined()
    expect(after.profiles[1].google.refreshError?.code).toMatch(/invalid_grant/i)
  })

  it('dedupes concurrent refresh calls per accountEmail (in-flight cache)', async () => {
    const { store } = makeStore()
    store.addProfile({ name: 'Cytus', duplicateFromId: store.get().profiles[0].id })
    const ids = store.get().profiles.map(p => p.id)
    for (const id of ids) {
      store.setProfile(id, {
        google: { ...store.get().profiles.find(p => p.id === id)!.google, accountEmail: 'shared@example.com', refreshToken: 'r1', tokenExpiresAt: 0 },
      })
    }
    const refreshFn = vi.fn().mockResolvedValue({ token: 'NEW', tokenExpiresAt: Date.now() + 3600_000 })
    await Promise.all([
      refreshAllExpiringTokens(store, deps({ refreshGoogle: refreshFn })),
      refreshAllExpiringTokens(store, deps({ refreshGoogle: refreshFn })),
    ])
    expect(refreshFn).toHaveBeenCalledTimes(1)
  })
})

describe('refreshAllExpiringTokens — integration with real refreshGoogleAccessToken', () => {
  it('actually calls fetch even when the cached token is not yet expired (force-refresh)', async () => {
    const { store } = makeStore()
    const defId = store.get().profiles[0].id
    // Set up a project with a NON-EXPIRED token (1 hour from now). Without
    // forceRefresh, refreshGoogleAccessToken would short-circuit and never
    // call fetch. The proactive sweep needs forceRefresh: true to roll the
    // refresh-token's inactivity timer forward.
    store.setProfile(defId, {
      google: {
        ...store.get().profiles[0].google,
        accountEmail: 'a@b.com',
        refreshToken: 'r1',
        token: 'still-valid',
        tokenExpiresAt: Date.now() + 3600_000,
        oauthClientId: 'cid',
        oauthClientSecret: 'csec',
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ access_token: 'NEW', expires_in: 3600 }),
      { status: 200 },
    ))
    const { refreshGoogleAccessToken } = await import('../google-publisher')
    const refreshGoogle: import('../token-refresh').RefreshDeps['refreshGoogle'] = async ({ refreshToken, accountEmail }) => {
      const active = store.get().profiles.find(p => p.google.accountEmail === accountEmail)!
      const refreshed = await refreshGoogleAccessToken(
        { ...active.google, refreshToken },
        fetchMock as any,
        { forceRefresh: true },
      )
      return {
        token: refreshed.token,
        tokenExpiresAt: refreshed.tokenExpiresAt!,
        refreshToken: refreshed.refreshToken,
      }
    }
    await refreshAllExpiringTokens(store, deps({ refreshGoogle }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.get().profiles[0].google.token).toBe('NEW')
  })
})

describe('refreshAllExpiringTokens — GitLab', () => {
  it('attempts a refresh for each project with a GitLab oauth refreshToken', async () => {
    const { store } = makeStore()
    const defId = store.get().profiles[0].id
    store.setProfile(defId, {
      gitlab: { ...store.get().profiles[0].gitlab, authType: 'oauth', oauthClientId: 'cid', refreshToken: 'r1', token: 'old', tokenExpiresAt: 0 },
    })
    const refreshFn = vi.fn().mockResolvedValue({ token: 'NEW', tokenExpiresAt: Date.now() + 7200_000, refreshToken: 'r2' })
    await refreshAllExpiringTokens(store, deps({ refreshGitLab: refreshFn }))
    expect(refreshFn).toHaveBeenCalledTimes(1)
    const after = store.get().profiles[0].gitlab
    expect(after.token).toBe('NEW')
    expect(after.refreshToken).toBe('r2')
    expect(after.refreshError).toBeUndefined()
  })

  it('skips PAT-auth profiles even if a refreshToken is somehow present', async () => {
    const { store } = makeStore()
    const defId = store.get().profiles[0].id
    store.setProfile(defId, {
      gitlab: { ...store.get().profiles[0].gitlab, authType: 'pat', oauthClientId: 'cid', refreshToken: 'r1' },
    })
    const refreshFn = vi.fn()
    await refreshAllExpiringTokens(store, deps({ refreshGitLab: refreshFn }))
    expect(refreshFn).not.toHaveBeenCalled()
  })

  it('skips profiles without baseUrl or oauthClientId or refreshToken', async () => {
    const { store } = makeStore()
    const refreshFn = vi.fn()
    await refreshAllExpiringTokens(store, deps({ refreshGitLab: refreshFn }))
    expect(refreshFn).not.toHaveBeenCalled()
  })

  it('dedupes concurrent refresh calls per baseUrl::clientId identity', async () => {
    const { store } = makeStore()
    store.addProfile({ name: 'Cytus', duplicateFromId: store.get().profiles[0].id })
    const ids = store.get().profiles.map(p => p.id)
    for (const id of ids) {
      store.setProfile(id, {
        gitlab: {
          ...store.get().profiles.find(p => p.id === id)!.gitlab,
          baseUrl: 'https://gitlab.example.com',
          authType: 'oauth',
          oauthClientId: 'shared-client',
          refreshToken: 'r1',
          tokenExpiresAt: 0,
        },
      })
    }
    const refreshFn = vi.fn().mockResolvedValue({ token: 'NEW', tokenExpiresAt: Date.now() + 7200_000 })
    await Promise.all([
      refreshAllExpiringTokens(store, deps({ refreshGitLab: refreshFn })),
      refreshAllExpiringTokens(store, deps({ refreshGitLab: refreshFn })),
    ])
    expect(refreshFn).toHaveBeenCalledTimes(1)
  })

  it('sets refreshError on failing GitLab refresh', async () => {
    const { store } = makeStore()
    const defId = store.get().profiles[0].id
    store.setProfile(defId, {
      gitlab: { ...store.get().profiles[0].gitlab, authType: 'oauth', oauthClientId: 'cid', refreshToken: 'r1', tokenExpiresAt: 0 },
    })
    const refreshFn = vi.fn().mockRejectedValue(Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' }))
    await refreshAllExpiringTokens(store, deps({ refreshGitLab: refreshFn }))
    expect(store.get().profiles[0].gitlab.refreshError).toBeDefined()
    expect(store.get().profiles[0].gitlab.refreshError?.code).toMatch(/invalid_grant/i)
  })
})

describe('refreshAllExpiringTokens — Slack', () => {
  it('attempts a refresh when a Slack user has refreshToken + oauthTeamId + oauthClientId', async () => {
    const { store } = makeStore()
    const defId = store.get().profiles[0].id
    store.setProfile(defId, {
      slack: {
        ...store.get().profiles[0].slack,
        publishIdentity: 'user',
        oauthTeamId: 'T01',
        oauthClientId: 'cid',
        refreshToken: 'r1',
        userToken: 'old',
        tokenExpiresAt: 0,
      },
    })
    const refreshFn = vi.fn().mockResolvedValue({ token: 'NEW', tokenExpiresAt: Date.now() + 43200_000, refreshToken: 'r2' })
    await refreshAllExpiringTokens(store, deps({ refreshSlack: refreshFn }))
    expect(refreshFn).toHaveBeenCalledTimes(1)
    const after = store.get().profiles[0].slack
    expect(after.userToken).toBe('NEW')
    expect(after.refreshToken).toBe('r2')
    expect(after.refreshError).toBeUndefined()
  })

  it('skips bot-mode profiles', async () => {
    const { store } = makeStore()
    const defId = store.get().profiles[0].id
    store.setProfile(defId, {
      slack: {
        ...store.get().profiles[0].slack,
        publishIdentity: 'bot',
        oauthTeamId: 'T01',
        oauthClientId: 'cid',
        refreshToken: 'r1',
      },
    })
    const refreshFn = vi.fn()
    await refreshAllExpiringTokens(store, deps({ refreshSlack: refreshFn }))
    expect(refreshFn).not.toHaveBeenCalled()
  })

  it('dedupes concurrent refresh calls per oauthTeamId', async () => {
    const { store } = makeStore()
    store.addProfile({ name: 'Cytus', duplicateFromId: store.get().profiles[0].id })
    const ids = store.get().profiles.map(p => p.id)
    for (const id of ids) {
      store.setProfile(id, {
        slack: {
          ...store.get().profiles.find(p => p.id === id)!.slack,
          publishIdentity: 'user',
          oauthTeamId: 'T01',
          oauthClientId: 'cid',
          refreshToken: 'r1',
          tokenExpiresAt: 0,
        },
      })
    }
    const refreshFn = vi.fn().mockResolvedValue({ token: 'NEW', tokenExpiresAt: Date.now() + 43200_000 })
    await Promise.all([
      refreshAllExpiringTokens(store, deps({ refreshSlack: refreshFn })),
      refreshAllExpiringTokens(store, deps({ refreshSlack: refreshFn })),
    ])
    expect(refreshFn).toHaveBeenCalledTimes(1)
  })

  it('records refreshError when refresh fails', async () => {
    const { store } = makeStore()
    const defId = store.get().profiles[0].id
    store.setProfile(defId, {
      slack: {
        ...store.get().profiles[0].slack,
        publishIdentity: 'user',
        oauthTeamId: 'T01',
        oauthClientId: 'cid',
        refreshToken: 'r1',
        tokenExpiresAt: 0,
      },
    })
    const refreshFn = vi.fn().mockRejectedValue(Object.assign(new Error('token_revoked'), { code: 'token_revoked' }))
    await refreshAllExpiringTokens(store, deps({ refreshSlack: refreshFn }))
    expect(store.get().profiles[0].slack.refreshError?.code).toMatch(/token_revoked/i)
  })
})
