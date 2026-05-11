import { useI18n } from '@/lib/i18n'
import type { AppUpdateCheckResult, AppUpdateEvent, ToolCheck } from '@shared/types'

interface HomeTopBarProps {
  selectedLabel?: string
  missingTools: ToolCheck[]
  updateCheck: AppUpdateCheckResult | null
  updateEvent: AppUpdateEvent | null
  checkingForUpdates: boolean
  onCheckForUpdates(): void
  onDownloadUpdate(): void
  onInstallUpdate(): void
  onOpenTools(): void
  onOpenPreferences(): void
}

export function HomeTopBar({ selectedLabel, missingTools, updateCheck, updateEvent, checkingForUpdates, onCheckForUpdates, onDownloadUpdate, onInstallUpdate, onOpenTools, onOpenPreferences }: HomeTopBarProps) {
  const { t } = useI18n()
  const missingCount = missingTools.length
  const updateAvailable = Boolean(updateCheck?.updateAvailable)
  const phase = updateEvent?.phase
  const downloading = phase === 'downloading'
  const downloaded = phase === 'downloaded'
  const checkingDownload = phase === 'checking' && updateAvailable
  const errored = phase === 'error'

  const latestVersion = updateCheck?.latestVersion ?? ''
  const updateButtonText = downloaded
    ? t('home.update.restart')
    : downloading
      ? t('home.update.downloading', { percent: Math.round(updateEvent?.percent ?? 0) })
      : checkingDownload
        ? t('home.update.preparing')
        : errored
          ? t('home.update.retry', { version: latestVersion })
          : updateAvailable
            ? t('home.update.download', { version: latestVersion })
            : checkingForUpdates
              ? t('home.update.checking')
              : t('home.update.check')

  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-3">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-zinc-500">{t('home.workspace')}</div>
        <div className="truncate text-sm text-zinc-300">{selectedLabel || t('home.noSourceSelected')}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {updateAvailable ? (
          <button
            type="button"
            onClick={downloaded ? onInstallUpdate : onDownloadUpdate}
            disabled={downloading}
            className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
            title={
              downloaded
                ? t('home.update.restartTitle')
                : errored
                  ? t('home.update.errorTitle', { message: updateEvent?.message ?? 'unknown error' })
                  : updateCheck?.assetName
                    ? t('home.update.downloadAssetTitle', { assetName: updateCheck.assetName })
                    : t('home.update.downloadTitle')
            }
          >
            {updateButtonText}
          </button>
        ) : (
          <button
            type="button"
            onClick={onCheckForUpdates}
            disabled={checkingForUpdates}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            title={updateCheck?.error || (latestVersion ? t('home.update.latestTitle', { version: latestVersion }) : t('home.update.checkTitle'))}
          >
            {updateButtonText}
          </button>
        )}
        {errored && updateEvent?.message && (
          <span className="ml-1 max-w-[200px] truncate text-xs text-red-300" title={updateEvent.message}>
            {updateEvent.message}
          </span>
        )}
        <button
          type="button"
          onClick={onOpenTools}
          className={`relative rounded px-3 py-1.5 text-xs font-medium ${missingCount > 0 ? 'bg-yellow-950 text-yellow-100 ring-1 ring-yellow-700 hover:bg-yellow-900' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`}
          title={missingCount > 0 ? t('home.toolStatusMissing', { count: missingCount }) : t('home.toolStatusReady')}
        >
          {t('home.toolStatus')}
          {missingCount > 0 && (
            <span className="ml-2 rounded bg-yellow-500 px-1.5 py-0.5 font-mono text-[10px] text-zinc-950">
              {missingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onOpenPreferences}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          {t('home.preferences')}
        </button>
      </div>
    </div>
  )
}
