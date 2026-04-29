import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_HOTKEYS, SettingsStore } from '../settings'

describe('SettingsStore', () => {
  it('normalizes missing Slack settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-settings-'))
    try {
      const file = join(root, 'settings.json')
      writeFileSync(file, JSON.stringify({ exportRoot: '/exports', hotkeys: DEFAULT_HOTKEYS }))
      const store = new SettingsStore(file, {
        exportRoot: '/default',
        hotkeys: DEFAULT_HOTKEYS,
        slack: { botToken: '', channelId: '' },
      })

      expect(store.get().slack).toEqual({ botToken: '', channelId: '' })
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
        slack: { botToken: '', channelId: '' },
      })

      const settings = store.setSlack({ botToken: ' xoxb-test ', channelId: ' C123 ' })

      expect(settings.exportRoot).toBe('/default')
      expect(settings.slack).toEqual({ botToken: ' xoxb-test ', channelId: ' C123 ' })
      expect(store.get().slack.channelId).toBe(' C123 ')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
