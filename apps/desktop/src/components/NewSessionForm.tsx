import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import type { DesktopApi } from '@shared/types'

interface Props {
  api: DesktopApi
  deviceId: string
  connectionMode: 'usb' | 'wifi' | 'pc'
  sourceName?: string
}

export function NewSessionForm({ api, deviceId, connectionMode, sourceName }: Props) {
  const recent = useApp(s => s.recentBuilds)
  const pushRecent = useApp(s => s.pushRecentBuild)
  const goRecording = useApp(s => s.goRecording)

  const [build, setBuild] = useState(recent[0] ?? '')
  const [note, setNote] = useState('')
  const [tester, setTester] = useState('')
  const [recordPcScreen, setRecordPcScreen] = useState(connectionMode === 'pc')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRecordPcScreen(connectionMode === 'pc')
  }, [connectionMode, deviceId])

  async function start() {
    if (!build.trim()) return setError('build version is required')
    setBusy(true)
    setError(null)
    try {
      const session = await api.session.start({
        deviceId,
        connectionMode,
        buildVersion: build.trim(),
        testNote: note.trim(),
        tester: tester.trim(),
        recordPcScreen,
        pcCaptureSourceName: sourceName,
      })
      pushRecent(build.trim())
      goRecording(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Selected device</div>
            <div className="truncate text-sm font-medium text-zinc-100">{connectionMode === 'pc' ? sourceName || deviceId : deviceId}</div>
          </div>
          <span className="shrink-0 rounded bg-emerald-950 px-2 py-1 text-xs text-emerald-200">{connectionMode.toUpperCase()}</span>
        </div>
        <div className={`rounded border p-3 text-sm ${connectionMode === 'pc' ? 'border-blue-900/70 bg-blue-950/30 text-blue-100' : 'border-zinc-800 bg-zinc-900/60 text-zinc-300'}`}>
          {connectionMode === 'pc'
            ? 'PC screen recording will start automatically when you press Start session. The selected screen shows a red frame while recording.'
            : 'Android device recording will start automatically when you press Start session.'}
        </div>
      </div>

      <div>
        <label className="text-xs text-zinc-400">Build version *</label>
        <input
          value={build}
          onChange={e => setBuild(e.target.value)}
          list="recent-builds"
          placeholder="1.4.2-RC3"
          data-testid="build-version"
          className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
        <datalist id="recent-builds">{recent.map(b => <option key={b} value={b} />)}</datalist>
      </div>

      <div>
        <label className="text-xs text-zinc-400">Test note (optional)</label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g. verify BUG-1234 fix"
          data-testid="test-note"
          className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
      </div>

      <div>
        <label className="text-xs text-zinc-400">Tester (optional)</label>
        <input
          value={tester}
          onChange={e => setTester(e.target.value)}
          placeholder="e.g. QA name"
          data-testid="tester"
          className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
      </div>

      {error && <div className="rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>}

      <button
        onClick={start}
        disabled={busy || !deviceId}
        data-testid="start-session"
        className="w-full rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {busy ? 'starting...' : 'Start session'}
      </button>
    </div>
  )
}
