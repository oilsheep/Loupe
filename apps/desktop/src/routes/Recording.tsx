import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioAnalysisProgress, Bug, BugSeverity, HotkeySettings, Session, SeveritySettings } from '@shared/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { BugList } from '@/components/BugList'
import { useI18n } from '@/lib/i18n'

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60), r = s % 60
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
}

function progressPercent(progress: AudioAnalysisProgress | null): number {
  if (!progress || progress.total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100)))
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
const BACKGROUND_ANALYSIS_KEY_PREFIX = 'loupe.audioAnalysis.background.'
const CUSTOM_COLORS = ['#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#f97316', '#06b6d4', '#84cc16', '#f43f5e']

function nextCustomSeverityKey(severities: SeveritySettings): BugSeverity {
  let index = 1
  while (severities[`custom${index}`]) index += 1
  return `custom${index}`
}

function visibleCustomSeverities(severities: SeveritySettings): BugSeverity[] {
  return Object.keys(severities)
    .filter(key => !HOTKEY_SEVERITIES.some(item => item.severity === key) && key !== 'note' && severities[key]?.label?.trim())
    .sort((a, b) => {
      const aNum = Number(a.match(/^custom(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
      const bNum = Number(b.match(/^custom(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
      return aNum === bNum ? a.localeCompare(b) : aNum - bNum
    })
}

function labelOrDefault(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.label?.trim() || DEFAULT_SEVERITIES[severity]?.label || severity
}

function colorOrDefault(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.color || DEFAULT_SEVERITIES[severity]?.color || '#a1a1aa'
}

function clipboardHash(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return `${value.length}:${hash}`
}

function clipboardLooksMarkerWorthy(value: string): boolean {
  const text = value.trim()
  if (text.length < 24) return false
  if (text.length > 50_000) return false
  if (/^https?:\/\/\S+$/i.test(text)) return false
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(text)) return false

  const lines = text.split(/\r?\n/).filter(Boolean)
  const codePunctuationCount = (text.match(/[{}[\]():=<>/\\]/g) ?? []).length
  let score = 0
  if (lines.length >= 2 && text.length >= 40) score += 1
  if (codePunctuationCount >= 3) score += 1
  if (/\b(?:error|exception|traceback|stack|warn|warning|fail|failed|fatal|crash|assert|uncaught|typeerror|referenceerror|syntaxerror|networkerror|errno)\b/i.test(text)) score += 2
  if (/\b(?:console|logcat|debug|info|verbose)\b/i.test(text)) score += 1
  if (/\b(?:GET|POST|PUT|PATCH|DELETE)\s+\S+|\bstatus\s*[:=]?\s*[45]\d\d\b|\b[45]\d\d\s+(?:error|failed|failure)\b/i.test(text)) score += 1
  if (/\bat\s+\S+\s*\(|^\s*[{[]|^\s*\d{2}:\d{2}:\d{2}[.\d]*\s+/m.test(text)) score += 1
  return score >= 2
}

function clipboardMarkerNote(value: string): string {
  const lines = value
    .trim()
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .slice(0, 8)
  const snippet = lines.join('\n').slice(0, 700)
  return `Clipboard console:\n${snippet}`
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
  const micRecorderRef = useRef<MediaRecorder | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micChunksRef = useRef<Blob[]>([])
  const micStartedAtRef = useRef<number | null>(null)
  const micStartOffsetMsRef = useRef<number>(0)
  const [micRecorderError, setMicRecorderError] = useState<string | null>(null)
  const [micRecording, setMicRecording] = useState(false)
  const [postAnalysisStatus, setPostAnalysisStatus] = useState<string | null>(null)
  const [postAnalysisPrompt, setPostAnalysisPrompt] = useState<{
    sessionId: string
    progress: AudioAnalysisProgress | null
    error: string | null
  } | null>(null)
  const [severities, setSeverities] = useState<SeveritySettings>(DEFAULT_SEVERITIES)
  const [customSlots, setCustomSlots] = useState<BugSeverity[]>([])
  const [showHotkeySettings, setShowHotkeySettings] = useState(false)
  const [clipboardMarkersEnabled, setClipboardMarkersEnabled] = useState(true)
  const [clipboardStatus, setClipboardStatus] = useState<'watching' | 'marked' | 'ignored' | 'unavailable'>('watching')
  const lastClipboardHashRef = useRef<string | null>(null)
  const lastClipboardMarkerAtRef = useRef(0)
  const clipboardMarkingRef = useRef(false)

  const refreshBugs = useCallback(async () => {
    const r = await api.session.get(session.id)
    if (r) setBugs(r.bugs)
  }, [session.id])

  useEffect(() => {
    const t = setInterval(() => setElapsedMs(Date.now() - session.startedAt), 500)
    return () => clearInterval(t)
  }, [session.startedAt])

  const markNow = useCallback(async (severity: BugSeverity, note?: string) => {
    const bug = await api.session.markBug({ severity, ...(note ? { note } : {}) })
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
  useEffect(() => api.onAudioAnalysisProgress((progress) => {
    setPostAnalysisPrompt(prev => {
      if (!prev || prev.sessionId !== progress.sessionId) return prev
      return {
        ...prev,
        progress,
        error: progress.phase === 'error' ? (progress.detail ?? progress.message) : prev.error,
      }
    })
  }), [])
  useEffect(() => {
    if (!postAnalysisPrompt?.progress || postAnalysisPrompt.progress.phase !== 'complete') return
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem(`${BACKGROUND_ANALYSIS_KEY_PREFIX}${postAnalysisPrompt.sessionId}`)
      goDraft(postAnalysisPrompt.sessionId)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [goDraft, postAnalysisPrompt?.progress, postAnalysisPrompt?.sessionId])
  useEffect(() => {
    api.settings.get().then(s => {
      setHotkeys(s.hotkeys)
      setSeverities(s.severities)
      setCustomSlots(visibleCustomSeverities(s.severities))
    })
  }, [])

  useEffect(() => {
    if (!clipboardMarkersEnabled) {
      lastClipboardHashRef.current = null
      return
    }

    let cancelled = false
    async function pollClipboard() {
      try {
        const text = await api.app.readClipboardText()
        if (cancelled) return
        const hash = clipboardHash(text)
        if (lastClipboardHashRef.current === null) {
          lastClipboardHashRef.current = hash
          setClipboardStatus('watching')
          return
        }
        if (hash === lastClipboardHashRef.current) return
        lastClipboardHashRef.current = hash

        if (!clipboardLooksMarkerWorthy(text)) {
          setClipboardStatus('ignored')
          return
        }
        const now = Date.now()
        if (now - lastClipboardMarkerAtRef.current < 5_000 || clipboardMarkingRef.current) {
          setClipboardStatus('ignored')
          return
        }

        clipboardMarkingRef.current = true
        lastClipboardMarkerAtRef.current = now
        await markNow('normal', clipboardMarkerNote(text))
        setClipboardStatus('marked')
      } catch {
        if (!cancelled) setClipboardStatus('unavailable')
      } finally {
        clipboardMarkingRef.current = false
      }
    }

    void pollClipboard()
    const timer = window.setInterval(() => { void pollClipboard() }, 1000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [clipboardMarkersEnabled, markNow])

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

  useEffect(() => {
    let cancelled = false

    async function startMicRecording() {
      if (!session.micRecordingRequested) return
      try {
        const mediaDevices = navigator.mediaDevices
        if (!mediaDevices?.getUserMedia) return
        const stream = await mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
        const recorder = new MediaRecorder(stream, { mimeType })
        micChunksRef.current = []
        micStreamRef.current = stream
        micRecorderRef.current = recorder
        recorder.ondataavailable = event => {
          if (event.data.size > 0) micChunksRef.current.push(event.data)
        }
        const micStartedAt = Date.now()
        recorder.start(1000)
        micStartedAtRef.current = micStartedAt
        micStartOffsetMsRef.current = Math.max(0, micStartedAt - session.startedAt)
        setMicRecording(true)
        setMicRecorderError(null)
      } catch (e) {
        setMicRecorderError(e instanceof Error ? e.message : String(e))
      }
    }

    void startMicRecording()
    return () => {
      cancelled = true
      micStreamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [session.micRecordingRequested, session.startedAt])

  async function stopAndSaveMicRecording(): Promise<boolean> {
    const recorder = micRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return false
    const stopped = new Promise<void>(resolve => {
      recorder.addEventListener('stop', () => resolve(), { once: true })
    })
    recorder.stop()
    micStreamRef.current?.getTracks().forEach(track => track.stop())
    await stopped
    setMicRecording(false)
    const blob = new Blob(micChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
    if (blob.size <= 0) return false
    const base64 = await blobToBase64(blob)
    const micStartedAt = micStartedAtRef.current ?? session.startedAt
    await api.session.saveMicRecording({
      sessionId: session.id,
      base64,
      mimeType: blob.type,
      durationMs: Math.max(0, Date.now() - micStartedAt),
      startOffsetMs: micStartOffsetMsRef.current,
    })
    return true
  }

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
      const savedMic = await stopAndSaveMicRecording().catch(e => {
        setMicRecorderError(e instanceof Error ? e.message : String(e))
        return false
      })
      const recorder = mediaRecorderRef.current
      if (usesRendererPcRecording && recorder && recorder.state !== 'inactive') {
        const stopped = new Promise<void>(resolve => {
          recorder.addEventListener('stop', () => resolve(), { once: true })
        })
        recorder.stop()
        mediaStreamRef.current?.getTracks().forEach(track => track.stop())
        await stopped
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'video/webm' })
        if (blob.size <= 0) {
          setPcRecorderError('PC recording was empty; no video was saved.')
        } else {
          const base64 = await blobToBase64(blob)
          await api.session.savePcRecording({
            sessionId: session.id,
            base64,
            mimeType: blob.type,
            durationMs: Math.max(0, Date.now() - session.startedAt),
          })
        }
      }
      const updated = await api.session.stop()
      if (savedMic) {
        const initialProgress: AudioAnalysisProgress = {
          sessionId: updated.id,
          phase: 'prepare',
          message: 'Preparing microphone audio analysis',
          detail: 'Please wait while Loupe analyzes the QA microphone recording.',
          current: 0,
          total: 4,
          generated: 0,
        }
        setPostAnalysisPrompt({ sessionId: updated.id, progress: initialProgress, error: null })
        setPostAnalysisStatus('analyzing')
        void api.audioAnalysis.analyzeSession(updated.id)
          .catch(e => {
            const message = e instanceof Error ? e.message : String(e)
            setMicRecorderError(message)
            setPostAnalysisPrompt(prev => prev?.sessionId === updated.id ? { ...prev, error: message } : prev)
          })
          .finally(() => setPostAnalysisStatus(null))
        return
      }
      goDraft(updated.id)
    } finally { setStopping(false) }
  }

  function continueAnalysisInBackground() {
    if (!postAnalysisPrompt) return
    sessionStorage.setItem(`${BACKGROUND_ANALYSIS_KEY_PREFIX}${postAnalysisPrompt.sessionId}`, '1')
    goDraft(postAnalysisPrompt.sessionId)
  }

  async function abandonPostAnalysis() {
    if (!postAnalysisPrompt) return
    const ok = window.confirm('放棄音訊分析？這次 session 會直接進入 review，不會自動產生語音點位。')
    if (!ok) return
    await api.audioAnalysis.cancel(postAnalysisPrompt.sessionId).catch(() => {})
    sessionStorage.removeItem(`${BACKGROUND_ANALYSIS_KEY_PREFIX}${postAnalysisPrompt.sessionId}`)
    goDraft(postAnalysisPrompt.sessionId)
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
            {session.micRecordingRequested ? (
              <div className={`mt-1 text-xs ${micRecording ? 'text-emerald-300' : 'text-zinc-500'}`}>
                MIC recording: {postAnalysisStatus ?? (micRecording ? 'recording' : micRecorderError ? 'unavailable' : 'standby')}
              </div>
            ) : (
              <div className="mt-1 text-xs text-zinc-600">MIC recording: off</div>
            )}
            {micRecorderError && (
              <div className="mt-1 text-xs text-amber-300">
                MIC recording error: {micRecorderError}
              </div>
            )}
            <label className="mt-2 inline-flex items-center gap-2 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={clipboardMarkersEnabled}
                onChange={(e) => {
                  setClipboardMarkersEnabled(e.target.checked)
                  setClipboardStatus(e.target.checked ? 'watching' : 'ignored')
                }}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              <span>{t('record.clipboardMarkers')}</span>
              <span className={clipboardStatus === 'marked' ? 'text-emerald-300' : clipboardStatus === 'unavailable' ? 'text-amber-300' : 'text-zinc-600'}>
                {t(`record.clipboardStatus.${clipboardMarkersEnabled ? clipboardStatus : 'off'}`)}
              </span>
            </label>
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
                    onChange={(e) => setSeverities({ ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { color: '#8b5cf6' }), label: e.target.value } })}
                    onBlur={() => saveSeverities({
                      ...severities,
                      [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { color: '#8b5cf6' }), label: labelOrDefault(severities, severity) },
                    })}
                    className="min-w-0 rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  <input
                    type="color"
                    value={colorOrDefault(severities, severity)}
                    onChange={(e) => {
                      const next = { ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { label: severity }), color: e.target.value } }
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
              <button
                type="button"
                onClick={() => {
                  const slot = nextCustomSeverityKey(severities)
                  const customCount = Object.keys(severities).filter(key => key.startsWith('custom')).length
                  const next = {
                    ...severities,
                    [slot]: { label: `tag ${customCount + 1}`, color: CUSTOM_COLORS[customCount % CUSTOM_COLORS.length] },
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
                          [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { color: '#8b5cf6' }), label: '' },
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
                      onChange={(e) => setSeverities({ ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { color: '#8b5cf6' }), label: e.target.value } })}
                      onBlur={() => {
                        const trimmed = severities[severity]?.label?.trim() ?? ''
                        const next = {
                          ...severities,
                          [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { color: '#8b5cf6' }), label: trimmed },
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
                        const next = { ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { label: severity }), color: e.target.value } }
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
      {postAnalysisPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="text-lg font-semibold text-zinc-100">正在分析麥克風音訊</div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Loupe 正在用離線 STT 分析 QA 語音，完成後會自動產生可編輯的音訊點位。你可以等待完成，或先進入 review 讓它在背景處理。
            </p>
            <div className="mt-5 rounded border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex items-center justify-between gap-3 text-sm text-zinc-300">
                <span className="min-w-0 truncate">{postAnalysisPrompt.progress?.message ?? 'Preparing audio analysis'}</span>
                <span className="font-mono tabular-nums text-zinc-400">{progressPercent(postAnalysisPrompt.progress)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${progressPercent(postAnalysisPrompt.progress)}%` }}
                />
              </div>
              <div className="mt-2 min-h-5 break-words text-xs leading-relaxed text-zinc-500">
                {postAnalysisPrompt.error
                  ? postAnalysisPrompt.error
                  : postAnalysisPrompt.progress?.detail ?? '請稍候，分析期間 session 內容不會遺失。'}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={abandonPostAnalysis}
                className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
              >
                放棄
              </button>
              <button
                type="button"
                onClick={continueAnalysisInBackground}
                className="rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-600"
              >
                背景處理
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
