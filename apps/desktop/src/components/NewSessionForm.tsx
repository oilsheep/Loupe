import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import type { AudioAnalysisSettings, DesktopApi } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import type { RecordingConnectionMode } from '@/lib/recordingSource'

interface Props {
  api: DesktopApi
  deviceId: string
  connectionMode: RecordingConnectionMode
  sourceName?: string
}

const AUDIO_ANALYSIS_LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'System / Auto' },
  { value: 'zh', label: 'Chinese' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
]

const TRIGGER_PRESETS: Record<string, { words: string; hint: string }> = {
  auto: {
    words: '記錄, 紀錄, 记录, 標記, record, mark, log, 記録, マーク, ログ, 기록, 마크, 로그, grabar, marcar, registrar',
    hint: 'Say “trigger + label”, for example “record Bug”, “記錄 美術”, “記録 Bug”, or “기록 Bug”.',
  },
  zh: {
    words: '記錄, 紀錄, 记录, 標記',
    hint: '語音格式：說「觸發詞 + 標籤名稱」，例如「記錄 Bug」、「記錄 美術」。觸發詞和標籤請靠近，後面再描述問題。',
  },
  en: {
    words: 'record, mark, log',
    hint: 'Say “trigger + label”, for example “record Bug” or “record Critical”. Keep the label close to the trigger, then describe the issue.',
  },
  ja: {
    words: '記録, マーク, ログ',
    hint: '「記録 Bug」のように、トリガー語 + ラベル名を続けて話してください。',
  },
  ko: {
    words: '기록, 마크, 로그',
    hint: '“기록 Bug”처럼 트리거 단어 + 라벨명을 이어서 말하세요.',
  },
  es: {
    words: 'grabar, marcar, registrar',
    hint: 'Di “disparador + etiqueta”, por ejemplo “grabar Bug” o “marcar Critical”.',
  },
}

function triggerPreset(language: string): { words: string; hint: string } {
  return TRIGGER_PRESETS[language] ?? TRIGGER_PRESETS.auto
}

function normalizeTriggerWords(value: string): string {
  return value.split(/[,\n，、;；]/u).map(item => item.trim()).filter(Boolean).join(', ').toLowerCase()
}

function isPresetTriggerWords(value: string): boolean {
  const normalized = normalizeTriggerWords(value)
  return Object.values(TRIGGER_PRESETS).some(preset => normalizeTriggerWords(preset.words) === normalized)
}

export function NewSessionForm({ api, deviceId, connectionMode, sourceName }: Props) {
  const { t } = useI18n()
  const recent = useApp(s => s.recentBuilds)
  const pushRecent = useApp(s => s.pushRecentBuild)
  const goRecording = useApp(s => s.goRecording)

  const [build, setBuild] = useState(recent[0] ?? '')
  const [note, setNote] = useState('')
  const [tester, setTester] = useState('')
  const [logcatPackageName, setLogcatPackageName] = useState('')
  const [logcatPackageOptions, setLogcatPackageOptions] = useState<string[]>([])
  const [logcatPackageMenuOpen, setLogcatPackageMenuOpen] = useState(false)
  const [logcatTagFilter, setLogcatTagFilter] = useState('Unity')
  const [logcatMinPriority, setLogcatMinPriority] = useState('V')
  const [logcatLineCount, setLogcatLineCount] = useState(50)
  const [recordPcScreen, setRecordPcScreen] = useState(connectionMode === 'pc')
  const [recordMic, setRecordMic] = useState(true)
  const [audioSettings, setAudioSettings] = useState<AudioAnalysisSettings | null>(null)
  const [audioLanguage, setAudioLanguage] = useState('auto')
  const [triggerKeywords, setTriggerKeywords] = useState(triggerPreset('auto').words)
  const [triggerWordsCustomized, setTriggerWordsCustomized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRecordPcScreen(connectionMode === 'pc')
  }, [connectionMode, deviceId])

  useEffect(() => {
    let cancelled = false
    api.settings.get().then(settings => {
      if (cancelled) return
      const next = settings.audioAnalysis
      const language = next.language || 'auto'
      const keywords = next.triggerKeywords?.trim() || triggerPreset(language).words
      setAudioSettings(next)
      setAudioLanguage(language)
      setTriggerKeywords(keywords)
      setTriggerWordsCustomized(!isPresetTriggerWords(keywords))
    }).catch(() => {
      if (cancelled) return
      setAudioLanguage('auto')
      setTriggerKeywords(triggerPreset('auto').words)
      setTriggerWordsCustomized(false)
    })
    return () => { cancelled = true }
  }, [api])

  useEffect(() => {
    let cancelled = false
    setLogcatPackageOptions([])
    if (connectionMode === 'pc') return
    api.device.listPackages(deviceId)
      .then(packages => {
        if (!cancelled) setLogcatPackageOptions(packages)
      })
      .catch(() => {
        if (!cancelled) setLogcatPackageOptions([])
      })
    return () => { cancelled = true }
  }, [api, connectionMode, deviceId])

  const visibleLogcatPackageOptions = useMemo(() => {
    const query = logcatPackageName.trim().toLowerCase()
    const filtered = query
      ? logcatPackageOptions.filter(name => name.toLowerCase().includes(query))
      : logcatPackageOptions
    return filtered.slice(0, 80)
  }, [logcatPackageName, logcatPackageOptions])

  async function start() {
    if (busy || !deviceId) return
    setBusy(true)
    setError(null)
    try {
      if (recordMic) {
        const current = audioSettings ?? (await api.settings.get()).audioAnalysis
        const saved = await api.settings.setAudioAnalysis({
          ...current,
          language: audioLanguage,
          triggerKeywords: triggerKeywords.trim() || triggerPreset(audioLanguage).words,
        })
        setAudioSettings(saved.audioAnalysis)
      }
      const session = await api.session.start({
        deviceId,
        connectionMode,
        buildVersion: build.trim(),
        testNote: note.trim(),
        tester: tester.trim(),
        recordPcScreen,
        recordMic,
        pcCaptureSourceName: sourceName,
        logcatPackageName: connectionMode === 'pc' ? undefined : logcatPackageName.trim(),
        logcatTagFilter: connectionMode === 'pc' ? undefined : logcatTagFilter.trim(),
        logcatMinPriority: connectionMode === 'pc' ? undefined : logcatMinPriority,
        logcatLineCount: connectionMode === 'pc' ? undefined : logcatLineCount,
      })
      pushRecent(build.trim())
      goRecording(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function changeAudioLanguage(language: string) {
    const wasPreset = !triggerWordsCustomized && isPresetTriggerWords(triggerKeywords)
    setAudioLanguage(language)
    if (wasPreset) {
      setTriggerKeywords(triggerPreset(language).words)
      setTriggerWordsCustomized(false)
    }
  }

  function useSuggestedTriggers() {
    setTriggerKeywords(triggerPreset(audioLanguage).words)
    setTriggerWordsCustomized(false)
  }

  const suggestedTriggerWords = triggerPreset(audioLanguage).words
  const triggerMatchesSuggestion = normalizeTriggerWords(triggerKeywords) === normalizeTriggerWords(suggestedTriggerWords)

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void start() }}>
      <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t('new.selectedDevice')}</div>
            <div className="truncate text-base font-medium text-zinc-100">{connectionMode === 'pc' ? sourceName || deviceId : deviceId}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded bg-emerald-950 px-2 py-0.5 text-[11px] text-emerald-200">{connectionMode.toUpperCase()}</span>
              <span className="truncate text-xs text-zinc-500">
                {connectionMode === 'pc' ? t('new.pcStartHelp') : t('new.androidStartHelp')}
              </span>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy || !deviceId}
            data-testid="start-session"
            className="shrink-0 rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? t('new.starting') : t('new.start')}
          </button>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded border border-sky-900/60 bg-sky-950/20 p-3 text-sm text-zinc-200">
        <input
          type="checkbox"
          aria-label={t('new.micRecordingTitle')}
          checked={recordMic}
          onChange={e => setRecordMic(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
        />
        <span className="min-w-0">
          <span className="block font-medium">{t('new.micRecordingTitle')}</span>
          <span className="mt-1 block text-xs leading-5 text-zinc-400">{t('new.micRecordingHelp')}</span>
          <span className="mt-1 block text-xs leading-5 text-zinc-500">{t('new.voiceCommandHelp')}</span>
        </span>
      </label>

      {recordMic && (
        <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <label className="text-xs text-zinc-400">
              {t('new.speechLanguage')}
              <select
                aria-label="Speech language"
                value={audioLanguage}
                onChange={e => changeAudioLanguage(e.target.value)}
                className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
              >
                {AUDIO_ANALYSIS_LANGUAGE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              {t('new.triggerWords')}
              <input
                aria-label="Trigger words"
                value={triggerKeywords}
                onChange={e => {
                  setTriggerKeywords(e.target.value)
                  setTriggerWordsCustomized(true)
                }}
                placeholder={suggestedTriggerWords}
                className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs leading-5 text-zinc-500">
            <span className="text-zinc-400">{triggerPreset(audioLanguage).hint}</span>
            {!triggerMatchesSuggestion && (
              <button
                type="button"
                onClick={useSuggestedTriggers}
                className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-700"
              >
                {t('new.useSuggestedTriggers')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1.1fr)]">
        <label className="text-xs font-semibold text-zinc-200">
          {t('new.buildVersion')}
          <input
            value={build}
            onChange={e => setBuild(e.target.value)}
            list="recent-builds"
            placeholder="1.4.2-RC3"
            data-testid="build-version"
            className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm font-normal text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
          />
        </label>
        <datalist id="recent-builds">{recent.map(b => <option key={b} value={b} />)}</datalist>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">
            {t('new.tester')}
            <input
              value={tester}
              onChange={e => setTester(e.target.value)}
              placeholder={t('new.testerPlaceholder')}
              data-testid="tester"
              className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
          <label className="text-xs text-zinc-400">
            {t('new.testNote')}
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('new.testNotePlaceholder')}
              data-testid="test-note"
              className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
        </div>
      </div>

      {connectionMode !== 'pc' && (
        <details className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
          <summary className="cursor-pointer select-none text-xs font-medium text-zinc-300">{t('new.advancedAndroid')}</summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs text-zinc-400">{t('new.logcatPackage')}</label>
              <div className="relative mt-1">
                <input
                  value={logcatPackageName}
                  onChange={e => {
                    setLogcatPackageName(e.target.value)
                    setLogcatPackageMenuOpen(true)
                  }}
                  onFocus={() => setLogcatPackageMenuOpen(true)}
                  onBlur={() => window.setTimeout(() => setLogcatPackageMenuOpen(false), 100)}
                  placeholder={t('new.logcatPackagePlaceholder')}
                  data-testid="logcat-package"
                  className="w-full rounded bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                />
                {logcatPackageMenuOpen && visibleLogcatPackageOptions.length > 0 && (
                  <div
                    className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded border border-zinc-700 bg-zinc-950 py-1 shadow-xl"
                    data-testid="logcat-package-options"
                  >
                    {visibleLogcatPackageOptions.map(name => (
                      <button
                        key={name}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setLogcatPackageName(name)
                          setLogcatPackageMenuOpen(false)
                        }}
                        className="block w-full truncate px-3 py-1.5 text-left font-mono text-xs text-zinc-200 hover:bg-zinc-800"
                        data-testid={`logcat-package-option-${name}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{t('new.logcatPackageHelp')}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-zinc-400">{t('new.logcatTag')}</label>
                <input
                  value={logcatTagFilter}
                  onChange={e => setLogcatTagFilter(e.target.value)}
                  data-testid="logcat-tag"
                  className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">{t('new.logcatLevel')}</label>
                <select
                  value={logcatMinPriority}
                  onChange={e => setLogcatMinPriority(e.target.value)}
                  data-testid="logcat-level"
                  className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
                >
                  {['V', 'D', 'I', 'W', 'E', 'F'].map(level => (
                    <option key={level} value={level}>{t('new.logcatLevelOption', { level })}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-400">{t('new.logcatLines')}</label>
              <select
                value={logcatLineCount}
                onChange={e => setLogcatLineCount(Number(e.target.value))}
                data-testid="logcat-lines"
                className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
              >
                {[10, 25, 50, 100, 200].map(count => (
                  <option key={count} value={count}>{t('new.logcatLinesOption', { count })}</option>
                ))}
              </select>
            </div>
          </div>
        </details>
      )}

      {error && <div className="rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>}
    </form>
  )
}
