import { useEffect, useMemo, useState } from 'react'
import type { DesktopApi, PcCaptureSource } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import type { SelectRecordingSource } from '@/lib/recordingSource'

function isIphoneMirroringSource(source: PcCaptureSource): boolean {
  return /iphone mirroring|iphone|mirroring/i.test(source.name)
}

function isUxPlaySource(source: PcCaptureSource, uxPlayRunning: boolean): boolean {
  if (/loupe ios|uxplay/i.test(source.name)) return true
  return uxPlayRunning && /opengl renderer/i.test(source.name)
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
  const [iosMode, setIosMode] = useState<'mirror' | 'uxplay'>(platform === 'darwin' ? 'mirror' : 'uxplay')
  const [uxPlayRunning, setUxPlayRunning] = useState(false)
  const [uxPlayMessage, setUxPlayMessage] = useState<string | null>(null)
  const isMac = platform === 'darwin'
  const windowSources = useMemo(() => sources.filter(source => source.type === 'window'), [sources])
  const mirrorSources = useMemo(() => windowSources.filter(isIphoneMirroringSource), [windowSources])
  const uxPlaySources = useMemo(() => windowSources.filter(source => isUxPlaySource(source, uxPlayRunning)), [uxPlayRunning, windowSources])

  useEffect(() => {
    if (platform && !isMac) setIosMode('uxplay')
  }, [isMac, platform])

  useEffect(() => {
    if (!isMac || iosMode !== 'mirror' || mirrorSources.length !== 1) return
    const source = mirrorSources[0]
    if (selectedId === source.id) return
    onSelect(source.id, 'ios', source.name)
    void api.app.showPcCaptureFrame(source.id, 'green', source.displayId)
  }, [api, iosMode, isMac, mirrorSources, onSelect, selectedId])

  useEffect(() => {
    if (iosMode !== 'uxplay' || uxPlaySources.length !== 1) return
    const source = uxPlaySources[0]
    if (selectedId === source.id) return
    onSelect(source.id, 'ios', source.name)
    void api.app.showPcCaptureFrame(source.id, 'green', source.displayId)
  }, [api, iosMode, onSelect, selectedId, uxPlaySources])

  useEffect(() => {
    if (iosMode !== 'uxplay' || !uxPlayRunning || uxPlaySources.length > 0) return
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      onRefresh()
      if (attempts >= 12) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [iosMode, onRefresh, uxPlayRunning, uxPlaySources.length])

  useEffect(() => {
    api.app.getUxPlayReceiver()
      .then(status => {
        setUxPlayRunning(status.running)
        setUxPlayMessage(status.message ?? null)
      })
      .catch(() => {})
  }, [api])

  async function openMirroring() {
    await api.app.openIphoneMirroring()
    window.setTimeout(onRefresh, 1000)
  }

  async function startUxPlay() {
    const status = await api.app.startUxPlayReceiver()
    setUxPlayRunning(status.running)
    setUxPlayMessage(status.message ?? null)
    window.setTimeout(onRefresh, 1000)
    window.setTimeout(onRefresh, 3000)
  }

  async function stopUxPlay() {
    const status = await api.app.stopUxPlayReceiver()
    setUxPlayRunning(status.running)
    setUxPlayMessage(status.message ?? null)
    void api.app.hidePcCaptureFrame()
    window.setTimeout(onRefresh, 500)
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

      {isMac && (
        <div className="mt-3 grid grid-cols-2 rounded border border-zinc-800 bg-zinc-950 p-0.5 text-xs">
          {([
            ['mirror', t('device.iosMirrorMode')],
            ['uxplay', t('device.iosUxPlayMode')],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setIosMode(mode)}
              className={`rounded px-2 py-1.5 ${iosMode === mode ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {isMac && iosMode === 'mirror' ? (
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
      ) : iosMode === 'uxplay' ? (
        <>
          <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/80 p-3 text-xs leading-5 text-zinc-400">
            <div>{t('device.iosUxPlayHelp')}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { void startUxPlay() }}
                className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600"
              >
                {uxPlayRunning ? t('device.restartUxPlay') : t('device.startUxPlay')}
              </button>
              <button
                type="button"
                onClick={() => { void stopUxPlay() }}
                disabled={!uxPlayRunning}
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                {t('device.stopUxPlay')}
              </button>
            </div>
            {uxPlayMessage && <div className="mt-2 text-[11px] text-zinc-500">{uxPlayMessage}</div>}
          </div>

          <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-auto pr-1">
            {uxPlaySources.length === 0 && (
              <div className="col-span-2 text-xs text-zinc-500">
                {loading ? t('device.loadingSources') : t('device.noUxPlayWindows')}
              </div>
            )}
            {uxPlaySources.map(source => {
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
          {t('device.iosUnsupportedHelp')}
        </div>
      )}
    </div>
  )
}
