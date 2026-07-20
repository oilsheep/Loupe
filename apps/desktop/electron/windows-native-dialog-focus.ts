export interface NativeDialogFocusWindow {
  isDestroyed(): boolean
  isFocused(): boolean
  blur(): void
  focus(): void
  webContents: {
    isDestroyed(): boolean
    focus(): void
  }
}

export type FocusRecoveryScheduler = (callback: () => void) => void

const scheduleNextTurn: FocusRecoveryScheduler = callback => {
  setTimeout(callback, 0)
}

export function recoverWindowsNativeDialogFocus(
  browserWindow: NativeDialogFocusWindow,
  platform: NodeJS.Platform = process.platform,
  schedule: FocusRecoveryScheduler = scheduleNextTurn,
): void {
  if (platform !== 'win32' || browserWindow.isDestroyed() || !browserWindow.isFocused() || browserWindow.webContents.isDestroyed()) return

  schedule(() => {
    if (browserWindow.isDestroyed() || !browserWindow.isFocused() || browserWindow.webContents.isDestroyed()) return

    // Electron/Chromium can leave the renderer's editable control without keyboard
    // focus after a synchronous alert/confirm/prompt closes on Windows. Track:
    // https://github.com/electron/electron/issues/19977
    // https://github.com/electron/electron/issues/31917
    // https://github.com/electron/electron/pull/50770
    // Do not remove this after an Electron upgrade alone. First confirm #50770 (or
    // its successor) is in the adopted release and verify the native-dialog flows
    // without this workaround in a packaged Windows build.
    browserWindow.blur()
    if (browserWindow.isDestroyed()) return

    browserWindow.focus()
    if (browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) return

    browserWindow.webContents.focus()
  })
}
