import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.5.0'), isPackaged: false },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: vi.fn(),
  desktopCapturer: { getSources: vi.fn() },
  dialog: {},
  screen: {
    getAllDisplays: vi.fn(),
    getDisplayMatching: vi.fn(),
    getPrimaryDisplay: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
  },
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}))

// electron-updates uses require() internally to load electron-updater, which
// bypasses the ESM mock above. Mock the wrapper module directly so registerIpc
// can be exercised in unit tests without spinning up the real autoUpdater.
vi.mock('../electron-updates', () => ({
  configureElectronUpdater: vi.fn(),
  downloadElectronUpdate: vi.fn(),
  installElectronUpdate: vi.fn(),
  checkForAppUpdates: vi.fn(),
}))

import { CHANNEL, buildMacAvfoundationInputName, extractIosApps, gdigrabWindowInput, isUnsupportedGdigrabDrawMouseError, parseMacWindowId, parseWindowsWindowHandle, recoverProjectMicAudioPath, registerIpc } from '../ipc'
import { _resetBundledInstancesCacheForTests, _setBundledInstancesRawForTests, findBundledOAuthInstance } from '../gitlab-oauth-config'
import { DEFAULT_AUDIO_ANALYSIS, DEFAULT_HOTKEYS, DEFAULT_RECORDING_PREFERENCES, DEFAULT_SEVERITIES, SettingsStore } from '../settings'
import { ipcMain } from 'electron'
import type { AppSettings, PcCaptureSource } from '@shared/types'

describe('isUnsupportedGdigrabDrawMouseError', () => {
  it('detects ffmpeg builds that do not support gdigrab draw_mouse', () => {
    expect(isUnsupportedGdigrabDrawMouseError(
      "Unrecognized option 'draw_mouse'.\nError splitting the argument list: Option not found",
    )).toBe(true)
  })

  it('ignores unrelated gdigrab failures', () => {
    expect(isUnsupportedGdigrabDrawMouseError(
      'Could not find window with title Notepad',
    )).toBe(false)
  })
})

describe('buildMacAvfoundationInputName', () => {
  it('maps Electron screen source order to avfoundation capture screen names', () => {
    const sources: PcCaptureSource[] = [
      { id: 'screen:10:0', name: 'Screen 1', type: 'screen', displayId: '10' },
      { id: 'screen:20:0', name: 'Screen 2', type: 'screen', displayId: '20' },
    ]

    expect(buildMacAvfoundationInputName(sources[1], sources)).toBe('Capture screen 1:none')
  })

  it('rejects window sources because avfoundation cannot capture them by Electron window id', () => {
    expect(() => buildMacAvfoundationInputName(
      { id: 'window:123:0', name: 'Notes', type: 'window' },
      [],
    )).toThrow(/Window PC recording/)
  })
})

describe('recoverProjectMicAudioPath', () => {
  it('finds session-mic.webm next to an opened legacy project file', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-project-mic-'))
    try {
      const projectPath = join(root, 'session.loupe')
      const micPath = join(root, 'session-mic.webm')
      writeFileSync(projectPath, '{}')
      writeFileSync(micPath, 'mic')

      expect(recoverProjectMicAudioPath(projectPath, null)).toBe(micPath)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('parseWindowsWindowHandle', () => {
  it('extracts HWND values from Electron window source ids', () => {
    expect(parseWindowsWindowHandle('window:123456:0')).toBe(123456)
  })

  it('ignores non-window and invalid source ids', () => {
    expect(parseWindowsWindowHandle('screen:1:0')).toBeNull()
    expect(parseWindowsWindowHandle('window:not-a-number:0')).toBeNull()
    expect(parseWindowsWindowHandle('window:0:0')).toBeNull()
  })
})

describe('gdigrabWindowInput', () => {
  it('uses window titles because some Windows ffmpeg builds reject hwnd inputs', () => {
    expect(gdigrabWindowInput({
      id: 'window:4395548:0',
      name: 'Direct3D12 Renderer',
      type: 'window',
    })).toBe('title=Direct3D12 Renderer')
  })
})

describe('parseMacWindowId', () => {
  it('extracts CGWindowID values from Electron window source ids', () => {
    expect(parseMacWindowId('window:98765:0')).toBe(98765)
  })

  it('ignores non-window and invalid source ids', () => {
    expect(parseMacWindowId('screen:1:0')).toBeNull()
    expect(parseMacWindowId('window:not-a-number:0')).toBeNull()
    expect(parseMacWindowId('window:0:0')).toBeNull()
  })
})

describe('extractIosApps', () => {
  it('extracts explicit bundle identifiers without treating versions as apps', () => {
    const apps = extractIosApps([
      { CFBundleIdentifier: 'com.pinkcore.ig', CFBundleDisplayName: 'CursedBlossom', CFBundleShortVersionString: '0.0.1' },
      { bundleIdentifier: 'com.apple.mobilesafari', name: 'Safari', version: '0.20240503.0' },
      { id: '0.3.3', name: 'Not a bundle id' },
      '0.0.2',
      'com.example.loose.string',
    ])

    expect([...apps.values()]).toEqual([
      { bundleId: 'com.pinkcore.ig', name: 'CursedBlossom' },
      { bundleId: 'com.apple.mobilesafari', name: 'Safari' },
    ])
  })
})

describe('gitlab oauth bundled fallback', () => {
  beforeEach(() => {
    _setBundledInstancesRawForTests('[{"url":"https://gitlab.rayark.com","clientId":"BUNDLED_ID"}]')
  })
  afterEach(() => {
    _resetBundledInstancesCacheForTests()
  })

  it('uses the bundled clientId when settings.oauthClientId is empty and baseUrl matches', () => {
    // Lightweight assertion: confirm findBundledOAuthInstance would resolve
    // for the test baseUrl. The full OAuth roundtrip is exercised in manual
    // verification (Task 5) since it requires the electron protocol handler.
    expect(findBundledOAuthInstance('https://gitlab.rayark.com')).toEqual({
      url: 'https://gitlab.rayark.com', clientId: 'BUNDLED_ID',
    })
  })

  it('returns no bundled match for an unknown baseUrl', () => {
    expect(findBundledOAuthInstance('https://gitlab.example.com')).toBeUndefined()
  })
})

describe('settings:renameProfile no longer cascades to db.renameSessionProject', () => {
  // Under the separated Profile/Project concept model, the game label on a
  // session (Session.project) is independent of the publish-config profile
  // that recorded it. Renaming a profile must NOT silently rewrite session
  // game labels. db.renameSessionProject is kept as a tested utility for
  // future bulk relabel workflows but is no longer called from the IPC path.

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
      name: 'OldName',
      slack: { botToken: '', channelId: '' },
      gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue' },
      google: { token: '' },
    }],
    activeProfileId: 'default-fallback',
  }

  it('renaming a profile via IPC handler does not call db.renameSessionProject', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loupe-ipc-rename-'))
    try {
      const settings = new SettingsStore(join(tmp, 'settings.json'), FALLBACK_DEFAULTS)
      const id = settings.get().profiles[0].id

      // Capture handlers registered by registerIpc so we can invoke them
      // directly without spinning up the rest of the Electron lifecycle.
      const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
      const handleSpy = vi.spyOn(ipcMain, 'handle').mockImplementation(((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }) as unknown as typeof ipcMain.handle)

      const renameSessionProject = vi.fn()
      const deps = {
        adb: {} as never,
        manager: {} as never,
        paths: {} as never,
        runner: {} as never,
        db: { renameSessionProject } as never,
        settings,
        getWindow: () => null,
        setHotkeyEnabled: () => {},
        setHotkeys: () => {},
      }

      try {
        registerIpc(deps)
        const handler = handlers.get(CHANNEL.settingsRenameProfile)
        expect(handler).toBeDefined()
        await handler!({} as unknown, id, 'NewName')
        expect(renameSessionProject).not.toHaveBeenCalled()
        // Sanity: the rename actually applied to settings.
        expect(settings.get().profiles.find(p => p.id === id)?.name).toBe('NewName')
      } finally {
        handleSpy.mockRestore()
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
