import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_AUDIO_ANALYSIS, DEFAULT_HOTKEYS, DEFAULT_RECORDING_PREFERENCES, DEFAULT_SEVERITIES, SettingsStore } from '../settings'
import type { AppSettings } from '@shared/types'

const FALLBACK_DEFAULTS: AppSettings = {
  exportRoot: '/default',
  hotkeys: DEFAULT_HOTKEYS,
  locale: 'system',
  severities: DEFAULT_SEVERITIES,
  audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
  recordingPreferences: DEFAULT_RECORDING_PREFERENCES,
  slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
  gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
  google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
  mentionIdentities: [],
  projects: [{
    id: 'default-fallback',
    name: 'Default',
    slack: { botToken: '', channelId: '' },
    gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue' },
    google: { token: '' },
  }],
  activeProjectId: 'default-fallback',
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
        projects: FALLBACK_DEFAULTS.projects,
        activeProjectId: FALLBACK_DEFAULTS.activeProjectId,
      })

      expect(store.get().slack).toMatchObject({ botToken: '', userToken: '', publishIdentity: 'user', channelId: '', mentionUserIds: [], mentionAliases: {}, mentionUsers: [], usersFetchedAt: null })
      expect(store.get().slack.channels).toEqual([])
      expect(store.get().gitlab).toEqual({ baseUrl: 'https://gitlab.com', token: '', authType: 'pat', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'loupe://gitlab-oauth', projectId: '', mode: 'single-issue', emailLookup: 'off', labels: [], confidential: false, mentionUsernames: [], mentionUsers: [], usersFetchedAt: null, lastUserSyncWarning: null })
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
        projects: FALLBACK_DEFAULTS.projects,
        activeProjectId: FALLBACK_DEFAULTS.activeProjectId,
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
        projects: FALLBACK_DEFAULTS.projects,
        activeProjectId: FALLBACK_DEFAULTS.activeProjectId,
      })

      const settings = store.setSlack({
        botToken: ' xoxb-test ',
        channelId: ' C123 ',
        mentionUserIds: [' <@U123> ', '@U456', 'U123'],
        mentionAliases: { U123: 'Miki', U456: 'QA Lead', U789: 'Unused' },
      })

      expect(settings.exportRoot).toBe('/default')
      expect(settings.slack).toMatchObject({
        botToken: ' xoxb-test ',
        userToken: '',
        publishIdentity: 'bot',
        channelId: ' C123 ',
        mentionUserIds: ['U123', 'U456'],
        mentionAliases: { U123: 'Miki', U456: 'QA Lead' },
        mentionUsers: [],
        usersFetchedAt: null,
      })
      expect(settings.slack.channels).toEqual([])
      expect(store.get().slack.channelId).toBe(' C123 ')
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
        projects: FALLBACK_DEFAULTS.projects,
        activeProjectId: FALLBACK_DEFAULTS.activeProjectId,
      })

      const settings = store.setGitLab({
        baseUrl: ' https://gitlab.example.com/ ',
        token: ' glpat-test ',
        projectId: ' group/project ',
        mode: 'per-marker-issue',
        labels: ['loupe, qa', 'qa'],
        confidential: true,
        mentionUsernames: ['@miki', 'qa'],
      })

      expect(settings.slack.channelId).toBe('')
      expect(settings.gitlab).toEqual({
        baseUrl: 'https://gitlab.example.com',
        token: ' glpat-test ',
        authType: 'pat',
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

  it('normalizes mention identities and merges Slack users', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        locale: 'system',
        severities: DEFAULT_SEVERITIES,
        audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
        projects: FALLBACK_DEFAULTS.projects,
        activeProjectId: FALLBACK_DEFAULTS.activeProjectId,
      })

      const withSlackUsers = store.setSlack({
        botToken: '',
        channelId: '',
        mentionUsers: [{ id: 'U123', name: 'miki', displayName: 'Miki', realName: 'Miki Chen', email: 'MIKI@example.com' }],
      })
      const refreshed = store.refreshMentionIdentities()
      const settings = store.setMentionIdentities([
        ...refreshed.mentionIdentities,
        { id: 'qa-lead', displayName: 'QA Lead', slackUserId: '<@U456>', gitlabUsername: '@qa' },
      ])

      expect(settings.mentionIdentities).toEqual([
        { id: 'miki', displayName: 'Miki', email: 'miki@example.com', slackUserId: 'U123' },
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [{ id: 'miki-slack', displayName: 'Miki Slack', email: 'miki@example.com', slackUserId: 'U123' }],
        projects: FALLBACK_DEFAULTS.projects,
        activeProjectId: FALLBACK_DEFAULTS.activeProjectId,
      })

      const withGitLabUsers = store.setGitLab({
        baseUrl: 'https://gitlab.example.com',
        token: 'glpat-test',
        projectId: 'group/project',
        mode: 'single-issue',
        mentionUsers: [
          { id: 7, username: 'miki', name: 'Different GitLab Name', email: 'MIKI@example.com', state: 'active' },
          { id: 8, username: 'qa', name: 'QA Lead', state: 'active' },
        ],
        usersFetchedAt: '2026-04-30T00:00:00.000Z',
      })
      const settings = store.refreshMentionIdentities()

      expect(settings.mentionIdentities).toEqual([
        { id: 'miki-slack', displayName: 'Miki Slack', email: 'miki@example.com', slackUserId: 'U123', gitlabUsername: 'miki' },
        { id: 'qa-lead', displayName: 'QA Lead', gitlabUsername: 'qa' },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('removes orphan mention identities after a later refresh maps them by email', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        locale: 'system',
        severities: DEFAULT_SEVERITIES,
        audioAnalysis: DEFAULT_AUDIO_ANALYSIS,
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [
          { id: 'miki-gitlab', displayName: 'Miki GitLab', gitlabUsername: 'miki' },
          { id: 'miki-slack', displayName: 'Miki Slack', slackUserId: 'U123' },
        ],
        projects: FALLBACK_DEFAULTS.projects,
        activeProjectId: FALLBACK_DEFAULTS.activeProjectId,
      })

      store.setSlack({
        botToken: '',
        channelId: '',
        mentionUsers: [{ id: 'U123', name: 'miki', displayName: 'Miki Slack', realName: '', email: 'miki@example.com' }],
      })
      store.setGitLab({
        baseUrl: 'https://gitlab.example.com',
        token: 'glpat-test',
        projectId: 'group/project',
        mode: 'single-issue',
        mentionUsers: [{ id: 7, username: 'miki', name: 'Miki GitLab', email: 'MIKI@example.com', state: 'active' }],
      })

      expect(store.refreshMentionIdentities().mentionIdentities).toEqual([
        { id: 'miki-slack', displayName: 'Miki Slack', email: 'miki@example.com', slackUserId: 'U123', gitlabUsername: 'miki' },
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
        projects: FALLBACK_DEFAULTS.projects,
        activeProjectId: FALLBACK_DEFAULTS.activeProjectId,
      })

      store.setSlack({
        botToken: '',
        channelId: '',
        mentionUsers: [{ id: 'U123', name: 'miki', displayName: 'Miki', realName: '', email: 'miki@example.com' }],
      })
      expect(store.refreshMentionIdentities().mentionIdentities).toEqual([
        { id: 'miki', displayName: 'Miki', email: 'miki@example.com', slackUserId: 'U123' },
      ])

      expect(store.setMentionIdentities([]).mentionIdentities).toEqual([])
      expect(store.get().mentionIdentities).toEqual([])
      expect(store.refreshMentionIdentities().mentionIdentities).toEqual([
        { id: 'miki', displayName: 'Miki', email: 'miki@example.com', slackUserId: 'U123' },
      ])
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
      expect(settings.projects).toHaveLength(1)
      expect(settings.projects[0].name).toBe('Default')
      expect(settings.projects[0].slack.botToken).toBe('xoxb-legacy')
      expect(settings.projects[0].gitlab.projectId).toBe('tech-center/cytus')
      expect(settings.projects[0].google.accountEmail).toBe('farllee@rayark.com')
      expect(settings.activeProjectId).toBe(settings.projects[0].id)
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
        projects: [
          { id: existingId, name: 'Cytus', slack: { channelId: 'C-cytus' }, gitlab: { baseUrl: 'https://gitlab.rayark.com' }, google: {} },
        ],
        activeProjectId: existingId,
      }))
      const store = new SettingsStore(filePath, FALLBACK_DEFAULTS)
      const settings = store.get()
      expect(settings.projects).toHaveLength(1)
      expect(settings.projects[0].id).toBe(existingId)
      expect(settings.projects[0].name).toBe('Cytus')
      expect(settings.activeProjectId).toBe(existingId)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('renames duplicate project names with a suffix', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const filePath = join(tmp, 'settings.json')
      writeFileSync(filePath, JSON.stringify({
        projects: [
          { id: 'a', name: 'Cytus', slack: {}, gitlab: {}, google: {} },
          { id: 'b', name: 'Cytus', slack: {}, gitlab: {}, google: {} },
        ],
        activeProjectId: 'a',
      }))
      const store = new SettingsStore(filePath, FALLBACK_DEFAULTS)
      const projects = store.get().projects
      expect(projects.map(p => p.name)).toEqual(['Cytus', 'Cytus (2)'])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('falls back activeProjectId to the first project when stored id is invalid', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const filePath = join(tmp, 'settings.json')
      writeFileSync(filePath, JSON.stringify({
        projects: [{ id: 'a', name: 'Default', slack: {}, gitlab: {}, google: {} }],
        activeProjectId: 'nonexistent',
      }))
      expect(new SettingsStore(filePath, FALLBACK_DEFAULTS).get().activeProjectId).toBe('a')
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
      const first = store.get().projects[0].id
      const second = store.get().projects[0].id
      expect(second).toBe(first)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.addProject', () => {
  it('adds a new project with a unique id and name; sets activeProjectId to the new project', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const after = store.addProject({ name: 'Cytus' })
      expect(after.projects).toHaveLength(2)
      expect(after.projects[1].name).toBe('Cytus')
      expect(after.activeProjectId).toBe(after.projects[1].id)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects duplicate names', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      expect(() => store.addProject({ name: 'Default' })).toThrow(/already exists|duplicate/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('with duplicateFromId carries over slack/gitlab/google including OAuth tokens', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const original = store.get().projects[0]
      // Set up the source project with non-trivial values
      store.setProject(original.id, {
        slack: { ...original.slack, botToken: 'xoxb-fixture', channelId: 'C1' },
        gitlab: { ...original.gitlab, token: 'glpat-x', projectId: 'group/proj' },
        google: { ...original.google, token: 'g-tok', accountEmail: 'a@b.com' },
      })
      const after = store.addProject({ name: 'Cytus', duplicateFromId: original.id })
      const cytus = after.projects.find(p => p.name === 'Cytus')!
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

describe('SettingsStore.renameProject', () => {
  it('renames the project name', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const id = store.get().projects[0].id
      const after = store.renameProject(id, 'Renamed')
      expect(after.projects[0].name).toBe('Renamed')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects rename to an already-taken name', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      store.addProject({ name: 'Cytus' })
      const defaultId = store.get().projects.find(p => p.name === 'Default')!.id
      expect(() => store.renameProject(defaultId, 'Cytus')).toThrow(/already exists|duplicate/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('throws on unknown id', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      expect(() => store.renameProject('nonexistent', 'X')).toThrow(/not found|unknown/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.deleteProject', () => {
  it('deletes a project; updates activeProjectId if it was active', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const cytus = store.addProject({ name: 'Cytus' }).projects.find(p => p.name === 'Cytus')!
      // activeProjectId is now Cytus's id (addProject made it active)
      const after = store.deleteProject(cytus.id)
      expect(after.projects.find(p => p.id === cytus.id)).toBeUndefined()
      expect(after.activeProjectId).toBe(after.projects[0].id)  // first remaining
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('refuses to delete the last project', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const onlyId = store.get().projects[0].id
      expect(() => store.deleteProject(onlyId)).toThrow(/cannot delete the last|at least one/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.setActiveProject', () => {
  it('updates activeProjectId', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const cytus = store.addProject({ name: 'Cytus' }).projects.find(p => p.name === 'Cytus')!
      const defaultId = store.get().projects.find(p => p.name === 'Default')!.id
      const after = store.setActiveProject(defaultId)
      expect(after.activeProjectId).toBe(defaultId)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects unknown id', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      expect(() => store.setActiveProject('nonexistent')).toThrow(/not found|unknown/i)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.setProject', () => {
  it('merges the patch into the named project', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const id = store.get().projects[0].id
      const after = store.setProject(id, {
        slack: { ...store.get().projects[0].slack, channelId: 'C-new' },
      })
      expect(after.projects[0].slack.channelId).toBe('C-new')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('SettingsStore.setProject — token sync', () => {
  it('propagates Google token to siblings sharing the same accountEmail', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const store = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const defaultId = store.get().projects[0].id
      // Set up Default with a Google account
      store.setProject(defaultId, {
        google: { ...store.get().projects[0].google, accountEmail: 'shared@example.com', token: 'old-token', refreshToken: 'old-refresh' },
      })
      // Add Cytus with same email
      store.addProject({ name: 'Cytus', duplicateFromId: defaultId })
      const cytusId = store.get().projects.find(p => p.name === 'Cytus')!.id
      // Add Deemo with DIFFERENT email
      store.addProject({ name: 'Deemo' })
      const deemoId = store.get().projects.find(p => p.name === 'Deemo')!.id
      store.setProject(deemoId, {
        google: { ...store.get().projects.find(p => p.id === deemoId)!.google, accountEmail: 'other@example.com', token: 'other-token' },
      })
      // Now refresh Default's Google token — should sync to Cytus but not Deemo.
      const after = store.setProject(defaultId, {
        google: { ...store.get().projects[0].google, token: 'new-token', tokenExpiresAt: 999 },
      })
      const def = after.projects.find(p => p.id === defaultId)!
      const cyt = after.projects.find(p => p.id === cytusId)!
      const dee = after.projects.find(p => p.id === deemoId)!
      expect(def.google.token).toBe('new-token')
      expect(cyt.google.token).toBe('new-token')
      expect(dee.google.token).toBe('other-token')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
