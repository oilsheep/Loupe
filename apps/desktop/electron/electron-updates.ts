import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AppUpdateEvent } from '@shared/types'

let configured = false
let latestVersion: string | undefined

export function configureElectronUpdater(emit: (event: AppUpdateEvent) => void): void {
  if (configured) return
  configured = true
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
  autoUpdater.autoDownload = false
  const result = await autoUpdater.checkForUpdates()
  if (!result?.isUpdateAvailable) throw new Error('No update is available.')
  latestVersion = result.updateInfo.version
  await autoUpdater.downloadUpdate()
}

export function installElectronUpdate(): void {
  if (!app.isPackaged) throw new Error('Automatic update install is only available in packaged builds.')
  autoUpdater.quitAndInstall(false, true)
}
