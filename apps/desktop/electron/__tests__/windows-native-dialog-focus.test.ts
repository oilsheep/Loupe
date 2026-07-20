import { describe, expect, it, vi } from 'vitest'
import { recoverWindowsNativeDialogFocus, type NativeDialogFocusWindow } from '../windows-native-dialog-focus'

function fakeWindow() {
  const calls: string[] = []
  const window: NativeDialogFocusWindow = {
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => true),
    blur: vi.fn(() => calls.push('blur')),
    focus: vi.fn(() => calls.push('window.focus')),
    webContents: {
      isDestroyed: vi.fn(() => false),
      focus: vi.fn(() => calls.push('webContents.focus')),
    },
  }
  return { calls, window }
}

describe('recoverWindowsNativeDialogFocus', () => {
  it('does nothing outside Windows', () => {
    const { window } = fakeWindow()
    const schedule = vi.fn()

    recoverWindowsNativeDialogFocus(window, 'darwin', schedule)

    expect(schedule).not.toHaveBeenCalled()
  })

  it('does not schedule recovery for a destroyed window', () => {
    const { window } = fakeWindow()
    vi.mocked(window.isDestroyed).mockReturnValue(true)
    const schedule = vi.fn()

    recoverWindowsNativeDialogFocus(window, 'win32', schedule)

    expect(schedule).not.toHaveBeenCalled()
  })

  it('does not schedule recovery for a background window', () => {
    const { window } = fakeWindow()
    vi.mocked(window.isFocused).mockReturnValue(false)
    const schedule = vi.fn()

    recoverWindowsNativeDialogFocus(window, 'win32', schedule)

    expect(schedule).not.toHaveBeenCalled()
  })

  it('does not steal focus if the window loses focus before recovery runs', () => {
    const { window } = fakeWindow()
    let scheduled: (() => void) | undefined
    recoverWindowsNativeDialogFocus(window, 'win32', callback => { scheduled = callback })

    vi.mocked(window.isFocused).mockReturnValue(false)
    scheduled?.()

    expect(window.blur).not.toHaveBeenCalled()
  })

  it('does not focus destroyed web contents', () => {
    const { window } = fakeWindow()
    let scheduled: (() => void) | undefined
    recoverWindowsNativeDialogFocus(window, 'win32', callback => { scheduled = callback })

    vi.mocked(window.webContents.isDestroyed).mockReturnValue(true)
    scheduled?.()

    expect(window.blur).not.toHaveBeenCalled()
  })

  it('does not recover a window destroyed before the scheduled callback', () => {
    const { window } = fakeWindow()
    let scheduled: (() => void) | undefined
    recoverWindowsNativeDialogFocus(window, 'win32', callback => { scheduled = callback })

    vi.mocked(window.isDestroyed).mockReturnValue(true)
    scheduled?.()

    expect(window.blur).not.toHaveBeenCalled()
  })

  it('stops when blur destroys the window', () => {
    const { window } = fakeWindow()
    vi.mocked(window.blur).mockImplementation(() => {
      vi.mocked(window.isDestroyed).mockReturnValue(true)
    })

    recoverWindowsNativeDialogFocus(window, 'win32', callback => callback())

    expect(window.focus).not.toHaveBeenCalled()
  })

  it('stops when window focus destroys web contents', () => {
    const { window } = fakeWindow()
    vi.mocked(window.focus).mockImplementation(() => {
      vi.mocked(window.webContents.isDestroyed).mockReturnValue(true)
    })

    recoverWindowsNativeDialogFocus(window, 'win32', callback => callback())

    expect(window.webContents.focus).not.toHaveBeenCalled()
  })

  it('restores focused Windows window and web contents in order', () => {
    const { calls, window } = fakeWindow()
    let scheduled: (() => void) | undefined
    recoverWindowsNativeDialogFocus(window, 'win32', callback => { scheduled = callback })

    expect(calls).toEqual([])
    scheduled?.()

    expect(calls).toEqual(['blur', 'window.focus', 'webContents.focus'])
  })
})
