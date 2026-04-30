import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bug, BugSeverity, Session, SessionLoadProgress } from '@shared/types'
import { api, assetUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { VideoPlayer, type VideoPlayerHandle } from '@/components/VideoPlayer'
import { BugList } from '@/components/BugList'
import { useI18n } from '@/lib/i18n'

interface Loaded { session: Session; bugs: Bug[]; videoUrl: string; micAudioUrl: string | null }

export function Draft({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const goHome = useApp(s => s.goHome)
  const [data, setData] = useState<Loaded | null>(null)
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null)
  const [addingMarker, setAddingMarker] = useState(false)
  const [buildVersion, setBuildVersion] = useState('')
  const [tester, setTester] = useState('')
  const [testNote, setTestNote] = useState('')
  const [loadProgress, setLoadProgress] = useState<SessionLoadProgress | null>(null)
  const playerRef = useRef<VideoPlayerHandle>(null)

  const refresh = useCallback(async () => {
    const r = await api.session.get(sessionId)
    if (!r) { goHome(); return }
    const videoRel = r.session.connectionMode === 'pc' && r.session.pcVideoPath ? 'pc-recording.webm' : 'video.mp4'
    const videoUrl = await assetUrl(sessionId, videoRel)
    const micAudioUrl = r.session.micAudioPath ? await assetUrl(sessionId, 'session-mic.webm') : null
    setData({ session: r.session, bugs: r.bugs, videoUrl, micAudioUrl })
    setBuildVersion(r.session.buildVersion)
    setTester(r.session.tester)
    setTestNote(r.session.testNote)
  }, [sessionId, goHome])

  useEffect(() => api.onSessionLoadProgress((progress) => {
    if (progress.sessionId !== sessionId) return
    setLoadProgress(progress)
  }), [sessionId])
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

  if (!data) {
    const pct = loadProgress && loadProgress.total > 0 ? Math.round((loadProgress.current / loadProgress.total) * 100) : 0
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-200">
        <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-2xl">
          <div className="text-sm font-medium">{t('session.loadingTitle')}</div>
          <div className="mt-1 text-xs text-zinc-500">{loadProgress?.message ?? t('session.loadingDetail')}</div>
          <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
            <span>{loadProgress?.detail ?? t('common.loading')}</span>
            <span className="font-mono tabular-nums">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 text-right text-[11px] text-zinc-600">
            {t('export.progressStep', { current: loadProgress?.current ?? 0, total: loadProgress?.total ?? 0 })}
          </div>
        </div>
      </div>
    )
  }

  const { session, bugs, videoUrl, micAudioUrl } = data
  const dur = session.durationMs ?? 0

  function selectBug(b: Bug) {
    setSelectedBugId(b.id)
    const startMs = Math.max(0, b.offsetMs - b.preSec * 1000)
    const requestedEndMs = b.offsetMs + b.postSec * 1000
    const endMs = dur > 0 ? Math.min(dur, requestedEndMs) : requestedEndMs
    playerRef.current?.playWindow(startMs, endMs)
  }

  function closeSession() {
    goHome()
  }

  async function saveMetadata(next?: { buildVersion?: string; testNote?: string; tester?: string }) {
    const patch = {
      buildVersion: next?.buildVersion ?? buildVersion,
      testNote: next?.testNote ?? testNote,
      tester: next?.tester ?? tester,
    }
    await api.session.updateMetadata(session.id, patch)
    setData(prev => prev ? { ...prev, session: { ...prev.session, ...patch } } : prev)
  }

  return (
    <div className="grid h-screen grid-cols-[minmax(0,1fr)_460px] grid-rows-[auto_1fr] bg-zinc-950 text-zinc-100">
      <header className="col-span-2 flex items-center justify-between border-b border-zinc-800 p-3 text-sm">
        <div>
          <button onClick={goHome} className="text-zinc-400 hover:text-zinc-200">{t('draft.home')}</button>
          <span className="ml-4 font-medium">{session.deviceModel} · build {session.buildVersion}</span>
          <span className="ml-3 text-zinc-500">{bugs.length} markers · {Math.round(dur / 1000)}s</span>
        </div>
        <button onClick={closeSession} className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700">{t('draft.close')}</button>
      </header>

      <main className="flex min-w-0 flex-col overflow-hidden p-4">
        <VideoPlayer
          ref={playerRef}
          api={api}
          src={videoUrl}
          micAudioSrc={micAudioUrl}
          bugs={bugs}
          durationMs={dur}
          selectedBugId={selectedBugId}
          onMarkerClick={selectBug}
        />
        <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3">
          <div className="text-xs text-zinc-500">{t('draft.hotkeyHelp')}</div>
          <button
            onClick={() => addMarkerAtCurrentTime('normal')}
            disabled={addingMarker}
            className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {addingMarker ? t('draft.adding') : t('draft.addMarker')}
          </button>
        </div>
      </main>

      <aside className="flex min-h-0 flex-col overflow-hidden border-l border-zinc-800 bg-zinc-950/80">
        <div className="border-b border-zinc-800 p-3">
          <div className="grid gap-2">
            <label className="text-[11px] font-semibold text-zinc-300">
              {t('new.buildVersion')}
              <input
                value={buildVersion}
                onChange={(e) => setBuildVersion(e.target.value)}
                onBlur={() => { void saveMetadata({ buildVersion: buildVersion.trim() }) }}
                className="mt-1 w-full rounded bg-zinc-900 px-2 py-1.5 text-xs font-normal text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-zinc-500">
                {t('export.tester')}
                <input
                  value={tester}
                  onChange={(e) => setTester(e.target.value)}
                  onBlur={() => { void saveMetadata({ tester: tester.trim() }) }}
                  placeholder={t('export.qaName')}
                  className="mt-1 w-full rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
              <label className="text-[11px] text-zinc-500">
                {t('export.testNote')}
                <input
                  value={testNote}
                  onChange={(e) => setTestNote(e.target.value)}
                  onBlur={() => { void saveMetadata({ testNote: testNote.trim() }) }}
                  placeholder={t('export.scope')}
                  className="mt-1 w-full rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
            </div>
          </div>
        </div>
        <div className="min-h-0 overflow-auto">
          <BugList
            api={api}
            sessionId={session.id}
            bugs={bugs}
            selectedBugId={selectedBugId}
            onSelect={selectBug}
            onMutated={refresh}
            buildVersion={buildVersion}
            tester={tester}
            testNote={testNote}
            hasSessionMicTrack={Boolean(session.micAudioPath)}
          />
        </div>
      </aside>
    </div>
  )
}
