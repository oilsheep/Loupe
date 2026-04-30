import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/lib/store'
import type { DesktopApi } from '@shared/types'
import { useI18n } from '@/lib/i18n'

interface Props {
  api: DesktopApi
  deviceId: string
  connectionMode: 'usb' | 'wifi' | 'pc'
  sourceName?: string
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRecordPcScreen(connectionMode === 'pc')
  }, [connectionMode, deviceId])

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

  return (
    <div className="space-y-4">
      <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t('new.selectedDevice')}</div>
            <div className="truncate text-sm font-medium text-zinc-100">{connectionMode === 'pc' ? sourceName || deviceId : deviceId}</div>
          </div>
          <span className="shrink-0 rounded bg-emerald-950 px-2 py-1 text-xs text-emerald-200">{connectionMode.toUpperCase()}</span>
        </div>
        <div className={`rounded border p-3 text-sm ${connectionMode === 'pc' ? 'border-blue-900/70 bg-blue-950/30 text-blue-100' : 'border-zinc-800 bg-zinc-900/60 text-zinc-300'}`}>
          {connectionMode === 'pc'
            ? t('new.pcStartHelp')
            : t('new.androidStartHelp')}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-zinc-200">{t('new.buildVersion')}</label>
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
        <label className="text-xs text-zinc-400">{t('new.testNote')}</label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('new.testNotePlaceholder')}
          data-testid="test-note"
          className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
      </div>

      <div>
        <label className="text-xs text-zinc-400">{t('new.tester')}</label>
        <input
          value={tester}
          onChange={e => setTester(e.target.value)}
          placeholder={t('new.testerPlaceholder')}
          data-testid="tester"
          className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
      </div>

      {connectionMode !== 'pc' && (
        <div className="space-y-3">
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
        </div>
      )}

      {connectionMode !== 'pc' && (
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
      )}

      {error && <div className="rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>}

      <button
        onClick={start}
        disabled={busy || !deviceId}
        data-testid="start-session"
        className="w-full rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {busy ? t('new.starting') : t('new.start')}
      </button>
    </div>
  )
}
