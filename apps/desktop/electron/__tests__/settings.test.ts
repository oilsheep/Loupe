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
      })

      expect(store.get().slack).toEqual({ botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {}, mentionUsers: [], usersFetchedAt: null })
      expect(store.get().gitlab).toEqual({ baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] })
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
      })

      const settings = store.setSlack({
        botToken: ' xoxb-test ',
        channelId: ' C123 ',
        mentionUserIds: [' <@U123> ', '@U456', 'U123'],
        mentionAliases: { U123: 'Miki', U456: 'QA Lead', U789: 'Unused' },
      })

      expect(settings.exportRoot).toBe('/default')
      expect(settings.slack).toEqual({
        botToken: ' xoxb-test ',
        channelId: ' C123 ',
        mentionUserIds: ['U123', 'U456'],
        mentionAliases: { U123: 'Miki', U456: 'QA Lead' },
        mentionUsers: [],
        usersFetchedAt: null,
      })
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
        projectId: 'group/project',
        mode: 'per-marker-issue',
        labels: ['loupe', 'qa'],
        confidential: true,
        mentionUsernames: ['miki', 'qa'],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
