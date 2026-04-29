import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bug, BugSeverity, HotkeySettings, Session, SeveritySettings } from '@shared/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { BugList } from '@/components/BugList'
import { useI18n } from '@/lib/i18n'

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60), r = s % 60
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(blob)
  })
}

const DEFAULT_HOTKEYS: HotkeySettings = { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }
const DEFAULT_SEVERITIES: SeveritySettings = {
  note: { label: 'note', color: '#a1a1aa' },
  major: { label: 'Critical', color: '#ff4d4f' },
  normal: { label: 'Bug', color: '#f59e0b' },
  minor: { label: 'Polish', color: '#22b8f0' },
  improvement: { label: 'Note', color: '#22c55e' },
  custom1: { label: '', color: '#8b5cf6' },
  custom2: { label: '', color: '#ec4899' },
  custom3: { label: '', color: '#14b8a6' },
  custom4: { label: '', color: '#eab308' },
}
const HOTKEY_SEVERITIES: Array<{ key: keyof HotkeySettings; severity: BugSeverity }> = [
  { key: 'improvement', severity: 'improvement' },
  { key: 'minor', severity: 'minor' },
  { key: 'normal', severity: 'normal' },
  { key: 'major', severity: 'major' },
]
const CUSTOM_SEVERITIES: BugSeverity[] = ['custom1', 'custom2', 'custom3', 'custom4']

function visibleCustomSeverities(severities: SeveritySettings): BugSeverity[] {
  return CUSTOM_SEVERITIES.filter(key => severities[key]?.label?.trim())
}

function labelOrDefault(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.label?.trim() || DEFAULT_SEVERITIES[severity].label
}

function colorOrDefault(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.color || DEFAULT_SEVERITIES[severity].color
}

function HotkeySummary({
  hotkeys,
  severities,
  onMark,
}: {
  hotkeys: HotkeySettings
  severities: SeveritySettings
  onMark: (severity: BugSeverity) => void
}) {
  const customSeverities = visibleCustomSeverities(severities)
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {HOTKEY_SEVERITIES.map(({ key, severity }) => (
          <div key={key} className="flex items-center gap-1 text-xs text-zinc-500">
            <span className="font-mono">{hotkeys[key]}</span>
            <button
              type="button"
              onClick={() => onMark(severity)}
              className="max-w-[96px] truncate rounded px-1.5 py-0.5 text-black transition hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-1 focus:ring-white/70"
              style={{ backgroundColor: colorOrDefault(severities, severity) }}
              title={labelOrDefault(severities, severity)}
            >
              {labelOrDefault(severities, severity)}
            </button>
          </div>
        ))}
      </div>
      {customSeverities.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {customSeverities.map(severity => (
            <button
              key={severity}
              type="button"
              onClick={() => onMark(severity)}
              className="max-w-[112px] truncate rounded px-1.5 py-0.5 text-xs text-black transition hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-1 focus:ring-white/70"
              style={{ backgroundColor: colorOrDefault(severities, severity) }}
              title={labelOrDefault(severities, severity)}
            >
              {labelOrDefault(severities, severity)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
export function Recording({ session }: { session: Session }) {
  const { t } = useI18n()
  const goDraft = useApp(s => s.goDraft)
  const usesRendererPcRecording = session.connectionMode === 'pc' && session.androidVersion === 'macOS'
  const [bugs, setBugs] = useState<Bug[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stopping, setStopping] = useState(false)
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null)
  const [hotkeys, setHotkeys] = useState<HotkeySettings>(DEFAULT_HOTKEYS)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaChunksRef = useRef<Blob[]>([])
  const [pcRecorderError, setPcRecorderError] = useState<string | null>(null)
  const [severities, setSeverities] = useState<SeveritySettings>(DEFAULT_SEVERITIES)
  const [customSlots, setCustomSlots] = useState<BugSeverity[]>([])
  const [showHotkeySettings, setShowHotkeySettings] = useState(false)

  const refreshBugs = useCallback(async () => {
    const r = await api.session.get(session.id)
    if (r) setBugs(r.bugs)
  }, [session.id])

  useEffect(() => {
    const t = setInterval(() => setElapsedMs(Date.now() - session.startedAt), 500)
    return () => clearInterval(t)
  }, [session.startedAt])

  const markNow = useCallback(async (severity: BugSeverity) => {
    const bug = await api.session.markBug({ severity })
    setSelectedBugId(bug.id)
    await refreshBugs()
    for (const delay of [300, 1000, 2500]) {
      window.setTimeout(() => { void refreshBugs() }, delay)
    }
  }, [refreshBugs])

  useEffect(() => api.onBugMarkRequested(markNow), [markNow])
  useEffect(() => api.onSessionInterrupted((interrupted, reason) => {
    if (interrupted.id !== session.id) return
    console.warn(`Loupe: ${reason}`)
    goDraft(interrupted.id)
  }), [goDraft, session.id])
  useEffect(() => { refreshBugs() }, [refreshBugs])
  useEffect(() => {
    api.settings.get().then(s => {
      setHotkeys(s.hotkeys)
      setSeverities(s.severities)
      setCustomSlots(visibleCustomSeverities(s.severities))
    })
  }, [])

  useEffect(() => {
    if (!usesRendererPcRecording) return
    let cancelled = false

    async function startRendererPcRecording() {
      try {
        const mediaDevices = navigator.mediaDevices
        if (!mediaDevices?.getUserMedia) return
        const stream = await mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: session.deviceId,
              minFrameRate: 30,
              maxFrameRate: 30,
            },
          },
        } as MediaStreamConstraints)
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : 'video/webm'
        const recorder = new MediaRecorder(stream, { mimeType })
        mediaChunksRef.current = []
        mediaStreamRef.current = stream
        mediaRecorderRef.current = recorder
        recorder.ondataavailable = event => {
          if (event.data.size > 0) mediaChunksRef.current.push(event.data)
        }
        recorder.start(1000)
        setPcRecorderError(null)
      } catch (e) {
        setPcRecorderError(e instanceof Error ? e.message : String(e))
      }
    }

    void startRendererPcRecording()
    return () => {
      cancelled = true
      mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [session.connectionMode, session.deviceId, usesRendererPcRecording])

  async function saveHotkeys(next: HotkeySettings) {
    const settings = await api.settings.setHotkeys(next)
    setHotkeys(settings.hotkeys)
  }

  async function saveSeverities(next: SeveritySettings) {
    const settings = await api.settings.setSeverities(next)
    setSeverities(settings.severities)
  }

  async function resetDefaultLabels() {
    if (!window.confirm('Reset labels and hotkeys to defaults? Custom labels will be removed.')) return
    const settings = await api.settings.setHotkeys(DEFAULT_HOTKEYS)
    const severitySettings = await api.settings.setSeverities(DEFAULT_SEVERITIES)
    setHotkeys(settings.hotkeys)
    setSeverities(severitySettings.severities)
    setCustomSlots([])
  }

  async function stop() {
    setStopping(true)
    try {
      await api.app.hidePcCaptureFrame()
      const recorder = mediaRecorderRef.current
      if (usesRendererPcRecording && recorder && recorder.state !== 'inactive') {
        const stopped = new Promise<void>(resolve => {
          recorder.addEventListener('stop', () => resolve(), { once: true })
        })
        recorder.stop()
        mediaStreamRef.current?.getTracks().forEach(track => track.stop())
        await stopped
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'video/webm' })
        const base64 = await blobToBase64(blob)
        await api.session.savePcRecording({
          sessionId: session.id,
          base64,
          mimeType: blob.type,
          durationMs: Math.max(0, Date.now() - session.startedAt),
        })
      }
      const updated = await api.session.stop()
      goDraft(updated.id)
    } finally { setStopping(false) }
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              {t('record.recording')}
            </div>
            <div className="mt-1 truncate text-sm font-medium text-zinc-200">{session.deviceModel}</div>
            <div className="mt-0.5 truncate text-xs text-zinc-500">{t('record.build', { build: session.buildVersion })}</div>
            <div className="mt-1 truncate text-xs text-zinc-500">
              {session.connectionMode === 'pc'
                ? t('record.pcScreenRecording')
                : `Android ${session.androidVersion} / ${session.connectionMode.toUpperCase()}`}
            </div>
            {session.pcRecordingEnabled && (
              <div className="mt-1 text-xs text-sky-300">
                {t('record.pcStatus', { status: stopping ? t('record.saving') : t('record.recording') })}
              </div>
            )}
            {pcRecorderError && (
              <div className="mt-2 text-xs text-red-300">
                PC recording error: {pcRecorderError}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl tabular-nums text-zinc-100">{fmtElapsed(elapsedMs)}</div>
            <div className="mt-0.5 text-xs text-zinc-500">{t('record.markerCount', { count: bugs.length, plural: bugs.length === 1 ? '' : 's' })}</div>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <HotkeySummary hotkeys={hotkeys} severities={severities} onMark={markNow} />
          <button
            type="button"
            onClick={() => setShowHotkeySettings(v => !v)}
            className="shrink-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            {showHotkeySettings ? t('record.hideHotkeySettings') : t('record.showHotkeySettings')}
          </button>
          <button
            onClick={stop}
            disabled={stopping}
            data-testid="stop-session"
            className="shrink-0 rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50"
          >
            {stopping ? t('record.stopping') : t('record.stop')}
          </button>
        </div>
      </header>

      {showHotkeySettings && (
        <section className="border-b border-zinc-800 px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-zinc-400">{t('record.hotkeys')}</div>
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-[11px] text-zinc-600">
                {t('record.currentHotkeys', {
                  summary: `${hotkeys.improvement} ${labelOrDefault(severities, 'improvement')} / ${hotkeys.minor} ${labelOrDefault(severities, 'minor')} / ${hotkeys.normal} ${labelOrDefault(severities, 'normal')} / ${hotkeys.major} ${labelOrDefault(severities, 'major')}`,
                })}
              </div>
              <button
                type="button"
                onClick={resetDefaultLabels}
                className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700"
              >
                Reset
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {HOTKEY_SEVERITIES.map(({ key, severity }) => (
              <label key={key} className="text-[11px] text-zinc-500">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => markNow(severity)}
                    className="max-w-full truncate rounded px-2 py-0.5 text-[11px] font-medium text-black transition hover:brightness-110 active:translate-y-px"
                    style={{ backgroundColor: colorOrDefault(severities, severity) }}
                    title={labelOrDefault(severities, severity)}
                  >
                    {labelOrDefault(severities, severity)}
                  </button>
                </div>
                <div className="mt-1 grid grid-cols-[1fr_34px] gap-1">
                  <input
                    value={severities[severity]?.label ?? ''}
                    onChange={(e) => setSeverities({ ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), label: e.target.value } })}
                    onBlur={() => saveSeverities({
                      ...severities,
                      [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), label: labelOrDefault(severities, severity) },
                    })}
                    className="min-w-0 rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  <input
                    type="color"
                    value={colorOrDefault(severities, severity)}
                    onChange={(e) => {
                      const next = { ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), color: e.target.value } }
                      setSeverities(next)
                      void saveSeverities(next)
                    }}
                    aria-label={`${severity} color`}
                    className="h-8 w-full cursor-pointer rounded border border-zinc-800 bg-zinc-900 p-1"
                  />
                </div>
                <input
                  value={hotkeys[key]}
                  onChange={(e) => setHotkeys({ ...hotkeys, [key]: e.target.value })}
                  onBlur={() => saveHotkeys({
                    ...hotkeys,
                    [key]: hotkeys[key].trim() || DEFAULT_HOTKEYS[key],
                  })}
                  className="mt-1 w-full rounded bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
            ))}
          </div>
          <div className="mt-2 border-t border-zinc-900 pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400">Custom labels</span>
              {customSlots.length < CUSTOM_SEVERITIES.length && (
                <button
                  type="button"
                  onClick={() => {
                    const slot = CUSTOM_SEVERITIES.find(key => !customSlots.includes(key))
                    if (!slot) return
                    const next = {
                      ...severities,
                      [slot]: { ...(severities[slot] ?? DEFAULT_SEVERITIES[slot]), label: `tag ${5 + CUSTOM_SEVERITIES.indexOf(slot)}` },
                    }
                    setCustomSlots([...customSlots, slot])
                    setSeverities(next)
                    void saveSeverities(next)
                  }}
                  className="inline-flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-sm leading-none text-zinc-200 hover:bg-zinc-700"
                  title={t('common.add')}
                >
                  +
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {customSlots.map(severity => (
                <label key={severity} className="text-[11px] text-zinc-500">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => markNow(severity)}
                      className="max-w-full truncate rounded px-2 py-0.5 text-[11px] font-medium text-black transition hover:brightness-110 active:translate-y-px"
                      style={{ backgroundColor: colorOrDefault(severities, severity) }}
                      title={labelOrDefault(severities, severity)}
                    >
                      {labelOrDefault(severities, severity)}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = {
                          ...severities,
                          [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), label: '' },
                        }
                        setCustomSlots(customSlots.filter(slot => slot !== severity))
                        setSeverities(next)
                        void saveSeverities(next)
                      }}
                      className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-sm leading-none text-zinc-400 hover:bg-red-700 hover:text-white"
                      title={t('bug.deleteConfirm')}
                      aria-label={t('bug.deleteConfirm')}
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-1 grid grid-cols-[1fr_34px] gap-1">
                    <input
                      value={severities[severity]?.label ?? ''}
                      onChange={(e) => setSeverities({ ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), label: e.target.value } })}
                      onBlur={() => {
                        const trimmed = severities[severity]?.label?.trim() ?? ''
                        const next = {
                          ...severities,
                          [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), label: trimmed },
                        }
                        if (!trimmed) setCustomSlots(customSlots.filter(slot => slot !== severity))
                        void saveSeverities(next)
                      }}
                      className="min-w-0 rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <input
                      type="color"
                      value={colorOrDefault(severities, severity)}
                      onChange={(e) => {
                        const next = { ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), color: e.target.value } }
                        setSeverities(next)
                        void saveSeverities(next)
                      }}
                      aria-label={`${severity} color`}
                      className="h-8 w-full cursor-pointer rounded border border-zinc-800 bg-zinc-900 p-1"
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>
      )}

      <main className="min-h-0 flex-1 overflow-auto">
        <BugList
          api={api}
          sessionId={session.id}
          bugs={bugs}
          selectedBugId={selectedBugId}
          onSelect={(bug) => setSelectedBugId(bug.id)}
          onMutated={refreshBugs}
          allowExport={false}
          autoFocusLatest
        />
      </main>
    </div>
  )
}
