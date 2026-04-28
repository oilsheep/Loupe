import { useState } from 'react'
import { useApp } from '@/lib/store'
import type { DesktopApi } from '@shared/types'

interface Props {
  api: DesktopApi
  deviceId: string
  connectionMode: 'usb' | 'wifi'
}

export function NewSessionForm({ api, deviceId, connectionMode }: Props) {
  const recent = useApp(s => s.recentBuilds)
  const pushRecent = useApp(s => s.pushRecentBuild)
  const goRecording = useApp(s => s.goRecording)

  const [build, setBuild] = useState(recent[0] ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    if (!build.trim()) return setError('build version is required')
    setBusy(true); setError(null)
    try {
      const session = await api.session.start({ deviceId, connectionMode, buildVersion: build.trim(), testNote: note.trim() })
      pushRecent(build.trim())
      goRecording(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-zinc-400">Build version *</label>
        <input
          value={build} onChange={e => setBuild(e.target.value)}
          list="recent-builds" placeholder="1.4.2-RC3" data-testid="build-version"
          className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
        <datalist id="recent-builds">{recent.map(b => <option key={b} value={b} />)}</datalist>
      </div>

      <div>
        <label className="text-xs text-zinc-400">Test note (optional)</label>
        <input
          value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. verify BUG-1234 fix" data-testid="test-note"
          className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
      </div>

      {error && <div className="rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>}

      <button
        onClick={start} disabled={busy || !deviceId} data-testid="start-session"
        className="w-full rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {busy ? 'starting…' : 'Start session'}
      </button>
    </div>
  )
}
