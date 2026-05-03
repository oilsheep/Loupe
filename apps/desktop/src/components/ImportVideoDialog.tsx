import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { useI18n } from '@/lib/i18n'
import { AudioAnalysisWaitDialog } from '@/components/AudioAnalysisWaitDialog'
import type { AudioAnalysisProgress, AudioAnalysisSettings, CommonSessionSettings, DesktopApi, Session } from '@shared/types'
import { AUDIO_ANALYSIS_LANGUAGE_OPTIONS as SHARED_AUDIO_LANGUAGE_OPTIONS, triggerPreset as sharedTriggerPreset } from '@/lib/audioAnalysisPresets'

interface Props {
  api: DesktopApi
  open: boolean
  onClose(): void
}

const AUDIO_ANALYSIS_LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'System / Auto' },
  { value: 'zh', label: 'Chinese' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
]

const TRIGGER_PRESETS: Record<string, string> = {
  auto: 'record, mark, log, 記錄, 紀錄, 標記',
  zh: '記錄, 紀錄, 標記',
  en: 'record, mark, log',
  ja: '記録, マーク',
  ko: '기록, 마크, 로그',
  es: 'grabar, marcar, registrar',
}

const BACKGROUND_ANALYSIS_KEY_PREFIX = 'loupe.audioAnalysis.background.'

function triggerPreset(language: string): string {
  return TRIGGER_PRESETS[language] ?? TRIGGER_PRESETS.auto
}

export function ImportVideoDialog({ api, open, onClose }: Props) {
  const { t, resolvedLocale } = useI18n()
  const zh = resolvedLocale.startsWith('zh')
  const recent = useApp(s => s.recentBuilds)
  const pushRecent = useApp(s => s.pushRecentBuild)
  const goDraft = useApp(s => s.goDraft)
  const [inputPath, setInputPath] = useState('')
  const [audioPath, setAudioPath] = useState('')
  const [audioOffsetSec, setAudioOffsetSec] = useState('0')
  const [build, setBuild] = useState('')
  const [platform, setPlatform] = useState('')
  const [project, setProject] = useState('')
  const [note, setNote] = useState('')
  const [tester, setTester] = useState('')
  const [commonSession, setCommonSession] = useState<CommonSessionSettings>({
    platforms: ['ios', 'android', 'windows', 'macOS', 'linux'],
    projects: [],
    testers: [],
    lastPlatform: '',
    lastProject: '',
    lastTester: '',
  })
  const [analyzeAudio, setAnalyzeAudio] = useState(true)
  const [audioSettings, setAudioSettings] = useState<AudioAnalysisSettings | null>(null)
  const [audioLanguage, setAudioLanguage] = useState('auto')
  const [triggerKeywords, setTriggerKeywords] = useState(sharedTriggerPreset('auto').words)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [analysisSession, setAnalysisSession] = useState<Session | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState<AudioAnalysisProgress | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    api.settings.get().then(settings => {
      if (cancelled) return
      const next = settings.audioAnalysis
      setAudioSettings(next)
      setAudioLanguage(next.language || 'auto')
      setTriggerKeywords(next.triggerKeywords?.trim() || sharedTriggerPreset(next.language || 'auto').words)
      if (settings.commonSession) {
        setCommonSession(settings.commonSession)
        setPlatform(settings.commonSession.lastPlatform)
        setProject(settings.commonSession.lastProject)
        setTester(settings.commonSession.lastTester)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [api, open])

  useEffect(() => api.onAudioAnalysisProgress((progress) => {
    if (!analysisSession || progress.sessionId !== analysisSession.id) return
    setAnalysisProgress(progress)
    if (progress.phase === 'error') setAnalysisError(progress.detail ?? progress.message)
    if (progress.phase === 'complete') {
      sessionStorage.removeItem(`${BACKGROUND_ANALYSIS_KEY_PREFIX}${analysisSession.id}`)
      setAnalysisSession(null)
      onClose()
      goDraft(analysisSession.id)
    }
  }), [api, analysisSession, goDraft, onClose])

  if (!open) return null

  async function chooseVideo() {
    const picked = await api.session.chooseVideoFile()
    if (picked) setInputPath(picked)
  }

  async function chooseAudio() {
    const picked = await api.session.chooseAudioFile()
    if (picked) setAudioPath(picked)
  }

  function continueAnalysisInBackground() {
    if (!analysisSession) return
    sessionStorage.setItem(`${BACKGROUND_ANALYSIS_KEY_PREFIX}${analysisSession.id}`, '1')
    const sessionId = analysisSession.id
    setAnalysisSession(null)
    onClose()
    goDraft(sessionId)
  }

  async function cancelAnalysis() {
    if (!analysisSession) return
    const sessionId = analysisSession.id
    await api.audioAnalysis.cancel(sessionId).catch(() => {})
    sessionStorage.removeItem(`${BACKGROUND_ANALYSIS_KEY_PREFIX}${sessionId}`)
    setAnalysisSession(null)
    onClose()
    goDraft(sessionId)
  }

  async function startImport() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (!inputPath.trim()) throw new Error(zh ? '請先選擇影片檔案。' : t('importVideo.pickRequired'))
      if (analyzeAudio) {
        const current = audioSettings ?? (await api.settings.get()).audioAnalysis
        const saved = await api.settings.setAudioAnalysis({
          ...current,
          language: audioLanguage,
          triggerKeywords: triggerKeywords.trim() || sharedTriggerPreset(audioLanguage).words,
        })
        setAudioSettings(saved.audioAnalysis)
      }
      const session = await api.session.importVideo({
        inputPath,
        audioPath: audioPath.trim() || undefined,
        audioStartOffsetMs: Math.round((Number(audioOffsetSec) || 0) * 1000),
        buildVersion: build.trim(),
        platform: platform.trim(),
        project: project.trim(),
        testNote: note.trim(),
        tester: tester.trim(),
        analyzeAudio,
      })
      await saveCommonSessionLast().catch(() => {})
      pushRecent(build.trim())
      if (!analyzeAudio) {
        onClose()
        goDraft(session.id)
        return
      }
      setAnalysisSession(session)
      setAnalysisError(null)
      setAnalysisProgress({
        sessionId: session.id,
        phase: 'prepare',
        message: zh ? '準備影片語音分析' : 'Preparing video audio analysis',
        detail: zh ? '正在準備影片音軌。' : 'Preparing the imported video audio.',
        current: 0,
        total: 4,
        generated: 0,
      })
      void api.audioAnalysis.analyzeSession(session.id).catch(err => {
        setAnalysisError(err instanceof Error ? err.message : String(err))
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveCommonSessionLast() {
    const next = {
      ...commonSession,
      lastPlatform: platform.trim(),
      lastProject: project.trim(),
      lastTester: tester.trim(),
    }
    const saved = await api.settings.setCommonSession(next)
    setCommonSession(saved.commonSession ?? next)
  }

  async function addCommonValue(kind: 'platforms' | 'projects' | 'testers', value: string) {
    const text = value.trim()
    if (!text) return
    const next = {
      ...commonSession,
      [kind]: Array.from(new Set([...(commonSession[kind] ?? []), text])),
    }
    const saved = await api.settings.setCommonSession(next)
    setCommonSession(saved.commonSession ?? next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      {analysisSession && (
        <AudioAnalysisWaitDialog
          progress={analysisProgress}
          error={analysisError}
          sourceLabel={audioPath.trim() ? 'microphone' : 'video'}
          mediaDurationMs={analysisSession.durationMs}
          onCancel={cancelAnalysis}
          onBackground={continueAnalysisInBackground}
        />
      )}
      {!analysisSession && (
        <div className="w-full max-w-3xl rounded-lg border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">{zh ? '分析已有影片' : t('importVideo.title')}</h2>
              <p className="mt-1 text-sm text-zinc-500">{zh ? '匯入已錄好的影片，填寫測試資訊後直接進入 review。' : t('importVideo.body')}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-700"
            >
              {t('common.close')}
            </button>
          </div>

          <div className="space-y-4">
            <label className="block text-xs font-medium text-zinc-300">
              {zh ? '影片檔案' : t('importVideo.videoFile')}
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  value={inputPath}
                  onChange={e => setInputPath(e.target.value)}
                  placeholder="C:\\path\\recording.mp4"
                  className="w-full rounded bg-zinc-900 px-3 py-2 text-sm font-normal text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                />
                <button type="button" onClick={chooseVideo} className="rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700">
                  {t('common.browse')}
                </button>
              </div>
            </label>

            <label className="block text-xs font-medium text-zinc-300">
              {zh ? '紀錄音軌（選填）' : 'Narration audio (optional)'}
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                <input
                  value={audioPath}
                  onChange={e => setAudioPath(e.target.value)}
                  placeholder={zh ? '沒有選擇時，語音分析會使用影片音軌' : 'When empty, audio analysis uses the video audio'}
                  className="w-full rounded bg-zinc-900 px-3 py-2 text-sm font-normal text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                />
                {audioPath && (
                  <button type="button" onClick={() => setAudioPath('')} className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700">
                    {zh ? '清除' : 'Clear'}
                  </button>
                )}
                <button type="button" onClick={chooseAudio} className="rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700">
                  {t('common.browse')}
                </button>
              </div>
              <span className="mt-1 block text-[11px] font-normal leading-5 text-zinc-500">
                {zh ? '如果有單獨錄 QA 語音，請放在這裡；review 會像錄製 session 一樣播放這條 MIC 軌，並可微調 offset。' : 'Use this for separately recorded QA narration. Review will play it as the MIC track and let you adjust offset.'}
              </span>
            </label>

            {audioPath.trim() && (
              <label className="block text-xs font-medium text-zinc-300">
                {zh ? '紀錄音軌 offset（秒）' : 'Narration audio offset (seconds)'}
                <input
                  type="number"
                  step="0.1"
                  value={audioOffsetSec}
                  onChange={e => setAudioOffsetSec(e.target.value)}
                  className="mt-1 w-40 rounded bg-zinc-900 px-3 py-2 text-sm font-normal text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                />
                <span className="ml-3 text-[11px] font-normal text-zinc-500">
                  {zh ? '正值代表音軌較晚開始，負值代表音軌較早開始。' : 'Positive starts later; negative starts earlier.'}
                </span>
              </label>
            )}

            <label className="flex items-start gap-3 rounded border border-sky-900/60 bg-sky-950/20 p-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={analyzeAudio}
                onChange={e => setAnalyzeAudio(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
              />
              <span>
                <span className="block font-medium">{zh ? (audioPath.trim() ? '使用紀錄音軌自動打點' : '使用影片聲音自動打點') : t('importVideo.analyzeAudio')}</span>
                <span className="mt-1 block text-xs leading-5 text-zinc-400">{zh ? (audioPath.trim() ? 'Loupe 會分析這條外部紀錄音軌，並依照 offset 建立可編輯點位。' : 'Loupe 會在本機抽出影片音軌，進行語音分析並建立可編輯點位。') : t('importVideo.analyzeAudioHelp')}</span>
              </span>
            </label>

            {analyzeAudio && (
              <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <label className="text-xs text-zinc-400">
                    {t('new.speechLanguage')}
                    <select
                      value={audioLanguage}
                      onChange={e => {
                        setAudioLanguage(e.target.value)
                        setTriggerKeywords(sharedTriggerPreset(e.target.value).words)
                      }}
                      className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                    >
                      {SHARED_AUDIO_LANGUAGE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-400">
                    {t('new.triggerWords')}
                    <input
                      value={triggerKeywords}
                      onChange={e => setTriggerKeywords(e.target.value)}
                      className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1.1fr)]">
              <label className="text-xs font-semibold text-zinc-200">
                Platform
                <div className="mt-1 flex gap-2">
                  <input
                    value={platform}
                    onChange={e => setPlatform(e.target.value)}
                    list="common-platforms-import"
                    placeholder="android"
                    className="min-w-0 flex-1 rounded bg-zinc-900 px-3 py-2 text-sm font-normal text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  {platform.trim() && !commonSession.platforms.includes(platform.trim()) && (
                    <button type="button" onClick={() => { void addCommonValue('platforms', platform) }} className="rounded bg-zinc-800 px-2 py-2 text-xs text-zinc-200 hover:bg-zinc-700">Add</button>
                  )}
                </div>
                <datalist id="common-platforms-import">{commonSession.platforms.map(item => <option key={item} value={item} />)}</datalist>
              </label>

              <label className="text-xs font-semibold text-zinc-200">
                Project
                <div className="mt-1 flex gap-2">
                  <input
                    value={project}
                    onChange={e => setProject(e.target.value)}
                    list="common-projects-import"
                    placeholder="Project name"
                    className="min-w-0 flex-1 rounded bg-zinc-900 px-3 py-2 text-sm font-normal text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  {project.trim() && !commonSession.projects.includes(project.trim()) && (
                    <button type="button" onClick={() => { void addCommonValue('projects', project) }} className="rounded bg-zinc-800 px-2 py-2 text-xs text-zinc-200 hover:bg-zinc-700">Add</button>
                  )}
                </div>
                <datalist id="common-projects-import">{commonSession.projects.map(item => <option key={item} value={item} />)}</datalist>
              </label>

              <label className="text-xs font-semibold text-zinc-200">
                {t('new.buildVersion')}
                <input
                  value={build}
                  onChange={e => setBuild(e.target.value)}
                  list="recent-builds-import"
                  placeholder="1.4.2-RC3"
                  className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm font-normal text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
              <datalist id="recent-builds-import">{recent.map(b => <option key={b} value={b} />)}</datalist>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-zinc-400">
                  {t('new.tester')}
                  <div className="mt-1 flex gap-2">
                    <input
                      value={tester}
                      onChange={e => setTester(e.target.value)}
                      list="common-testers-import"
                      placeholder={t('new.testerPlaceholder')}
                      className="min-w-0 flex-1 rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    {tester.trim() && !commonSession.testers.includes(tester.trim()) && (
                      <button type="button" onClick={() => { void addCommonValue('testers', tester) }} className="rounded bg-zinc-800 px-2 py-2 text-xs text-zinc-200 hover:bg-zinc-700">Add</button>
                    )}
                  </div>
                  <datalist id="common-testers-import">{commonSession.testers.map(item => <option key={item} value={item} />)}</datalist>
                </label>
                <label className="text-xs text-zinc-400">
                  {t('new.testNote')}
                  <input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder={t('new.testNotePlaceholder')}
                    className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </label>
              </div>
            </div>

            {error && <div className="rounded border border-red-900/70 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={startImport}
                disabled={busy}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {busy ? (zh ? '匯入中...' : t('importVideo.importing')) : (zh ? '開始 review' : t('importVideo.start'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
