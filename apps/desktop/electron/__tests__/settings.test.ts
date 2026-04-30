import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_HOTKEYS, DEFAULT_SEVERITIES, SettingsStore } from '../settings'

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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
      })

      expect(store.get().slack).toMatchObject({ botToken: '', userToken: '', publishIdentity: 'user', channelId: '', mentionUserIds: [], mentionAliases: {}, mentionUsers: [], usersFetchedAt: null })
      expect(store.get().slack.channels).toEqual([])
      expect(store.get().gitlab).toEqual({ baseUrl: 'https://gitlab.com', token: '', authType: 'pat', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: '', projectId: '', mode: 'single-issue', emailLookup: 'off', labels: [], confidential: false, mentionUsernames: [], mentionUsers: [], usersFetchedAt: null, lastUserSyncWarning: null })
      expect(store.get().mentionIdentities).toEqual([])
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
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
        publishIdentity: 'user',
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
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
        oauthRedirectUri: '',
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [{ id: 'miki-slack', displayName: 'Miki Slack', email: 'miki@example.com', slackUserId: 'U123' }],
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [
          { id: 'miki-gitlab', displayName: 'Miki GitLab', gitlabUsername: 'miki' },
          { id: 'miki-slack', displayName: 'Miki Slack', slackUserId: 'U123' },
        ],
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
        slack: { botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {} },
        gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
        mentionIdentities: [],
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
