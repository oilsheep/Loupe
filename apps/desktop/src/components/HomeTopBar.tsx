import { useI18n } from '@/lib/i18n'
import type { ToolCheck } from '@shared/types'

interface HomeTopBarProps {
  selectedLabel?: string
  missingTools: ToolCheck[]
  onOpenTools(): void
  onOpenLegal(): void
  onOpenPreferences(): void
}

export function HomeTopBar({ selectedLabel, missingTools, onOpenTools, onOpenLegal, onOpenPreferences }: HomeTopBarProps) {
  const { t } = useI18n()
  const missingCount = missingTools.length

  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-3">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-zinc-500">{t('home.workspace')}</div>
        <div className="truncate text-sm text-zinc-300">{selectedLabel || t('home.noSourceSelected')}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
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
          onClick={onOpenLegal}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          {t('home.legal')}
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
