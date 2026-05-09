import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_AUDIO_ANALYSIS, DEFAULT_HOTKEYS, DEFAULT_RECORDING_PREFERENCES, DEFAULT_SEVERITIES, SettingsStore } from '../settings'
import { refreshAllExpiringTokens } from '../token-refresh'
import type { AppSettings } from '@shared/types'

const MIN_DEFAULTS: AppSettings = {
  exportRoot: '/default',
  hotkeys: DEFAULT_HOTKEYS,
  locale: 'system',
  severities: DEFAULT_SEVERITIES,
  audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
  recordingPreferences: DEFAULT_RECORDING_PREFERENCES,
  mentionIdentities: [],
  projects: [{
    id: 'default-fallback',
    name: 'Default',
    slack: { botToken: '', channelId: '' },
    gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue' },
    google: { token: '', oauthClientId: 'client', oauthClientSecret: 'secret', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback' },
  }],
  activeProjectId: 'default-fallback',
}

const TMP_DIRS: string[] = []
function makeStore(): { store: SettingsStore; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), 'loupe-token-refresh-'))
  TMP_DIRS.push(tmp)
  return { store: new SettingsStore(join(tmp, 'settings.json'), MIN_DEFAULTS), tmp }
}

afterEach(() => {
  while (TMP_DIRS.length) rmSync(TMP_DIRS.pop()!, { recursive: true, force: true })
})

describe('refreshAllExpiringTokens', () => {
  it('attempts a refresh for each project with a Google refreshToken', async () => {
    const { store } = makeStore()
    const defId = store.get().projects[0].id
    store.setProject(defId, {
      google: { ...store.get().projects[0].google, accountEmail: 'a@b.com', refreshToken: 'r1', token: 'old', tokenExpiresAt: 0 },
    })
    const refreshFn = vi.fn().mockResolvedValue({ token: 'NEW', tokenExpiresAt: Date.now() + 3600_000 })
    await refreshAllExpiringTokens(store, { refreshGoogle: refreshFn })
    expect(refreshFn).toHaveBeenCalledTimes(1)
    expect(store.get().projects[0].google.token).toBe('NEW')
    expect(store.get().projects[0].google.refreshError).toBeUndefined()
  })

  it('skips projects without a Google refreshToken', async () => {
    const { store } = makeStore()
    const refreshFn = vi.fn()
    await refreshAllExpiringTokens(store, { refreshGoogle: refreshFn })
    expect(refreshFn).not.toHaveBeenCalled()
  })

  it('sets refreshError on the failing project; does not affect others', async () => {
    const { store } = makeStore()
    store.addProject({ name: 'Cytus' })
    const projects = store.get().projects
    store.setProject(projects[0].id, {
      google: { ...projects[0].google, accountEmail: 'a@b.com', refreshToken: 'good', tokenExpiresAt: 0 },
    })
    store.setProject(projects[1].id, {
      google: { ...projects[1].google, accountEmail: 'c@d.com', refreshToken: 'bad', tokenExpiresAt: 0 },
    })
    const refreshFn = vi.fn()
      .mockResolvedValueOnce({ token: 'NEW', tokenExpiresAt: Date.now() + 3600_000 })
      .mockRejectedValueOnce(Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' }))
    await refreshAllExpiringTokens(store, { refreshGoogle: refreshFn })
    const after = store.get()
    expect(after.projects[0].google.token).toBe('NEW')
    expect(after.projects[0].google.refreshError).toBeUndefined()
    expect(after.projects[1].google.refreshError).toBeDefined()
    expect(after.projects[1].google.refreshError?.code).toMatch(/invalid_grant/i)
  })

  it('dedupes concurrent refresh calls per accountEmail (in-flight cache)', async () => {
    const { store } = makeStore()
    store.addProject({ name: 'Cytus', duplicateFromId: store.get().projects[0].id })
    const ids = store.get().projects.map(p => p.id)
    for (const id of ids) {
      store.setProject(id, {
        google: { ...store.get().projects.find(p => p.id === id)!.google, accountEmail: 'shared@example.com', refreshToken: 'r1', tokenExpiresAt: 0 },
      })
    }
    const refreshFn = vi.fn().mockResolvedValue({ token: 'NEW', tokenExpiresAt: Date.now() + 3600_000 })
    await Promise.all([
      refreshAllExpiringTokens(store, { refreshGoogle: refreshFn }),
      refreshAllExpiringTokens(store, { refreshGoogle: refreshFn }),
    ])
    expect(refreshFn).toHaveBeenCalledTimes(1)
  })
})

describe('refreshAllExpiringTokens — integration with real refreshGoogleAccessToken', () => {
  it('actually calls fetch even when the cached token is not yet expired (force-refresh)', async () => {
    const { store } = makeStore()
    const defId = store.get().projects[0].id
    // Set up a project with a NON-EXPIRED token (1 hour from now). Without
    // forceRefresh, refreshGoogleAccessToken would short-circuit and never
    // call fetch. The proactive sweep needs forceRefresh: true to roll the
    // refresh-token's inactivity timer forward.
    store.setProject(defId, {
      google: {
        ...store.get().projects[0].google,
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
      const active = store.get().projects.find(p => p.google.accountEmail === accountEmail)!
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
    await refreshAllExpiringTokens(store, { refreshGoogle })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.get().projects[0].google.token).toBe('NEW')
  })
})
