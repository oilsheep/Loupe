import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import { PreferencesController } from '@/components/PreferencesController'
import { RecentSessions } from '@/components/RecentSessions'
import type { ToolCheck, ToolInstallLog } from '@shared/types'
import { useApp } from '@/lib/store'
import { useI18n } from '@/lib/i18n'
import type { RecordingSourceSelection } from '@/lib/recordingSource'

interface ToolInstallProgress {
  percent: number
  message: string
  detail: string
}

export function Home() {
  const { t } = useI18n()
  const goDraft = useApp(s => s.goDraft)
  const [selected, setSelected] = useState<RecordingSourceSelection | null>(null)
  const [checks, setChecks] = useState<ToolCheck[]>([])
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [installingTools, setInstallingTools] = useState(false)
  const [toolInstallMessage, setToolInstallMessage] = useState<string | null>(null)
  const [toolInstallProgress, setToolInstallProgress] = useState<ToolInstallProgress | null>(null)
  const [toolInstallConsole, setToolInstallConsole] = useState('')
  const toolInstallConsoleRef = useRef<HTMLPreElement | null>(null)

  useEffect(() => { api.doctor().then(setChecks) }, [])
  useEffect(() => api.onToolInstallLog((log: ToolInstallLog) => {
    setToolInstallConsole(prev => `${prev}${log.text}`.slice(-40_000))
  }), [])
  useEffect(() => {
    const el = toolInstallConsoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [toolInstallConsole])

  const missing = checks.filter(c => !c.ok)

  async function refreshChecks() {
    setChecks(await api.doctor())
  }

  async function installMissingTools() {
    if (installingTools || missing.length === 0) return
    const names = missing.map(check => check.name)
    const ok = window.confirm(`Install missing tools with Homebrew/pipx?\n\n${names.join(', ')}`)
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
    <div className="grid h-screen grid-cols-[340px_1fr] bg-zinc-950 text-zinc-100">
      <aside className="border-r border-zinc-800 p-4">
        <h1 className="mb-4 text-lg font-semibold">Loupe</h1>
        <DevicePicker
          api={api}
          selectedId={selected?.id ?? null}
          onSelect={(id, mode, label) => setSelected({ id, mode, label })}
        />
      </aside>
      <main className="overflow-auto p-5">
        <PreferencesController open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />

        {missing.length > 0 && (
          <div className="mb-6 rounded border border-yellow-700 bg-yellow-950/40 p-4 text-sm text-yellow-200">
            <div className="font-medium">{t('home.missingTools')}</div>
            <ul className="mt-1 list-disc pl-5">
              {missing.map(c => <li key={c.name}><code>{c.name}</code> - {c.error}</li>)}
            </ul>
            <p className="mt-2 text-xs text-yellow-300/80">
              {t('home.missingToolsHelp')}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { void installMissingTools() }}
                disabled={installingTools}
                className="rounded bg-yellow-600 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-yellow-500 disabled:opacity-50"
              >
                {installingTools ? t('home.installingTools') : t('home.installMissingTools')}
              </button>
              <button
                type="button"
                onClick={() => { void refreshChecks() }}
                disabled={installingTools}
                className="rounded bg-yellow-900/60 px-3 py-1.5 text-xs text-yellow-100 hover:bg-yellow-900 disabled:opacity-50"
              >
                {t('home.recheckTools')}
              </button>
            </div>
            {toolInstallProgress && (
              <div className="mt-3 rounded border border-yellow-800/70 bg-yellow-950/50 p-3">
                <div className="flex items-center justify-between gap-3 text-xs text-yellow-100">
                  <span>{toolInstallProgress.message}</span>
                  <span className="font-mono tabular-nums">{toolInstallProgress.percent}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded bg-yellow-950">
                  <div
                    className="h-full rounded bg-yellow-400 transition-[width] duration-300"
                    style={{ width: `${toolInstallProgress.percent}%` }}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={toolInstallProgress.percent}
                  />
                </div>
                {toolInstallProgress.detail && (
                  <div className="mt-2 break-words text-[11px] leading-4 text-yellow-200/80">
                    {toolInstallProgress.detail}
                  </div>
                )}
              </div>
            )}
            {(installingTools || toolInstallConsole) && (
              <pre
                ref={toolInstallConsoleRef}
                className="mt-3 h-20 overflow-y-auto whitespace-pre-wrap rounded border border-yellow-900/70 bg-zinc-950 p-2 font-mono text-[11px] leading-4 text-yellow-100"
              >
                {toolInstallConsole || t('home.installConsoleWaiting')}
              </pre>
            )}
            {toolInstallMessage && (
              <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-yellow-950/70 p-3 text-[11px] leading-5 text-yellow-100">
                {toolInstallMessage}
              </pre>
            )}
          </div>
        )}

        <section className="mb-4 border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-300">{t('home.newSession')}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreferencesOpen(true)}
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                {t('home.preferences')}
              </button>
            </div>
          </div>
          {selected
            ? <NewSessionForm api={api} deviceId={selected.id} connectionMode={selected.mode} sourceName={selected.label} />
            : (
              <div className="border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
                {t('home.selectPrompt')}
              </div>
            )
          }
        </section>

        <RecentSessions onOpenSession={goDraft} />

        {!selected && (
          <section className="mb-4 border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="max-w-2xl">
              <div className="text-xs uppercase tracking-wider text-zinc-500">{t('home.getStarted')}</div>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-100">{t('home.heroTitle')}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {t('home.heroBody')}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <div className="border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="text-lg font-semibold text-blue-300">1</div>
                <div className="mt-2 font-medium text-zinc-200">{t('home.step1Title')}</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">{t('home.step1Body')}</div>
              </div>
              <div className="border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="text-lg font-semibold text-blue-300">2</div>
                <div className="mt-2 font-medium text-zinc-200">{t('home.step2Title')}</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">{t('home.step2Body')}</div>
              </div>
              <div className="border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="text-lg font-semibold text-blue-300">3</div>
                <div className="mt-2 font-medium text-zinc-200">{t('home.step3Title')}</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">{t('home.step3Body')}</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div className="border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-xs uppercase tracking-wider text-zinc-500">{t('home.androidSetup')}</div>
                <h3 className="mt-2 font-medium text-zinc-100">{t('home.enableDeveloper')}</h3>
                <ol className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                  <li>{t('home.androidStep1')}</li>
                  <li>{t('home.androidStep2')}</li>
                  <li>{t('home.androidStep3')}</li>
                  <li>{t('home.androidStep4')}</li>
                </ol>
                <a
                  href="https://developer.android.com/studio/debug/dev-options"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs text-blue-300 hover:text-blue-200"
                >
                  {t('home.devGuide')}
                </a>
              </div>

              <div className="border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-xs uppercase tracking-wider text-zinc-500">{t('home.connectionChoices')}</div>
                <h3 className="mt-2 font-medium text-zinc-100">{t('home.usbWifi')}</h3>
                <div className="mt-3 space-y-3 text-xs leading-5 text-zinc-400">
                  <p>{t('home.usbBody')}</p>
                  <p>{t('home.wifiBody')}</p>
                </div>
                <a
                  href="https://developer.android.com/studio/run/device#wireless"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs text-blue-300 hover:text-blue-200"
                >
                  {t('home.wifiGuide')}
                </a>
              </div>
            </div>
          </section>
        )}

      </main>
    </div>
  )
}
