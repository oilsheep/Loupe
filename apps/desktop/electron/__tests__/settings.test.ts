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
})
