import { app } from 'electron'
import type { AppUpdateEvent } from '@shared/types'

type ElectronAutoUpdater = typeof import('electron-updater').autoUpdater

const PROVIDER = typeof __LOUPE_UPDATE_PROVIDER__ === 'string' ? __LOUPE_UPDATE_PROVIDER__ : ''
const API_URL = typeof __LOUPE_UPDATE_API_URL__ === 'string' ? __LOUPE_UPDATE_API_URL__ : ''

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

interface FeedOverride {
  channelDirUrl: string
  authHeader?: string
}

/**
 * Splits the bundled `__LOUPE_UPDATE_API_URL__` into a channel-directory URL
 * and an optional Basic-Authorization header. Electron's Chromium net stack
 * silently aborts requests to URLs with embedded `user:pass@`, surfacing as
 * `net::ERR_ABORTED` from `autoUpdater.checkForUpdates`/`downloadUpdate`.
 * Returns null when the baked URL doesn't look like a GitLab channel URL.
 */
export function deriveFeedOverride(rawUrl: string): FeedOverride | null {
  if (!rawUrl) return null
  let url: URL
  try { url = new URL(rawUrl) } catch { return null }
  let authHeader: string | undefined
  if (url.username || url.password) {
    const creds = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`
    authHeader = `Basic ${Buffer.from(creds).toString('base64')}`
    url.username = ''
    url.password = ''
  }
  // The baked URL points at one specific YML (latest-mac.yml in our config).
  // electron-updater wants the channel directory and picks the per-platform
  // YML itself, so trim the trailing filename if present.
  if (url.pathname.endsWith('.yml')) {
    url.pathname = url.pathname.replace(/[^/]+$/, '')
  }
  return { channelDirUrl: url.toString(), authHeader }
}

export function configureElectronUpdater(emit: (event: AppUpdateEvent) => void): void {
  if (configured) return
  configured = true
  const autoUpdater = getAutoUpdater()
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = app.getVersion().includes('-')

  if (PROVIDER === 'gitlab') {
    const override = deriveFeedOverride(API_URL)
    if (override) {
      autoUpdater.setFeedURL({ provider: 'generic', url: override.channelDirUrl, channel: 'latest' })
      if (override.authHeader) autoUpdater.requestHeaders = { Authorization: override.authHeader }
    }
  }

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
