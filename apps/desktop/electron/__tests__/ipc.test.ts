import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
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
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
  },
}))

import { buildMacAvfoundationInputName, extractIosApps, isUnsupportedGdigrabDrawMouseError, parseMacWindowId, parseWindowsWindowHandle, recoverProjectMicAudioPath } from '../ipc'
import type { PcCaptureSource } from '@shared/types'

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
