import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bug, BugSeverity, HotkeySettings, Session } from '@shared/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { BugList } from '@/components/BugList'

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
const HOTKEY_SEVERITIES: Array<{ key: keyof HotkeySettings; label: string }> = [
  { key: 'improvement', label: 'improvement' },
  { key: 'minor', label: 'minor' },
  { key: 'normal', label: 'normal' },
  { key: 'major', label: 'major' },
]

const SEVERITY_BUTTON_CLASS: Record<keyof HotkeySettings, string> = {
  improvement: 'bg-emerald-600 text-zinc-950 hover:bg-emerald-500',
  minor: 'bg-sky-600 text-white hover:bg-sky-500',
  normal: 'bg-amber-500 text-zinc-950 hover:bg-amber-400',
  major: 'bg-red-500 text-white hover:bg-red-400',
}

const SEVERITY_LABEL_CLASS: Record<keyof HotkeySettings, string> = {
  improvement: 'text-emerald-300',
  minor: 'text-sky-300',
  normal: 'text-amber-300',
  major: 'text-red-300',
}

export function Recording({ session }: { session: Session }) {
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
  useEffect(() => { refreshBugs() }, [refreshBugs])
  useEffect(() => {
    api.settings.get().then(s => {
      setHotkeys(s.hotkeys)
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
      <header className="border-b border-zinc-800 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              Recording
            </div>
            <div className="mt-1 truncate text-sm font-medium text-zinc-200">{session.deviceModel}</div>
            <div className="mt-0.5 truncate text-xs text-zinc-500">build {session.buildVersion}</div>
            {session.pcRecordingEnabled && (
              <div className="mt-2 text-xs text-sky-300">
                PC recording: {stopping ? 'saving' : 'recording'}
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
            <div className="mt-0.5 text-xs text-zinc-500">{bugs.length} marker{bugs.length === 1 ? '' : 's'}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">{hotkeys.improvement} improvement / {hotkeys.minor} minor / {hotkeys.normal} normal / {hotkeys.major} major</div>
          <button
            onClick={stop}
            disabled={stopping}
            data-testid="stop-session"
            className="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
          >
            {stopping ? 'Stopping...' : 'Stop'}
          </button>
        </div>
      </header>

      <section className="border-b border-zinc-800 px-3 py-2">
        <div className="mb-2 text-[11px] font-medium text-zinc-400">Marker hotkeys</div>
        <div className="grid grid-cols-2 gap-2">
          {HOTKEY_SEVERITIES.map(({ key, label }) => (
            <label key={key} className="text-[11px] text-zinc-500">
              <div className="flex items-center justify-between gap-2">
                <span className={SEVERITY_LABEL_CLASS[key]}>{label}</span>
                <button
                  type="button"
                  onClick={() => markNow(key)}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium ${SEVERITY_BUTTON_CLASS[key]}`}
                >
                  Add
                </button>
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
        <div className="mt-2 text-[11px] leading-4 text-zinc-600">
          Current: {hotkeys.improvement} improvement / {hotkeys.minor} minor / {hotkeys.normal} normal / {hotkeys.major} major.
          Use function keys or modifier chords like Ctrl+Alt+N; plain letters can steal typing system-wide.
        </div>
      </section>

      <section className="border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <div>
          {session.connectionMode === 'pc'
            ? 'PC screen recording'
            : `Android ${session.androidVersion} / ${session.connectionMode.toUpperCase()}`}
        </div>
        {session.testNote && <div className="mt-2 italic text-zinc-500">{session.testNote}</div>}
      </section>

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
