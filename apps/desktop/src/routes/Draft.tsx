import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bug, BugSeverity, Session } from '@shared/types'
import { api, assetUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { VideoPlayer, type VideoPlayerHandle } from '@/components/VideoPlayer'
import { BugList } from '@/components/BugList'

interface Loaded { session: Session; bugs: Bug[]; videoUrl: string }

export function Draft({ sessionId }: { sessionId: string }) {
  const goHome = useApp(s => s.goHome)
  const [data, setData] = useState<Loaded | null>(null)
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null)
  const [addingMarker, setAddingMarker] = useState(false)
  const [tester, setTester] = useState('')
  const [testNote, setTestNote] = useState('')
  const playerRef = useRef<VideoPlayerHandle>(null)

  const refresh = useCallback(async () => {
    const r = await api.session.get(sessionId)
    if (!r) { goHome(); return }
    const videoUrl = await assetUrl(sessionId, 'video.mp4')
    setData({ session: r.session, bugs: r.bugs, videoUrl })
    setTester(r.session.tester)
    setTestNote(r.session.testNote)
  }, [sessionId, goHome])

  useEffect(() => { refresh() }, [refresh])

  const addMarkerAtCurrentTime = useCallback(async (severity: BugSeverity = 'normal') => {
    if (addingMarker) return
    setAddingMarker(true)
    try {
      const offsetMs = playerRef.current?.currentTimeMs() ?? 0
      const bug = await api.bug.addMarker({ sessionId, offsetMs, severity })
      setSelectedBugId(bug.id)
      await refresh()
    } finally {
      setAddingMarker(false)
    }
  }, [addingMarker, refresh, sessionId])

  useEffect(() => api.onBugMarkRequested(addMarkerAtCurrentTime), [addMarkerAtCurrentTime])

  if (!data) return <div className="p-8 text-zinc-300">Loading...</div>

  const { session, bugs, videoUrl } = data
  const dur = session.durationMs ?? 0

  function selectBug(b: Bug) {
    setSelectedBugId(b.id)
    const startMs = Math.max(0, b.offsetMs - b.preSec * 1000)
    const requestedEndMs = b.offsetMs + b.postSec * 1000
    const endMs = dur > 0 ? Math.min(dur, requestedEndMs) : requestedEndMs
    playerRef.current?.playWindow(startMs, endMs)
  }

  async function discard() {
    if (!confirm('Discard this session and all its markers? This cannot be undone.')) return
    await api.session.discard(session.id)
    goHome()
  }

  return (
    <div className="grid h-screen grid-cols-[minmax(0,1fr)_460px] grid-rows-[auto_1fr] bg-zinc-950 text-zinc-100">
      <header className="col-span-2 flex items-center justify-between border-b border-zinc-800 p-3 text-sm">
        <div>
          <button onClick={goHome} className="text-zinc-400 hover:text-zinc-200">Home</button>
          <span className="ml-4 font-medium">{session.deviceModel} · build {session.buildVersion}</span>
          <span className="ml-3 text-zinc-500">{bugs.length} markers · {Math.round(dur / 1000)}s</span>
        </div>
        <button onClick={discard} className="rounded bg-zinc-800 px-3 py-1 text-xs text-red-300 hover:bg-zinc-700">Discard session</button>
      </header>

      <main className="flex min-w-0 flex-col overflow-hidden p-4">
        <VideoPlayer
          ref={playerRef}
          api={api}
          src={videoUrl}
          bugs={bugs}
          durationMs={dur}
          selectedBugId={selectedBugId}
          onMarkerClick={selectBug}
        />
        <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3">
          <div className="text-xs text-zinc-500">F6 improvement, F7 minor, F8 normal, F9 major at the current playback time.</div>
          <button
            onClick={() => addMarkerAtCurrentTime('normal')}
            disabled={addingMarker}
            className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {addingMarker ? 'Adding...' : 'Add marker'}
          </button>
        </div>
      </main>

      <aside className="flex min-h-0 flex-col overflow-hidden border-l border-zinc-800 bg-zinc-950/80">
        <div className="min-h-0 overflow-auto">
          <BugList
            api={api}
            sessionId={session.id}
            bugs={bugs}
            selectedBugId={selectedBugId}
            onSelect={selectBug}
            onMutated={refresh}
            tester={tester}
            testNote={testNote}
          />
        </div>
      </aside>
    </div>
  )
}
