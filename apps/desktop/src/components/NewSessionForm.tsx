import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import type { DesktopApi } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import type { RecordingConnectionMode } from '@/lib/recordingSource'

interface Props {
  api: DesktopApi
  deviceId: string
  connectionMode: RecordingConnectionMode
  sourceName?: string
}

export function NewSessionForm({ api, deviceId, connectionMode, sourceName }: Props) {
  const { t } = useI18n()
  const backendConnectionMode = connectionMode === 'ios' ? 'pc' : connectionMode
  const isPcLikeSource = connectionMode === 'pc' || connectionMode === 'ios'
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
  const [recordPcScreen, setRecordPcScreen] = useState(isPcLikeSource)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRecordPcScreen(isPcLikeSource)
  }, [connectionMode, deviceId])

  useEffect(() => {
    let cancelled = false
    setLogcatPackageOptions([])
    if (isPcLikeSource) return
    api.device.listPackages(deviceId)
      .then(packages => {
        if (!cancelled) setLogcatPackageOptions(packages)
      })
      .catch(() => {
        if (!cancelled) setLogcatPackageOptions([])
      })
    return () => { cancelled = true }
  }, [api, isPcLikeSource, deviceId])

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
      const session = await api.session.start({
        deviceId,
        connectionMode: backendConnectionMode,
        buildVersion: build.trim(),
        testNote: note.trim(),
        tester: tester.trim(),
        recordPcScreen,
        pcCaptureSourceName: sourceName,
        iosLogCapture: connectionMode === 'ios',
        logcatPackageName: isPcLikeSource ? undefined : logcatPackageName.trim(),
        logcatTagFilter: isPcLikeSource ? undefined : logcatTagFilter.trim(),
        logcatMinPriority: isPcLikeSource ? undefined : logcatMinPriority,
        logcatLineCount: isPcLikeSource ? undefined : logcatLineCount,
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
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void start() }}>
      <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t('new.selectedDevice')}</div>
            <div className="truncate text-base font-medium text-zinc-100">{isPcLikeSource ? sourceName || deviceId : deviceId}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded bg-emerald-950 px-2 py-0.5 text-[11px] text-emerald-200">{connectionMode.toUpperCase()}</span>
              <span className="truncate text-xs text-zinc-500">
                {connectionMode === 'ios' ? t('new.iosStartHelp') : connectionMode === 'pc' ? t('new.pcStartHelp') : t('new.androidStartHelp')}
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

      {!isPcLikeSource && (
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
