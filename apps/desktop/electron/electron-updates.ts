import { app } from 'electron'
import type { AppUpdateEvent } from '@shared/types'

type ElectronAutoUpdater = typeof import('electron-updater').autoUpdater

let autoUpdaterInstance: ElectronAutoUpdater | null = null
let configured = false
let latestVersion: string | undefined

function getAutoUpdater(): ElectronAutoUpdater {
  if (autoUpdaterInstance) return autoUpdaterInstance
  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')
  // Pipe electron-updater's internal log messages to console + the app's update
  // event stream. Without this, generic-provider failures (URL credentials, auth
  // errors, signing mismatches) are completely silent on macOS.
  autoUpdater.logger = {
    info: (...args: any[]) => console.log('[electron-updater]', ...args),
    warn: (...args: any[]) => console.warn('[electron-updater]', ...args),
    error: (...args: any[]) => console.error('[electron-updater]', ...args),
    debug: (...args: any[]) => console.debug('[electron-updater]', ...args),
  }
  autoUpdaterInstance = autoUpdater
  return autoUpdater
}

export function configureElectronUpdater(emit: (event: AppUpdateEvent) => void): void {
  if (configured) return
  configured = true
  const autoUpdater = getAutoUpdater()
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = app.getVersion().includes('-')

  autoUpdater.on('checking-for-update', () => {
    emit({ phase: 'checking', currentVersion: app.getVersion(), message: 'Checking for updates.' })
  })
  autoUpdater.on('update-available', info => {
    latestVersion = info.version
    emit({ phase: 'available', currentVersion: app.getVersion(), latestVersion: info.version, message: `Update ${info.version} is available.` })
  })
  autoUpdater.on('update-not-available', info => {
    latestVersion = info.version
    emit({ phase: 'not-available', currentVersion: app.getVersion(), latestVersion: info.version, message: 'Loupe is up to date.' })
  })
  autoUpdater.on('download-progress', info => {
    emit({
      phase: 'downloading',
      currentVersion: app.getVersion(),
      latestVersion,
      percent: info.percent,
      transferred: info.transferred,
      total: info.total,
      bytesPerSecond: info.bytesPerSecond,
      message: `Downloading update (${Math.round(info.percent)}%).`,
    })
  })
  autoUpdater.on('update-downloaded', info => {
    latestVersion = info.version
    emit({ phase: 'downloaded', currentVersion: app.getVersion(), latestVersion: info.version, message: 'Update downloaded. Restart to install.' })
  })
  autoUpdater.on('error', error => {
    emit({ phase: 'error', currentVersion: app.getVersion(), latestVersion, message: error.message })
  })
}

export async function downloadElectronUpdate(): Promise<void> {
  if (!app.isPackaged) throw new Error('Automatic update install is only available in packaged builds.')
  const autoUpdater = getAutoUpdater()
  autoUpdater.autoDownload = false
  // electron-updater requires checkForUpdates() to populate internal state before downloadUpdate() will work.
  // We do call it once here (fresh state, since the custom check in app-updates.ts is a separate code path),
  // but with a hard timeout so we don't hang silently if the generic provider misbehaves.
  const checkResult = await Promise.race([
    autoUpdater.checkForUpdates(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Update check timed out after 30 seconds. The release channel may be unreachable; check your network or try again.')), 30_000),
    ),
  ])
  if (!checkResult?.isUpdateAvailable) {
    throw new Error('electron-updater could not confirm an update is available. The release channel may have been rolled back.')
  }
  latestVersion = checkResult.updateInfo.version
  await autoUpdater.downloadUpdate()
}

export function installElectronUpdate(): void {
  if (!app.isPackaged) throw new Error('Automatic update install is only available in packaged builds.')
  const autoUpdater = getAutoUpdater()
  autoUpdater.quitAndInstall(false, true)
}
