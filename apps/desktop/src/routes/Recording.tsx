import { useEffect, useState } from 'react'
import type { Session } from '@shared/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { BugMarkDialog } from '@/components/BugMarkDialog'

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60), r = s % 60
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
}

export function Recording({ session }: { session: Session }) {
  const goDraft = useApp(s => s.goDraft)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bugCount, setBugCount] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setElapsedMs(Date.now() - session.startedAt), 500)
    return () => clearInterval(t)
  }, [session.startedAt])

  useEffect(() => {
    return api.onBugMarkRequested(() => setDialogOpen(true))
  }, [])

  async function stop() {
    setStopping(true)
    try {
      const updated = await api.session.stop()
      goDraft(updated.id)
    } finally { setStopping(false) }
  }

  return (
    <div className="grid h-screen grid-cols-[1fr_360px] bg-zinc-950 text-zinc-100">
      <main className="flex flex-col items-center justify-center p-8">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Recording</div>
        <div className="mt-2 font-mono text-6xl tabular-nums">{fmtElapsed(elapsedMs)}</div>
        <div className="mt-3 text-sm text-zinc-400">{bugCount} bug{bugCount === 1 ? '' : 's'} marked · build {session.buildVersion}</div>
        <div className="mt-1 text-xs text-zinc-500">
          The scrcpy mirror window is separate. Press <kbd className="rounded bg-zinc-800 px-1.5 py-0.5">F8</kbd> from anywhere to mark a bug.
        </div>
        <button
          onClick={stop} disabled={stopping} data-testid="stop-session"
          className="mt-10 rounded bg-zinc-800 px-6 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
        >{stopping ? 'stopping…' : 'Stop session'}</button>
      </main>

      <aside className="border-l border-zinc-800 p-4 text-xs text-zinc-400">
        <div className="font-medium text-zinc-300">{session.deviceModel}</div>
        <div>Android {session.androidVersion} · {session.connectionMode.toUpperCase()}</div>
        {session.testNote && <div className="mt-3 italic text-zinc-500">{session.testNote}</div>}
      </aside>

      <BugMarkDialog
        open={dialogOpen} api={api}
        onSubmitted={() => { setDialogOpen(false); setBugCount(c => c + 1) }}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  )
}
