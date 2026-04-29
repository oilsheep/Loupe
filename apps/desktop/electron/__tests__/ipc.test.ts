import { describe, expect, it, vi } from 'vitest'

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

import { buildMacAvfoundationInputName, isUnsupportedGdigrabDrawMouseError } from '../ipc'
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
