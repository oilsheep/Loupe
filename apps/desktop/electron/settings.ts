import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AppLocale, AppSettings, BugSeverity, HotkeySettings, SeveritySettings, SlackPublishSettings } from '@shared/types'

export const DEFAULT_HOTKEYS: HotkeySettings = {
  improvement: 'F6',
  minor: 'F7',
  normal: 'F8',
  major: 'F9',
}

export const DEFAULT_SEVERITIES: SeveritySettings = {
  note: { label: 'note', color: '#a1a1aa' },
  major: { label: 'Critical', color: '#ff4d4f' },
  normal: { label: 'Bug', color: '#f59e0b' },
  minor: { label: 'Polish', color: '#22b8f0' },
  improvement: { label: 'Note', color: '#22c55e' },
  custom1: { label: '', color: '#8b5cf6' },
  custom2: { label: '', color: '#ec4899' },
  custom3: { label: '', color: '#14b8a6' },
  custom4: { label: '', color: '#eab308' },
}

const REQUIRED_SEVERITY_KEYS: BugSeverity[] = ['note', 'major', 'normal', 'minor', 'improvement']
const OPTIONAL_SEVERITY_KEYS: BugSeverity[] = ['custom1', 'custom2', 'custom3', 'custom4']
const SEVERITY_KEYS: BugSeverity[] = [...REQUIRED_SEVERITY_KEYS, ...OPTIONAL_SEVERITY_KEYS]
const LEGACY_DEFAULT_LABELS: Partial<Record<BugSeverity, string>> = {
  major: 'major',
  normal: 'normal',
  minor: 'minor',
  improvement: 'improvement',
}

function normalizeHotkeys(raw?: Partial<HotkeySettings> & { note?: string }): HotkeySettings {
  return {
    improvement: raw?.improvement || DEFAULT_HOTKEYS.improvement,
    minor: raw?.minor || DEFAULT_HOTKEYS.minor,
    normal: raw?.normal || DEFAULT_HOTKEYS.normal,
    major: raw?.major || DEFAULT_HOTKEYS.major,
  }
}

function normalizeSlack(raw?: Partial<SlackPublishSettings>): SlackPublishSettings {
  return {
    botToken: raw?.botToken || '',
    channelId: raw?.channelId || '',
  }
}

function normalizeLocale(raw?: string): AppLocale {
  if (raw === 'system' || raw === 'en' || raw === 'zh-TW' || raw === 'zh-CN' || raw === 'ja' || raw === 'ko' || raw === 'es') return raw
  return 'system'
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

function normalizeSeverities(raw?: Partial<SeveritySettings>): SeveritySettings {
  const out = { ...DEFAULT_SEVERITIES }
  for (const key of SEVERITY_KEYS) {
    const incoming = raw?.[key]
    const incomingLabel = incoming?.label?.trim()
    const legacyDefault = LEGACY_DEFAULT_LABELS[key]
    out[key] = {
      label: REQUIRED_SEVERITY_KEYS.includes(key)
        ? (!incomingLabel || incomingLabel === legacyDefault ? DEFAULT_SEVERITIES[key].label : incomingLabel)
        : (incomingLabel || ''),
      color: normalizeColor(incoming?.color, DEFAULT_SEVERITIES[key].color),
    }
  }
  return out
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
        locale: normalizeLocale(raw.locale),
        severities: normalizeSeverities(raw.severities),
        slack: normalizeSlack(raw.slack),
      }
    } catch {
      return this.defaults
    }
  }

  setExportRoot(exportRoot: string): AppSettings {
    const next = { ...this.get(), exportRoot }
    this.write(next)
    return next
  }

  setHotkeys(hotkeys: HotkeySettings): AppSettings {
    const next = { ...this.get(), hotkeys: normalizeHotkeys(hotkeys) }
    this.write(next)
    return next
  }

  setSlack(slack: SlackPublishSettings): AppSettings {
    const next = { ...this.get(), slack: normalizeSlack(slack) }
    this.write(next)
    return next
  }

  setLocale(locale: AppLocale): AppSettings {
    const next = { ...this.get(), locale: normalizeLocale(locale) }
    this.write(next)
    return next
  }

  setSeverities(severities: SeveritySettings): AppSettings {
    const next = { ...this.get(), severities: normalizeSeverities(severities) }
    this.write(next)
    return next
  }

  private write(settings: AppSettings): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  }
}
