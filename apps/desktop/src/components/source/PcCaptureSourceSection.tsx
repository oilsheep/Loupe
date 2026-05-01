import type { DesktopApi, PcCaptureSource } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import type { SelectRecordingSource } from '@/lib/recordingSource'

export function PcCaptureSourceSection({
  api,
  selectedId,
  sources,
  loading,
  activeTab,
  onTabChange,
  onRefresh,
  onSelect,
}: {
  api: DesktopApi
  selectedId: string | null
  sources: PcCaptureSource[]
  loading: boolean
  activeTab: PcCaptureSource['type']
  onTabChange: (tab: PcCaptureSource['type']) => void
  onRefresh: () => void
  onSelect: SelectRecordingSource
}) {
  const { t } = useI18n()
  const tabSources = sources.filter(source => source.type === activeTab)

  function selectSource(source: PcCaptureSource) {
    onSelect(source.id, 'pc', source.name)
    if (source.type === 'screen') void api.app.showPcCaptureFrame(source.id, 'green', source.displayId)
    else void api.app.hidePcCaptureFrame()
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{t('device.pcRecording')}</div>
          <div className="mt-0.5 text-xs text-zinc-500">{t('device.pcHelp')}</div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? t('device.loading') : t('common.refresh')}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 rounded border border-zinc-800 bg-zinc-950 p-0.5 text-xs">
        {(['screen', 'window'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`rounded px-2 py-1.5 ${activeTab === tab ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {tab === 'screen' ? t('device.entireScreen') : t('device.window')}
          </button>
        ))}
      </div>
      <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-auto pr-1">
        {tabSources.length === 0 && (
          <div className="col-span-2 text-xs text-zinc-500">
            {loading
              ? t('device.loadingSources')
              : activeTab === 'screen'
                ? t('device.noScreens')
                : t('device.noWindows')}
          </div>
        )}
        {tabSources.map(source => {
          const isSel = selectedId === source.id
          return (
            <button
              key={source.id}
              type="button"
              data-testid={`source-pc-${source.id}`}
              onClick={() => selectSource(source)}
              className={`min-w-0 rounded border p-2 text-left text-xs
                ${isSel ? 'border-blue-500 bg-blue-950/70 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-800'}`}
            >
              <div className="aspect-video overflow-hidden rounded bg-zinc-900">
                {source.thumbnailDataUrl
                  ? <img src={source.thumbnailDataUrl} alt="" className="h-full w-full object-cover" />
                  : <div className="h-full w-full bg-zinc-800" />}
              </div>
              <div className="mt-2 truncate">{source.name}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
