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
  const downloading = updateEvent?.phase === 'downloading'
  const downloaded = updateEvent?.phase === 'downloaded'
  const updateButtonText = downloaded
    ? 'Restart to install'
    : downloading
      ? `Downloading ${Math.round(updateEvent?.percent ?? 0)}%`
      : updateAvailable
        ? `Download v${updateCheck?.latestVersion}`
        : checkingForUpdates
          ? 'Checking...'
          : 'Check updates'

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
            title={downloaded ? 'Restart Loupe and install the downloaded update' : updateCheck?.assetName ? `Download ${updateCheck.assetName}` : 'Download the latest Loupe release'}
          >
            {updateButtonText}
          </button>
        ) : (
          <button
            type="button"
            onClick={onCheckForUpdates}
            disabled={checkingForUpdates}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            title={updateCheck?.error || (updateCheck?.latestVersion ? `Latest: v${updateCheck.latestVersion}` : 'Check GitHub Releases for updates')}
          >
            {updateButtonText}
          </button>
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
