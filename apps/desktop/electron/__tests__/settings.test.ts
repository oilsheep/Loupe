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
      })

      expect(store.get().slack).toEqual({ botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {}, mentionUsers: [], usersFetchedAt: null })
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
})
