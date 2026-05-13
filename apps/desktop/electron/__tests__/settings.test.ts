import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_AUDIO_ANALYSIS, DEFAULT_HOTKEYS, DEFAULT_RECORDING_PREFERENCES, DEFAULT_SEVERITIES, SettingsStore, findProfileByIdOrActive } from '../settings'
import { DEFAULT_MARKER_FIELD_PRESETS } from '@shared/markerFieldPresets'
import type { AppSettings } from '@shared/types'

const FALLBACK_DEFAULTS: AppSettings = {
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
    google: { token: '' },
  }],
  activeProfileId: 'default-fallback',
}

describe('SettingsStore', () => {
  it('normalizes missing Slack settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      writeFileSync(file, JSON.stringify({ exportRoot: '/exports', hotkeys: DEFAULT_HOTKEYS }))
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        locale: 'system',
        severities: DEFAULT_SEVERITIES,
        audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
        mentionIdentities: [],
        profiles: FALLBACK_DEFAULTS.profiles,
        activeProfileId: FALLBACK_DEFAULTS.activeProfileId,
      })

      expect(store.get().profiles[0].slack).toMatchObject({ botToken: '', userToken: '', publishIdentity: 'user', channelId: '', mentionUserIds: [], mentionAliases: {}, mentionUsers: [], usersFetchedAt: null })
      expect(store.get().profiles[0].slack.channels).toEqual([])
      expect(store.get().profiles[0].gitlab).toEqual({ baseUrl: 'https://gitlab.com', token: '', authType: 'oauth', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'loupe://gitlab-oauth', projectId: '', mode: 'single-issue', emailLookup: 'off', labels: [], confidential: false, mentionUsernames: [], mentionUsers: [], usersFetchedAt: null, lastUserSyncWarning: null })
      expect(store.get().mentionIdentities).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('normalizes and saves recording preferences', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      writeFileSync(file, JSON.stringify({ recordingPreferences: { recordMic: false } }))
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        locale: 'system',
        severities: DEFAULT_SEVERITIES,
        audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
        recordingPreferences: DEFAULT_RECORDING_PREFERENCES,
        mentionIdentities: [],
        profiles: FALLBACK_DEFAULTS.profiles,
        activeProfileId: FALLBACK_DEFAULTS.activeProfileId,
      })

      expect(store.get().recordingPreferences).toEqual({ recordMic: false, iosLaunchApp: true, recordSystemAudio: false })
      expect(store.setRecordingPreferences({ recordMic: true, iosLaunchApp: false, recordSystemAudio: true }).recordingPreferences).toEqual({ recordMic: true, iosLaunchApp: false, recordSystemAudio: true })
      expect(store.get().recordingPreferences).toEqual({ recordMic: true, iosLaunchApp: false, recordSystemAudio: true })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('saves Slack publish settings without changing other settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        locale: 'system',
        severities: DEFAULT_SEVERITIES,
        audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
        mentionIdentities: [],
        profiles: FALLBACK_DEFAULTS.profiles,
        activeProfileId: FALLBACK_DEFAULTS.activeProfileId,
      })

      const projectId = store.get().profiles[0].id
      const settings = store.setProfile(projectId, {
        slack: {
          botToken: ' xoxb-test ',
          channelId: ' C123 ',
          mentionUserIds: [' <@U123> ', '@U456', 'U123'],
          mentionAliases: { U123: 'Miki', U456: 'QA Lead', U789: 'Unused' },
        },
      })

      expect(settings.exportRoot).toBe('/default')
      expect(settings.profiles[0].slack).toMatchObject({
        botToken: ' xoxb-test ',
        userToken: '',
        publishIdentity: 'bot',
        channelId: ' C123 ',
        mentionUserIds: ['U123', 'U456'],
        mentionAliases: { U123: 'Miki', U456: 'QA Lead' },
        mentionUsers: [],
        usersFetchedAt: null,
      })
      expect(settings.profiles[0].slack.channels).toEqual([])
      expect(store.get().profiles[0].slack.channelId).toBe(' C123 ')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('saves GitLab publish settings without changing Slack settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        locale: 'system',
        severities: DEFAULT_SEVERITIES,
        audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
        mentionIdentities: [],
        profiles: FALLBACK_DEFAULTS.profiles,
        activeProfileId: FALLBACK_DEFAULTS.activeProfileId,
      })

      const projectId = store.get().profiles[0].id
      const settings = store.setProfile(projectId, {
        gitlab: {
          baseUrl: ' https://gitlab.example.com/ ',
          token: ' glpat-test ',
          projectId: ' group/project ',
          mode: 'per-marker-issue',
          labels: ['loupe, qa', 'qa'],
          confidential: true,
          mentionUsernames: ['@miki', 'qa'],
        },
      })

      expect(settings.profiles[0].slack.channelId).toBe('')
      expect(settings.profiles[0].gitlab).toEqual({
        baseUrl: 'https://gitlab.example.com',
        token: ' glpat-test ',
        authType: 'oauth',
        oauthClientId: '',
        oauthClientSecret: '',
        oauthRedirectUri: 'loupe://gitlab-oauth',
        projectId: 'group/project',
        mode: 'per-marker-issue',
        emailLookup: 'off',
        labels: ['loupe', 'qa'],
        confidential: true,
        mentionUsernames: ['miki', 'qa'],
        mentionUsers: [],
        usersFetchedAt: null,
        lastUserSyncWarning: null,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not auto-create mention identities from synced Slack users and normalizes manual entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        locale: 'system',
        severities: DEFAULT_SEVERITIES,
        audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
        mentionIdentities: [],
        profiles: FALLBACK_DEFAULTS.profiles,
        activeProfileId: FALLBACK_DEFAULTS.activeProfileId,
      })

      const projectId = store.get().profiles[0].id
      store.setProfile(projectId, {
        slack: {
          botToken: '',
          channelId: '',
          mentionUsers: [{ id: 'U123', name: 'miki', displayName: 'Miki', realName: 'Miki Chen', email: 'MIKI@example.com' }],
        },
      })

      // Workspace sync alone never creates identities — the table is a
      // user-curated mapping, not a mirror of every Slack member.
      expect(store.refreshMentionIdentities().mentionIdentities).toEqual([])

      const settings = store.setMentionIdentities([
        { id: 'qa-lead', displayName: 'QA Lead', slackUserId: '<@U456>', gitlabUsername: '@qa' },
      ])

      expect(settings.mentionIdentities).toEqual([
        { id: 'qa-lead', displayName: 'QA Lead', slackUserId: 'U456', gitlabUsername: 'qa' },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('merges GitLab users into existing mention identities by email before name', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        locale: 'system',
        severities: DEFAULT_SEVERITIES,
        audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
        mentionIdentities: [{ id: 'miki-slack', displayName: 'Miki Slack', email: 'miki@example.com', slackUserId: 'U123' }],
        profiles: FALLBACK_DEFAULTS.profiles,
        activeProfileId: FALLBACK_DEFAULTS.activeProfileId,
      })

      const projectId = store.get().profiles[0].id
      store.setProfile(projectId, {
        gitlab: {
          baseUrl: 'https://gitlab.example.com',
          token: 'glpat-test',
          projectId: 'group/project',
          mode: 'single-issue',
          mentionUsers: [
            { id: 7, username: 'miki', name: 'Different GitLab Name', email: 'MIKI@example.com', state: 'active' },
            { id: 8, username: 'qa', name: 'QA Lead', state: 'active' },
          ],
          usersFetchedAt: '2026-04-30T00:00:00.000Z',
        },
      })
      const settings = store.refreshMentionIdentities()

      // miki-slack is enriched with gitlabUsername (matched by email).
      // The GitLab "qa" user is NOT auto-added — no existing identity to
      // attach to means the workspace member stays out of the mapping table.
      expect(settings.mentionIdentities).toEqual([
        { id: 'miki-slack', displayName: 'Miki Slack', email: 'miki@example.com', slackUserId: 'U123', gitlabUsername: 'miki' },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('consolidates separate Slack-only and GitLab-only identities once a later refresh links them by email', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        locale: 'system',
        severities: DEFAULT_SEVERITIES,
        audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
        mentionIdentities: [
          { id: 'miki-gitlab', displayName: 'Miki GitLab', gitlabUsername: 'miki' },
          { id: 'miki-slack', displayName: 'Miki Slack', slackUserId: 'U123' },
        ],
        profiles: FALLBACK_DEFAULTS.profiles,
        activeProfileId: FALLBACK_DEFAULTS.activeProfileId,
      })

      const projectId = store.get().profiles[0].id
      store.setProfile(projectId, {
        slack: {
          botToken: '',
          channelId: '',
          mentionUsers: [{ id: 'U123', name: 'miki', displayName: 'Miki Slack', realName: '', email: 'miki@example.com' }],
        },
      })
      store.setProfile(projectId, {
        gitlab: {
          baseUrl: 'https://gitlab.example.com',
          token: 'glpat-test',
          projectId: 'group/project',
          mode: 'single-issue',
          mentionUsers: [{ id: 7, username: 'miki', name: 'Miki GitLab', email: 'MIKI@example.com', state: 'active' }],
        },
      })

      // After enrichment both rows acquire the shared email; consolidate
      // picks the first-encountered identity (miki-gitlab) as the keeper
      // and merges miki-slack's provider id into it. Either id is a
      // semantically valid keeper — the test asserts the deterministic
      // ordering produced by Map-insertion order over the input.
      expect(store.refreshMentionIdentities().mentionIdentities).toEqual([
        { id: 'miki-gitlab', displayName: 'Miki GitLab', email: 'miki@example.com', slackUserId: 'U123', gitlabUsername: 'miki' },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not re-add fetched users when manually saving mention identities', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        locale: 'system',
        severities: DEFAULT_SEVERITIES,
        audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
        mentionIdentities: [],
        profiles: FALLBACK_DEFAULTS.profiles,
        activeProfileId: FALLBACK_DEFAULTS.activeProfileId,
      })

      const projectId = store.get().profiles[0].id
      store.setProfile(projectId, {
        slack: {
          botToken: '',
          channelId: '',
          mentionUsers: [{ id: 'U123', name: 'miki', displayName: 'Miki', realName: '', email: 'miki@example.com' }],
        },
      })

      // Workspace sync alone never auto-creates; identities only appear
      // after the user adds them explicitly.
      expect(store.refreshMentionIdentities().mentionIdentities).toEqual([])

      const settings = store.setMentionIdentities([
        { id: 'miki', displayName: 'Miki', email: 'miki@example.com', slackUserId: 'U123' },
      ])
      expect(settings.mentionIdentities).toEqual([
        { id: 'miki', displayName: 'Miki', email: 'miki@example.com', slackUserId: 'U123' },
      ])

      // After explicit clear, a later refresh must not resurrect the
      // workspace user — the empty state is user intent, not a stale
      // pre-sync snapshot.
      expect(store.setMentionIdentities([]).mentionIdentities).toEqual([])
      expect(store.get().mentionIdentities).toEqual([])
      expect(store.refreshMentionIdentities().mentionIdentities).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('multi-project migration', () => {
  it('produces a single Default project from legacy top-level slack/gitlab/google', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const filePath = join(tmp, 'settings.json')
      writeFileSync(filePath, JSON.stringify({
        slack: { botToken: 'xoxb-legacy', channelId: 'C1' },
        gitlab: { baseUrl: 'https://gitlab.rayark.com', projectId: 'tech-center/cytus' },
        google: { token: 'g-token', accountEmail: 'farllee@rayark.com' },
      }))
      const store = new SettingsStore(filePath, FALLBACK_DEFAULTS)
      const settings = store.get()
      expect(settings.profiles).toHaveLength(1)
      expect(settings.profiles[0].name).toBe('Default')
      expect(settings.profiles[0].slack.botToken).toBe('xoxb-legacy')
      expect(settings.profiles[0].gitlab.projectId).toBe('tech-center/cytus')
      expect(settings.profiles[0].google.accountEmail).toBe('farllee@rayark.com')
      expect(settings.activeProfileId).toBe(settings.profiles[0].id)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('preserves existing projects[] when settings.json already has the new shape', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const filePath = join(tmp, 'settings.json')
      const existingId = '11111111-1111-1111-1111-111111111111'
      writeFileSync(filePath, JSON.stringify({
        profiles: [
          { id: existingId, name: 'Cytus', slack: { channelId: 'C-cytus' }, gitlab: { baseUrl: 'https://gitlab.rayark.com' }, google: {} },
        ],
        activeProfileId: existingId,
      }))
      const store = new SettingsStore(filePath, FALLBACK_DEFAULTS)
      const settings = store.get()
      expect(settings.profiles).toHaveLength(1)
      expect(settings.profiles[0].id).toBe(existingId)
      expect(settings.profiles[0].name).toBe('Cytus')
      expect(settings.activeProfileId).toBe(existingId)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('persists default marker field presets for projects that do not have them yet', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      writeFileSync(file, JSON.stringify({
        exportRoot: '/exports',
        hotkeys: DEFAULT_HOTKEYS,
        activeProfileId: 'p1',
        profiles: [
          { id: 'p1', name: 'Default', slack: {}, gitlab: {}, google: {} },
        ],
      }))
      const store = new SettingsStore(file, FALLBACK_DEFAULTS)

      const settings = store.get()
      expect(settings.profiles[0].markerFieldPresets).toEqual(DEFAULT_MARKER_FIELD_PRESETS)

      const persisted = JSON.parse(readFileSync(file, 'utf8')) as AppSettings
      expect(persisted.profiles[0].markerFieldPresets).toEqual(DEFAULT_MARKER_FIELD_PRESETS)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('renames duplicate project names with a suffix', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const filePath = join(tmp, 'settings.json')
      writeFileSync(filePath, JSON.stringify({
        profiles: [
          { id: 'a', name: 'Cytus', slack: {}, gitlab: {}, google: {} },
          { id: 'b', name: 'Cytus', slack: {}, gitlab: {}, google: {} },
        ],
        activeProfileId: 'a',
      }))
      const store = new SettingsStore(filePath, FALLBACK_DEFAULTS)
      const projects = store.get().profiles
      expect(projects.map(p => p.name)).toEqual(['Cytus', 'Cytus (2)'])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('falls back activeProfileId to the first project when stored id is invalid', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const filePath = join(tmp, 'settings.json')
      writeFileSync(filePath, JSON.stringify({
        profiles: [{ id: 'a', name: 'Default', slack: {}, gitlab: {}, google: {} }],
        activeProfileId: 'nonexistent',
      }))
      expect(new SettingsStore(filePath, FALLBACK_DEFAULTS).get().activeProfileId).toBe('a')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('persists the migrated projects[] so UUIDs are stable across get() calls', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const filePath = join(tmp, 'settings.json')
      writeFileSync(filePath, JSON.stringify({
        slack: { botToken: 'xoxb-legacy', channelId: 'C1' },
        gitlab: { baseUrl: 'https://gitlab.rayark.com' },
        google: { token: 'g-token' },
      }))
      const store = new SettingsStore(filePath, FALLBACK_DEFAULTS)
      const first = store.get().profiles[0].id
      const second = store.get().profiles[0].id
      expect(second).toBe(first)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.addProfile', () => {
  it('adds a new project with a unique id and name; sets activeProfileId to the new project', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const after = store.addProfile({ name: 'Cytus' })
      expect(after.profiles).toHaveLength(2)
      expect(after.profiles[1].name).toBe('Cytus')
      expect(after.activeProfileId).toBe(after.profiles[1].id)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects duplicate names', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      expect(() => store.addProfile({ name: 'Default' })).toThrow(/already exists|duplicate/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('with duplicateFromId carries over slack/gitlab/google including OAuth tokens', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const original = store.get().profiles[0]
      // Set up the source project with non-trivial values
      store.setProfile(original.id, {
        slack: { ...original.slack, botToken: 'xoxb-fixture', channelId: 'C1' },
        gitlab: { ...original.gitlab, token: 'glpat-x', projectId: 'group/proj' },
        google: { ...original.google, token: 'g-tok', accountEmail: 'a@b.com' },
      })
      const after = store.addProfile({ name: 'Cytus', duplicateFromId: original.id })
      const cytus = after.profiles.find(p => p.name === 'Cytus')!
      expect(cytus.slack.botToken).toBe('xoxb-fixture')
      expect(cytus.slack.channelId).toBe('C1')
      expect(cytus.gitlab.token).toBe('glpat-x')
      expect(cytus.gitlab.projectId).toBe('group/proj')
      expect(cytus.google.token).toBe('g-tok')
      expect(cytus.google.accountEmail).toBe('a@b.com')
      expect(cytus.id).not.toBe(original.id)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.renameProfile', () => {
  it('renames the project name', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const id = store.get().profiles[0].id
      const after = store.renameProfile(id, 'Renamed')
      expect(after.profiles[0].name).toBe('Renamed')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects rename to an already-taken name', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      store.addProfile({ name: 'Cytus' })
      const defaultId = store.get().profiles.find(p => p.name === 'Default')!.id
      expect(() => store.renameProfile(defaultId, 'Cytus')).toThrow(/already exists|duplicate/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('throws on unknown id', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      expect(() => store.renameProfile('nonexistent', 'X')).toThrow(/not found|unknown/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('returns the truncated canonical name; renames are based on the canonical name', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const id = store.get().profiles[0].id
      const longName = 'A'.repeat(80)
      const after = store.renameProfile(id, longName)
      const canonical = after.profiles.find(p => p.id === id)!.name
      expect(canonical.length).toBe(50)
      expect(canonical).toBe('A'.repeat(50))
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('findProfileByIdOrActive', () => {
  it('returns the project with the given id', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      store.addProfile({ name: 'Cytus' })
      const settings = store.get()
      // Pick a non-active project to make the difference observable.
      const inactive = settings.profiles.find(p => p.id !== settings.activeProfileId)!
      expect(findProfileByIdOrActive(settings, inactive.id).id).toBe(inactive.id)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('falls back to active when id is unknown', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      store.addProfile({ name: 'Cytus' })
      const settings = store.get()
      expect(findProfileByIdOrActive(settings, 'nonexistent').id).toBe(settings.activeProfileId)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.deleteProfile', () => {
  it('deletes a project; updates activeProfileId if it was active', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const cytus = store.addProfile({ name: 'Cytus' }).profiles.find(p => p.name === 'Cytus')!
      // activeProfileId is now Cytus's id (addProfile made it active)
      const after = store.deleteProfile(cytus.id)
      expect(after.profiles.find(p => p.id === cytus.id)).toBeUndefined()
      expect(after.activeProfileId).toBe(after.profiles[0].id)  // first remaining
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('refuses to delete the last project', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const onlyId = store.get().profiles[0].id
      expect(() => store.deleteProfile(onlyId)).toThrow(/cannot delete the last|at least one/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.setActiveProfile', () => {
  it('updates activeProfileId', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const cytus = store.addProfile({ name: 'Cytus' }).profiles.find(p => p.name === 'Cytus')!
      const defaultId = store.get().profiles.find(p => p.name === 'Default')!.id
      const after = store.setActiveProfile(defaultId)
      expect(after.activeProfileId).toBe(defaultId)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects unknown id', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      expect(() => store.setActiveProfile('nonexistent')).toThrow(/not found|unknown/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.setProfile', () => {
  it('merges the patch into the named project', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const id = store.get().profiles[0].id
      const after = store.setProfile(id, {
        slack: { ...store.get().profiles[0].slack, channelId: 'C-new' },
      })
      expect(after.profiles[0].slack.channelId).toBe('C-new')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('legacy projects[] migration to profiles[]', () => {
  it('reads legacy projects/activeProjectId and writes back as profiles/activeProfileId', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-migrate-'))
    try {
      const filePath = join(tmp, 'settings.json')
      writeFileSync(filePath, JSON.stringify({
        exportRoot: '/x',
        projects: [{ id: 'p1', name: 'OldStyle', slack: { botToken: '', channelId: '' }, gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue' }, google: { token: '' } }],
        activeProjectId: 'p1',
      }))
      const store = new SettingsStore(filePath, FALLBACK_DEFAULTS)
      const settings = store.get()
      expect(settings.profiles[0].id).toBe('p1')
      expect(settings.profiles[0].name).toBe('OldStyle')
      expect(settings.activeProfileId).toBe('p1')

      // Trigger a write so we can verify the legacy keys are gone on disk
      store.setProfile('p1', { slack: { ...settings.profiles[0].slack } })
      const persisted = JSON.parse(readFileSync(filePath, 'utf8'))
      expect(persisted.profiles).toBeDefined()
      expect(persisted.activeProfileId).toBeDefined()
      expect(persisted.projects).toBeUndefined()
      expect(persisted.activeProjectId).toBeUndefined()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.setProfile — token sync', () => {
  it('propagates Google token to siblings sharing the same accountEmail', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const defaultId = store.get().profiles[0].id
      // Set up Default with a Google account
      store.setProfile(defaultId, {
        google: { ...store.get().profiles[0].google, accountEmail: 'shared@example.com', token: 'old-token', refreshToken: 'old-refresh' },
      })
      // Add Cytus with same email
      store.addProfile({ name: 'Cytus', duplicateFromId: defaultId })
      const cytusId = store.get().profiles.find(p => p.name === 'Cytus')!.id
      // Add Deemo with DIFFERENT email
      store.addProfile({ name: 'Deemo' })
      const deemoId = store.get().profiles.find(p => p.name === 'Deemo')!.id
      store.setProfile(deemoId, {
        google: { ...store.get().profiles.find(p => p.id === deemoId)!.google, accountEmail: 'other@example.com', token: 'other-token' },
      })
      // Now refresh Default's Google token — should sync to Cytus but not Deemo.
      const after = store.setProfile(defaultId, {
        google: { ...store.get().profiles[0].google, token: 'new-token', tokenExpiresAt: 999 },
      })
      const def = after.profiles.find(p => p.id === defaultId)!
      const cyt = after.profiles.find(p => p.id === cytusId)!
      const dee = after.profiles.find(p => p.id === deemoId)!
      expect(def.google.token).toBe('new-token')
      expect(cyt.google.token).toBe('new-token')
      expect(dee.google.token).toBe('other-token')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('clears refreshError on siblings when source clears its own', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const defaultId = store.get().profiles[0].id
      // Set both projects to share an account AND have a refreshError
      store.setProfile(defaultId, {
        google: { ...store.get().profiles[0].google, accountEmail: 'shared@example.com', token: 't1', refreshError: { at: 1, code: 'invalid_grant' } },
      })
      store.addProfile({ name: 'Cytus', duplicateFromId: defaultId })
      const cytusId = store.get().profiles.find(p => p.name === 'Cytus')!.id
      // Both should now have refreshError set
      expect(store.get().profiles.find(p => p.id === defaultId)!.google.refreshError).toBeDefined()
      expect(store.get().profiles.find(p => p.id === cytusId)!.google.refreshError).toBeDefined()
      // Now refresh Default's Google: clear refreshError + new token
      store.setProfile(defaultId, {
        google: { ...store.get().profiles[0].google, token: 'fresh-token', refreshError: undefined },
      })
      // Cytus's refreshError should ALSO be cleared via sync
      const cytusGoogle = store.get().profiles.find(p => p.id === cytusId)!.google
      expect(cytusGoogle.refreshError).toBeUndefined()
      expect(cytusGoogle.token).toBe('fresh-token')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
