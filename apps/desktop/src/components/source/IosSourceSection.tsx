import { useEffect, useMemo } from 'react'
import type { DesktopApi, PcCaptureSource } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import type { SelectRecordingSource } from '@/lib/recordingSource'

function isIphoneMirroringSource(source: PcCaptureSource): boolean {
  return /iphone mirroring|iphone|mirroring/i.test(source.name)
}

export function IosSourceSection({
  api,
  selectedId,
  sources,
  loading,
  platform,
  onRefresh,
  onSelect,
}: {
  api: DesktopApi
  selectedId: string | null
  sources: PcCaptureSource[]
  loading: boolean
  platform: string | null
  onRefresh: () => void
  onSelect: SelectRecordingSource
}) {
  const { t } = useI18n()
  const isMac = platform === 'darwin'
  const windowSources = useMemo(() => sources.filter(source => source.type === 'window'), [sources])
  const mirrorSources = useMemo(() => windowSources.filter(isIphoneMirroringSource), [windowSources])

  useEffect(() => {
    if (!isMac || mirrorSources.length !== 1) return
    const source = mirrorSources[0]
    if (selectedId === source.id) return
    onSelect(source.id, 'ios', source.name)
    void api.app.showPcCaptureFrame(source.id, 'green', source.displayId)
  }, [api, isMac, mirrorSources, onSelect, selectedId])

  async function openMirroring() {
    await api.app.openIphoneMirroring()
    window.setTimeout(onRefresh, 1000)
  }

  function selectSource(source: PcCaptureSource) {
    onSelect(source.id, 'ios', source.name)
    void api.app.showPcCaptureFrame(source.id, 'green', source.displayId)
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{t('device.iosRecording')}</div>
          <div className="mt-0.5 text-xs leading-5 text-zinc-500">
            {isMac ? t('device.iosMacHelp') : t('device.iosUnsupportedHelp')}
          </div>
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

      {isMac ? (
        <>
          <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/80 p-3 text-xs leading-5 text-zinc-400">
            <div>{t('device.iosMacSteps')}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { void openMirroring() }}
                className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600"
              >
                {t('device.openIphoneMirroring')}
              </button>
              <a
                href="https://support.apple.com/en-us/120421"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-300 hover:text-blue-200"
              >
                {t('device.iosAppleGuide')}
              </a>
            </div>
          </div>

          <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-auto pr-1">
            {mirrorSources.length === 0 && (
              <div className="col-span-2 text-xs text-zinc-500">
                {loading ? t('device.loadingSources') : t('device.noIphoneMirroringWindows')}
              </div>
            )}
            {mirrorSources.map(source => {
              const isSel = selectedId === source.id
              return (
                <button
                  key={source.id}
                  type="button"
                  data-testid={`source-ios-${source.id}`}
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
        </>
      ) : (
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/80 p-3 text-xs leading-5 text-zinc-400">
          {t('device.iosUxPlayFuture')}
        </div>
      )}
    </div>
  )
}
