import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { useI18n } from '@/lib/i18n'
import type { ToolCheck, ToolInstallLog } from '@shared/types'

interface ToolInstallProgress {
  percent: number
  message: string
  detail: string
}

const TOOL_DESCRIPTIONS: Record<ToolCheck['name'], string> = {
  adb: 'toolStatus.tool.adb',
  scrcpy: 'toolStatus.tool.scrcpy',
  uxplay: 'toolStatus.tool.uxplay',
  'go-ios': 'toolStatus.tool.goIos',
  'faster-whisper': 'toolStatus.tool.fasterWhisper',
}

export function ToolStatus() {
  const { t } = useI18n()
  const goHome = useApp(s => s.goHome)
  const [checks, setChecks] = useState<ToolCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [installingTools, setInstallingTools] = useState(false)
  const [toolInstallMessage, setToolInstallMessage] = useState<string | null>(null)
  const [toolInstallProgress, setToolInstallProgress] = useState<ToolInstallProgress | null>(null)
  const [toolInstallConsole, setToolInstallConsole] = useState('')
  const toolInstallConsoleRef = useRef<HTMLPreElement | null>(null)

  const missing = useMemo(() => checks.filter(check => !check.ok), [checks])
  const okCount = checks.length - missing.length

  useEffect(() => {
    void refreshChecks()
  }, [])

  useEffect(() => api.onToolInstallLog((log: ToolInstallLog) => {
    setToolInstallConsole(prev => `${prev}${log.text}`.slice(-40_000))
  }), [])

  useEffect(() => {
    const el = toolInstallConsoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [toolInstallConsole])

  async function refreshChecks() {
    setLoading(true)
    try {
      setChecks(await api.doctor())
    } finally {
      setLoading(false)
    }
  }

  async function installMissingTools() {
    if (installingTools || missing.length === 0) return
    const names = missing.map(check => check.name)
    const ok = window.confirm(`${t('toolStatus.installConfirm')}\n\n${names.join(', ')}`)
    if (!ok) return
    setInstallingTools(true)
    setToolInstallMessage(null)
    setToolInstallConsole('')
    setToolInstallProgress({
      percent: 10,
      message: t('home.installProgressPreparing'),
      detail: names.join(', '),
    })
    try {
      setToolInstallProgress({
        percent: 70,
        message: t('home.installProgressInstalling'),
        detail: t('home.installProgressToolCount', { count: names.length }),
      })
      const result = await api.app.installTools(names)
      setToolInstallMessage(`${result.message}${result.detail ? `\n\n${result.detail}` : ''}`)
      setToolInstallProgress({
        percent: 90,
        message: t('home.installProgressChecking'),
        detail: t('home.installProgressRechecking'),
      })
      await refreshChecks()
      setToolInstallProgress({
        percent: 100,
        message: result.ok ? t('home.installProgressDone') : t('home.installProgressNeedsAttention'),
        detail: result.message,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setToolInstallMessage(message)
      setToolInstallProgress({
        percent: 100,
        message: t('home.installProgressFailed'),
        detail: message,
      })
    } finally {
      setInstallingTools(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={goHome}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              {t('toolStatus.backHome')}
            </button>
            <h1 className="mt-2 text-xl font-semibold">{t('toolStatus.title')}</h1>
            <p className="mt-1 text-sm text-zinc-500">{t('toolStatus.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void refreshChecks() }}
              disabled={loading || installingTools}
              className="rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? t('toolStatus.checking') : t('toolStatus.recheck')}
            </button>
            <button
              type="button"
              onClick={() => { void installMissingTools() }}
              disabled={installingTools || missing.length === 0}
              className="rounded bg-blue-700 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {installingTools ? t('home.installingTools') : t('toolStatus.installMissing')}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t('toolStatus.total')}</div>
            <div className="mt-2 text-2xl font-semibold">{checks.length}</div>
          </div>
          <div className="border border-emerald-900/70 bg-emerald-950/20 p-4">
            <div className="text-xs uppercase tracking-wide text-emerald-400/80">{t('toolStatus.available')}</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-200">{okCount}</div>
          </div>
          <div className="border border-yellow-900/70 bg-yellow-950/20 p-4">
            <div className="text-xs uppercase tracking-wide text-yellow-300/80">{t('toolStatus.needsAttention')}</div>
            <div className="mt-2 text-2xl font-semibold text-yellow-200">{missing.length}</div>
          </div>
        </section>

        <section className="border border-zinc-800 bg-zinc-900/30">
          <div className="grid grid-cols-[1fr_auto] border-b border-zinc-800 px-4 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <div>{t('toolStatus.dependency')}</div>
            <div>{t('toolStatus.status')}</div>
          </div>
          {checks.length === 0 && (
            <div className="px-4 py-8 text-sm text-zinc-500">
              {loading ? t('toolStatus.checking') : t('toolStatus.noTools')}
            </div>
          )}
          {checks.map(check => (
            <div key={check.name} className="grid grid-cols-[1fr_auto] gap-4 border-b border-zinc-800/70 px-4 py-4 last:border-b-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-zinc-950 px-2 py-1 text-sm text-zinc-100">{check.name}</code>
                  <span className="text-xs text-zinc-500">{t(TOOL_DESCRIPTIONS[check.name])}</span>
                </div>
                {check.ok ? (
                  <div className="mt-2 break-words font-mono text-xs text-zinc-400">
                    {check.version || t('toolStatus.versionUnknown')}
                  </div>
                ) : (
                  <div className="mt-2 break-words text-xs leading-5 text-yellow-200">
                    {check.error || t('toolStatus.unavailable')}
                  </div>
                )}
              </div>
              <div className="self-start">
                <span className={`rounded px-2 py-1 text-xs font-medium ${check.ok ? 'bg-emerald-950 text-emerald-200' : 'bg-yellow-950 text-yellow-200'}`}>
                  {check.ok ? t('toolStatus.ok') : t('toolStatus.missing')}
                </span>
              </div>
            </div>
          ))}
        </section>

        {toolInstallProgress && (
          <section className="border border-blue-900/60 bg-blue-950/20 p-4">
            <div className="flex items-center justify-between gap-3 text-sm text-blue-100">
              <span>{toolInstallProgress.message}</span>
              <span className="font-mono tabular-nums">{toolInstallProgress.percent}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-blue-950">
              <div
                className="h-full rounded bg-blue-400 transition-[width] duration-300"
                style={{ width: `${toolInstallProgress.percent}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={toolInstallProgress.percent}
              />
            </div>
            {toolInstallProgress.detail && (
              <div className="mt-2 break-words text-xs leading-5 text-blue-200/80">{toolInstallProgress.detail}</div>
            )}
          </section>
        )}

        {(installingTools || toolInstallConsole) && (
          <pre
            ref={toolInstallConsoleRef}
            className="h-32 overflow-y-auto whitespace-pre-wrap border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-4 text-zinc-200"
          >
            {toolInstallConsole || t('home.installConsoleWaiting')}
          </pre>
        )}

        {toolInstallMessage && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-5 text-zinc-300">
            {toolInstallMessage}
          </pre>
        )}
      </main>
    </div>
  )
}
