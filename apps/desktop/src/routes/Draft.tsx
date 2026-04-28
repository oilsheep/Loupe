import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bug, Session } from '@shared/types'
import { api, assetUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { VideoPlayer, type VideoPlayerHandle } from '@/components/VideoPlayer'
import { BugList } from '@/components/BugList'

interface Loaded { session: Session; bugs: Bug[]; videoUrl: string }

export function Draft({ sessionId }: { sessionId: string }) {
  const goHome = useApp(s => s.goHome)
  const [data, setData] = useState<Loaded | null>(null)
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null)
  const playerRef = useRef<VideoPlayerHandle>(null)

  const refresh = useCallback(async () => {
    const r = await api.session.get(sessionId)
    if (!r) { goHome(); return }
    const videoUrl = await assetUrl(sessionId, 'video.mp4')
    setData({ session: r.session, bugs: r.bugs, videoUrl })
  }, [sessionId, goHome])

  useEffect(() => { refresh() }, [refresh])

  if (!data) return <div className="p-8 text-zinc-300">Loading…</div>
  const { session, bugs, videoUrl } = data
  const dur = session.durationMs ?? 0

  function selectBug(b: Bug) {
    setSelectedBugId(b.id)
    playerRef.current?.seekToMs(Math.max(0, b.offsetMs - b.preSec * 1000))
  }

  async function discard() {
    if (!confirm('Discard this session and all its bugs? This cannot be undone.')) return
    await api.session.discard(session.id)
    goHome()
  }

  return (
    <div className="grid h-screen grid-cols-[1fr_420px] grid-rows-[auto_1fr] bg-zinc-950 text-zinc-100">
      <header className="col-span-2 flex items-center justify-between border-b border-zinc-800 p-3 text-sm">
        <div>
          <button onClick={goHome} className="text-zinc-400 hover:text-zinc-200">← Home</button>
          <span className="ml-4 font-medium">{session.deviceModel} · build {session.buildVersion}</span>
          <span className="ml-3 text-zinc-500">{bugs.length} bugs · {Math.round(dur/1000)}s</span>
        </div>
        <button onClick={discard} className="rounded bg-zinc-800 px-3 py-1 text-xs text-red-300 hover:bg-zinc-700">Discard session</button>
      </header>

      <main className="overflow-auto p-4">
        <VideoPlayer
          ref={playerRef}
          api={api}
          src={videoUrl}
          bugs={bugs}
          durationMs={dur}
          selectedBugId={selectedBugId}
          onMarkerClick={selectBug}
        />
      </main>

      <aside className="overflow-auto border-l border-zinc-800">
        <BugList
          api={api}
          sessionId={session.id}
          bugs={bugs}
          selectedBugId={selectedBugId}
          onSelect={selectBug}
          onMutated={refresh}
        />
      </aside>
    </div>
  )
}
