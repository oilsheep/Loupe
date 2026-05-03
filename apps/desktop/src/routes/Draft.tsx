import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioAnalysisProgress, AudioAnalysisSettings, Bug, BugSeverity, Session, SessionLoadProgress, SeveritySettings } from '@shared/types'
import { api, assetUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { VideoPlayer, type TranscriptSegment, type VideoPlayerHandle } from '@/components/VideoPlayer'
import { BugList, type BugListHandle } from '@/components/BugList'
import { PreferencesController } from '@/components/PreferencesController'
import { useI18n } from '@/lib/i18n'

interface Loaded { session: Session; bugs: Bug[]; videoUrl: string; micAudioUrl: string | null; transcriptSegments: TranscriptSegment[] }

const AUDIO_ANALYSIS_LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'System / Auto' },
  { value: 'zh', label: 'Chinese' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
]

const DEFAULT_SEVERITIES: SeveritySettings = {
  note: { label: 'default', color: '#a1a1aa' },
  major: { label: 'Critical', color: '#ff4d4f' },
  normal: { label: 'Bug', color: '#f59e0b' },
  minor: { label: 'Polish', color: '#22b8f0' },
  improvement: { label: 'Note', color: '#22c55e' },
  custom1: { label: '', color: '#8b5cf6' },
  custom2: { label: '', color: '#ec4899' },
  custom3: { label: '', color: '#14b8a6' },
  custom4: { label: '', color: '#eab308' },
}
const PRIMARY_MARKER_SEVERITIES: BugSeverity[] = ['improvement', 'minor', 'normal', 'major']
const MARKER_HOTKEY_LABELS: Partial<Record<BugSeverity, string>> = {
  improvement: 'F6',
  minor: 'F7',
  normal: 'F8',
  major: 'F9',
}
const BACKGROUND_ANALYSIS_KEY_PREFIX = 'loupe.audioAnalysis.background.'

function labelOrDefault(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.label?.trim() || DEFAULT_SEVERITIES[severity]?.label || severity
}

function colorOrDefault(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.color || DEFAULT_SEVERITIES[severity]?.color || '#a1a1aa'
}

function visibleMarkerSeverities(severities: SeveritySettings): BugSeverity[] {
  const customSeverities = Object.keys(severities)
    .filter(severity => !PRIMARY_MARKER_SEVERITIES.includes(severity) && severity !== 'note' && severities[severity]?.label?.trim())
    .sort((a, b) => {
      const aNum = Number(a.match(/^custom(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
      const bNum = Number(b.match(/^custom(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
      return aNum === bNum ? a.localeCompare(b) : aNum - bNum
    })
  return [
    ...PRIMARY_MARKER_SEVERITIES,
    ...customSeverities,
  ]
}

const CUSTOM_COLORS = ['#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#f97316', '#06b6d4', '#84cc16', '#f43f5e']

function nextCustomSeverityKey(severities: SeveritySettings): BugSeverity {
  let index = 1
  while (severities[`custom${index}`]) index += 1
  return `custom${index}`
}

export function Draft({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const goHome = useApp(s => s.goHome)
  const [data, setData] = useState<Loaded | null>(null)
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null)
  const [addingMarker, setAddingMarker] = useState(false)
  const [buildVersion, setBuildVersion] = useState('')
  const [tester, setTester] = useState('')
  const [testNote, setTestNote] = useState('')
  const [micOffsetSec, setMicOffsetSec] = useState('0')
  const [loadProgress, setLoadProgress] = useState<SessionLoadProgress | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState<AudioAnalysisProgress | null>(null)
  const [analyzingAudio, setAnalyzingAudio] = useState(false)
  const [backgroundAnalyzingAudio, setBackgroundAnalyzingAudio] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [audioSettings, setAudioSettings] = useState<AudioAnalysisSettings | null>(null)
  const [severities, setSeverities] = useState<SeveritySettings>(DEFAULT_SEVERITIES)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [audioPanelOpen, setAudioPanelOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const playerRef = useRef<VideoPlayerHandle>(null)
  const bugListRef = useRef<BugListHandle>(null)

  const refresh = useCallback(async () => {
    const r = await api.session.get(sessionId)
    if (!r) { goHome(); return }
    const videoRel = r.session.connectionMode === 'pc' && r.session.pcVideoPath ? 'pc-recording.webm' : 'video.mp4'
    const videoUrl = await assetUrl(sessionId, videoRel)
    const importedVideoAnalysisAudio = r.session.deviceId.startsWith('import:') && (r.session.micAudioSource ?? 'video') === 'video'
    const micAudioUrl = r.session.micAudioPath && !importedVideoAnalysisAudio ? await assetUrl(sessionId, 'session-mic.webm') : null
    let transcriptSegments: TranscriptSegment[] = []
    try {
      const transcriptUrl = await assetUrl(sessionId, 'analysis/audio-transcript.normalized.json')
      const response = await fetch(transcriptUrl, { cache: 'no-store' })
      if (response.ok) {
        const parsed = await response.json()
        if (Array.isArray(parsed)) transcriptSegments = parsed
      }
    } catch {
      transcriptSegments = []
    }
    setData({ session: r.session, bugs: r.bugs, videoUrl, micAudioUrl, transcriptSegments })
    setBuildVersion(r.session.buildVersion)
    setTester(r.session.tester)
    setTestNote(r.session.testNote)
    setMicOffsetSec(String(Math.round((r.session.micAudioStartOffsetMs ?? 0) / 100) / 10))
  }, [sessionId, goHome])

  useEffect(() => api.onSessionLoadProgress((progress) => {
    if (progress.sessionId !== sessionId) return
    setLoadProgress(progress)
  }), [sessionId])
  useEffect(() => {
    setBackgroundAnalyzingAudio(sessionStorage.getItem(`${BACKGROUND_ANALYSIS_KEY_PREFIX}${sessionId}`) === '1')
  }, [sessionId])
  useEffect(() => api.onAudioAnalysisProgress((progress) => {
    if (progress.sessionId !== sessionId) return
    setAnalysisProgress(progress)
    if (progress.phase === 'error') {
      setAnalysisError(progress.detail ?? progress.message)
      setBackgroundAnalyzingAudio(false)
      sessionStorage.removeItem(`${BACKGROUND_ANALYSIS_KEY_PREFIX}${sessionId}`)
    }
    if (progress.phase === 'complete') {
      setBackgroundAnalyzingAudio(false)
      setAudioPanelOpen(false)
      sessionStorage.removeItem(`${BACKGROUND_ANALYSIS_KEY_PREFIX}${sessionId}`)
      void refresh()
    }
  }), [refresh, sessionId])
  const reloadSettings = useCallback(async () => {
    const settings = await api.settings.get()
    setAudioSettings(settings.audioAnalysis)
    setSeverities(settings.severities)
  }, [])
  useEffect(() => {
    let cancelled = false
    reloadSettings().catch(err => {
      if (!cancelled) setAnalysisError(err instanceof Error ? err.message : String(err))
    })
    return () => { cancelled = true }
  }, [reloadSettings])
  useEffect(() => { refresh() }, [refresh])

  const analyzeAudio = useCallback(async () => {
    if (analyzingAudio || backgroundAnalyzingAudio) return
    setAnalyzingAudio(true)
    setAnalysisError('')
    setAnalysisProgress({
      sessionId,
      phase: 'prepare',
      message: 'Starting audio analysis',
      current: 0,
      total: 4,
      generated: 0,
    })
    try {
      const result = await api.audioAnalysis.analyzeSession(sessionId)
      await refresh()
      setAnalysisProgress({
        sessionId,
        phase: 'complete',
        message: 'Audio analysis complete',
        detail: `${result.generated} generated, ${result.merged} merged, ${result.removedAutoMarkers} replaced from ${result.segments} transcript segment(s).`,
        current: 4,
        total: 4,
        generated: result.generated,
      })
      setAudioPanelOpen(false)
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err))
    } finally {
      setAnalyzingAudio(false)
    }
  }, [analyzingAudio, backgroundAnalyzingAudio, refresh, sessionId])

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

  const addCustomSeverity = useCallback(async () => {
    const key = nextCustomSeverityKey(severities)
    const customCount = Object.keys(severities).filter(severity => severity.startsWith('custom')).length
    const next: SeveritySettings = {
      ...severities,
      [key]: {
        label: `tag ${customCount + 1}`,
        color: CUSTOM_COLORS[customCount % CUSTOM_COLORS.length],
      },
    }
    setSeverities(next)
    const saved = await api.settings.setSeverities(next)
    setSeverities(saved.severities)
  }, [severities])

  const updateBugClipWindow = useCallback(async (bug: Bug, preSec: number, postSec: number) => {
    const nextPre = Math.max(0, Math.round(preSec * 10) / 10)
    const nextPost = Math.max(0, Math.round(postSec * 10) / 10)
    setData(prev => prev ? {
      ...prev,
      bugs: prev.bugs.map(item => item.id === bug.id ? { ...item, preSec: nextPre, postSec: nextPost } : item),
    } : prev)
    await api.bug.update(bug.id, {
      note: bug.note,
      severity: bug.severity,
      preSec: nextPre,
      postSec: nextPost,
      mentionUserIds: bug.mentionUserIds ?? [],
    })
  }, [])

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

  const { session, bugs, videoUrl, micAudioUrl, transcriptSegments } = data
  const dur = session.durationMs ?? 0
  const autoMarkerCount = bugs.filter(b => b.source === 'audio-auto').length
  const manualMarkerCount = bugs.length - autoMarkerCount
  const analysisPct = analysisProgress && analysisProgress.total > 0
    ? Math.round((analysisProgress.current / analysisProgress.total) * 100)
    : 0
  const showAnalysisProgress = Boolean(
    backgroundAnalyzingAudio ||
    analyzingAudio ||
    (analysisProgress && analysisProgress.phase !== 'complete' && analysisProgress.phase !== 'error'),
  )
  const markerSeverities = visibleMarkerSeverities(severities)
  const markerToolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-zinc-500">{addingMarker ? t('draft.adding') : t('draft.addMarker')}</span>
      {markerSeverities.map(severity => (
        <button
          key={severity}
          type="button"
          onClick={() => addMarkerAtCurrentTime(severity)}
          disabled={addingMarker}
          className="rounded px-2 py-0.5 text-xs text-black hover:brightness-110 disabled:opacity-50"
          style={{ backgroundColor: colorOrDefault(severities, severity) }}
          title={labelOrDefault(severities, severity)}
        >
          {MARKER_HOTKEY_LABELS[severity] ? `${MARKER_HOTKEY_LABELS[severity]}: ` : ''}
          {labelOrDefault(severities, severity)}
        </button>
      ))}
      <button
        type="button"
        onClick={addCustomSeverity}
        disabled={addingMarker}
        className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
        title="Add custom label"
      >
        +
      </button>
    </div>
  )

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

  async function saveAudioLanguage(language: string) {
    const current = audioSettings ?? (await api.settings.get()).audioAnalysis
    const next = { ...current, language }
    setAudioSettings(next)
    try {
      const saved = await api.settings.setAudioAnalysis(next)
      setAudioSettings(saved.audioAnalysis)
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveMicOffset() {
    if (!session.micAudioPath) return
    const offsetMs = Math.round((Number(micOffsetSec) || 0) * 1000)
    const updated = await api.session.updateMicAudioOffset(session.id, offsetMs)
    setData(prev => prev ? { ...prev, session: { ...prev.session, ...updated } } : prev)
    setMicOffsetSec(String(Math.round((updated.micAudioStartOffsetMs ?? 0) / 100) / 10))
  }

  return (
    <div className="grid h-screen grid-cols-[minmax(0,1fr)_460px] grid-rows-[auto_1fr] bg-zinc-950 text-zinc-100">
      <PreferencesController
        open={preferencesOpen}
        onClose={() => {
          setPreferencesOpen(false)
          void reloadSettings()
        }}
      />
      <header className="col-span-2 flex items-center justify-between gap-3 border-b border-zinc-800 p-3 text-sm">
        <div>
          <button onClick={goHome} className="text-zinc-400 hover:text-zinc-200">{t('draft.home')}</button>
          <span className="ml-4 font-medium">{session.deviceModel} · build {session.buildVersion}</span>
          <span className="ml-3 text-zinc-500">{bugs.length} markers · {Math.round(dur / 1000)}s</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setPreferencesOpen(true)}
            className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            {t('home.preferences')}
          </button>
          <button
            onClick={() => bugListRef.current?.exportAll()}
            className="rounded bg-blue-700 px-3 py-1 text-xs text-white hover:bg-blue-600"
          >
            {bugs.length === 0 ? t('bug.exportRecording') : t('bug.exportCount', { count: bugs.length })}
          </button>
          <button onClick={closeSession} className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700">{t('draft.close')}</button>
        </div>
      </header>

      <main className="flex min-h-0 min-w-0 flex-col overflow-auto p-3">
        <VideoPlayer
          ref={playerRef}
          api={api}
          src={videoUrl}
          micAudioSrc={micAudioUrl}
          micAudioStartOffsetMs={session.micAudioStartOffsetMs}
          transcriptSegments={transcriptSegments}
          severities={severities}
          bugs={bugs}
          durationMs={dur}
          selectedBugId={selectedBugId}
          onMarkerClick={selectBug}
          onClipWindowChange={updateBugClipWindow}
        />
      </main>

      <aside className="flex min-h-0 flex-col overflow-hidden border-l border-zinc-800 bg-zinc-950/80">
        <div className="border-b border-zinc-800 p-2">
          <div className="grid gap-2">
            <section className="rounded border border-zinc-800 bg-zinc-900/50">
              <button
                type="button"
                onClick={() => setMetadataOpen(v => !v)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800/70"
                aria-expanded={metadataOpen}
              >
                <span className="font-medium">{t('new.buildVersion')}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-500">{buildVersion || '-'}</span>
                <span className="text-zinc-500">{metadataOpen ? '收合' : '展開'}</span>
              </button>
              {metadataOpen && (
                <div className="grid gap-2 border-t border-zinc-800 p-3">
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
              )}
            </section>

            <section className="rounded border border-zinc-800 bg-zinc-900/50">
              <button
                type="button"
                onClick={() => setAudioPanelOpen(v => !v)}
                className="w-full px-3 py-2 text-left hover:bg-zinc-800/70"
                aria-expanded={audioPanelOpen}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-200">Audio auto-markers</div>
                    <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {backgroundAnalyzingAudio
                        ? 'Audio analysis is running in the background.'
                        : session.micAudioPath
                        ? `${manualMarkerCount} manual / ${autoMarkerCount} audio auto`
                        : 'No QA mic recording.'}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-500">{audioPanelOpen ? '收合' : '展開'}</span>
                </div>
                {showAnalysisProgress && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                      <span className="min-w-0 truncate">{analysisProgress?.message ?? 'Audio analysis is running in the background'}</span>
                      <span>{analysisPct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${analysisPct || 8}%` }} />
                    </div>
                  </div>
                )}
              </button>
              {audioPanelOpen && (
                <div className="border-t border-zinc-800 p-3 pt-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
                    <label htmlFor="audio-analysis-language" className="sr-only">Audio analysis language</label>
                    <select
                      id="audio-analysis-language"
                      aria-label="Audio analysis language"
                      value={audioSettings?.language || 'auto'}
                      onChange={(e) => { void saveAudioLanguage(e.target.value) }}
                      disabled={analyzingAudio || backgroundAnalyzingAudio || !session.micAudioPath}
                      className="min-w-0 rounded bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 outline-none hover:bg-zinc-700 focus:ring-1 focus:ring-blue-600 disabled:opacity-50"
                    >
                      {AUDIO_ANALYSIS_LANGUAGE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={analyzeAudio}
                      disabled={analyzingAudio || backgroundAnalyzingAudio || !session.micAudioPath}
                      className="shrink-0 rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {backgroundAnalyzingAudio ? 'Running...' : analyzingAudio ? 'Analyzing...' : autoMarkerCount > 0 ? 'Re-analyze' : 'Analyze'}
                    </button>
                  </div>
                  {session.micAudioPath && (
                    <div className="mt-2 rounded border border-sky-900/60 bg-sky-950/30 px-2 py-1 text-[11px] leading-snug text-sky-100">
                      {session.micAudioSource === 'video'
                        ? 'Re-analysis uses the imported video audio. It is not played separately during review to avoid duplicate sound; use offset only if the transcript timing needs alignment.'
                        : 'Re-analysis uses the session MIC track. Adjust offset if the narration starts earlier or later than the video.'}
                    </div>
                  )}
                  {session.micAudioPath && (
                    <label className="mt-2 block text-[11px] text-zinc-500">
                      {session.micAudioSource === 'video' ? 'Analysis audio offset (seconds)' : 'MIC offset (seconds)'}
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={micOffsetSec}
                          onChange={(e) => setMicOffsetSec(e.target.value)}
                          onBlur={() => { void saveMicOffset() }}
                          className="w-24 rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => { void saveMicOffset() }}
                          className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 hover:bg-zinc-700"
                        >
                          Save
                        </button>
                      </div>
                    </label>
                  )}
                  {showAnalysisProgress && analysisProgress?.detail && (
                    <div className="mt-2 break-words text-[11px] leading-snug text-zinc-500">{analysisProgress.detail}</div>
                  )}
                  {analysisError && <div className="mt-2 rounded border border-red-900 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">{analysisError}</div>}
                </div>
              )}
            </section>
          </div>
        </div>
        <div className="min-h-0 overflow-auto">
          <BugList
            ref={bugListRef}
            api={api}
            sessionId={session.id}
            bugs={bugs}
            selectedBugId={selectedBugId}
            onSelect={selectBug}
            onMutated={refresh}
            buildVersion={buildVersion}
            tester={tester}
            testNote={testNote}
            hasSessionMicTrack={Boolean(session.micAudioPath && session.micAudioSource !== 'video')}
            markerToolbar={markerToolbar}
          />
        </div>
      </aside>
    </div>
  )
}
