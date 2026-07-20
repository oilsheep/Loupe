import type { DesktopApi } from '@shared/types'

function requestFocusRecovery(): void {
  const api = (window as unknown as { api?: DesktopApi }).api
  if (!api) return

  // Main-process policy and Electron upstream tracking live in
  // electron/windows-native-dialog-focus.ts. Recovery is best effort and must
  // never change the synchronous result of alert/confirm/prompt.
  try {
    void api.app.recoverFocusAfterNativeDialog().catch(() => {})
  } catch {
    // A stale or partially initialized preload bridge must not alter dialog behavior.
  }
}

function runNativeDialog<T>(operation: () => T): T {
  try {
    return operation()
  } finally {
    requestFocusRecovery()
  }
}

export function showAlert(message: string): void {
  runNativeDialog(() => {
    if (typeof window.alert === 'function') window.alert(message)
  })
}

export function showConfirm(message: string): boolean {
  return runNativeDialog(() => typeof window.confirm === 'function' ? window.confirm(message) : true)
}

export function showPrompt(message: string, defaultValue?: string): string | null {
  return runNativeDialog(() => typeof window.prompt === 'function' ? window.prompt(message, defaultValue) : null)
}
