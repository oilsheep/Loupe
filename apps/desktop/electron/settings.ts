import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { HotkeySettings } from '@shared/types'

export interface AppSettings {
  exportRoot: string
  hotkeys: HotkeySettings
}

export const DEFAULT_HOTKEYS: HotkeySettings = {
  improvement: 'F6',
  minor: 'F7',
  normal: 'F8',
  major: 'F9',
}

function normalizeHotkeys(raw?: Partial<HotkeySettings> & { note?: string }): HotkeySettings {
  return {
    improvement: raw?.improvement || DEFAULT_HOTKEYS.improvement,
    minor: raw?.minor || DEFAULT_HOTKEYS.minor,
    normal: raw?.normal || DEFAULT_HOTKEYS.normal,
    major: raw?.major || DEFAULT_HOTKEYS.major,
  }
}

export class SettingsStore {
  constructor(private filePath: string, private defaults: AppSettings) {}

  get(): AppSettings {
    if (!existsSync(this.filePath)) return this.defaults
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AppSettings>
      return {
        exportRoot: raw.exportRoot || this.defaults.exportRoot,
        hotkeys: normalizeHotkeys(raw.hotkeys),
      }
    } catch {
      return this.defaults
    }
  }

  setExportRoot(exportRoot: string): AppSettings {
    const next = { ...this.get(), exportRoot }
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  }

  setHotkeys(hotkeys: HotkeySettings): AppSettings {
    const next = { ...this.get(), hotkeys: normalizeHotkeys(hotkeys) }
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  }
}
