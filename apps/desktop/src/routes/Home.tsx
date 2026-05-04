import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import { PreferencesController } from '@/components/PreferencesController'
import { RecentSessions } from '@/components/RecentSessions'
import { HomeTopBar } from '@/components/HomeTopBar'
import { MissingToolsNotice } from '@/components/MissingToolsNotice'
import { ImportVideoDialog } from '@/components/ImportVideoDialog'
import { ToolStatus } from '@/routes/ToolStatus'
import type { ToolCheck } from '@shared/types'
import { useApp } from '@/lib/store'
import { useI18n } from '@/lib/i18n'
import type { RecordingSourceSelection } from '@/lib/recordingSource'

export function Home() {
  const { t, resolvedLocale } = useI18n()
  const goDraft = useApp(s => s.goDraft)
  const lastRecordingSource = useApp(s => s.lastRecordingSource)
  const setLastRecordingSource = useApp(s => s.setLastRecordingSource)
  const [selected, setSelected] = useState<RecordingSourceSelection | null>(lastRecordingSource)
  const [checks, setChecks] = useState<ToolCheck[]>([])
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [importVideoOpen, setImportVideoOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    void api.app.hidePcCaptureFrame().catch(() => {})
    void api.app.getVersion().then(setAppVersion).catch(() => setAppVersion(''))
    api.doctor().then(setChecks)
  }, [])

  const missing = checks.filter(c => !c.ok)
  const zh = resolvedLocale.startsWith('zh')
  const importTitle = zh ? '\u5206\u6790\u5df2\u6709\u5f71\u7247' : 'Analyze existing video'
  const importBody = zh
    ? '\u9078\u64c7\u5df2\u9304\u597d\u7684\u5f71\u7247\uff0c\u586b\u5beb\u7248\u672c\u8cc7\u8a0a\u5f8c\u76f4\u63a5\u9032\u5165 review\u3002\u53ef\u4f7f\u7528\u5f71\u7247\u8072\u97f3\u6216\u53e6\u532f\u5165 QA \u8a9e\u97f3\u8ecc\u505a\u81ea\u52d5\u6253\u9ede\u3002'
    : 'Import an existing recording, fill build info, then jump straight to review with optional audio auto-markers.'
  const importAction = zh ? '\u9078\u64c7\u5f71\u7247\u958b\u59cb\u5206\u6790' : t('importVideo.button')
  const importHint = zh ? 'MP4 / MOV \u7b49\u5f71\u7247\u6a94' : 'MP4 / MOV and other video files'
  const recordingTitle = zh ? '\u958b\u59cb\u9304\u88fd' : 'Start recording'
  const recordingBody = zh
    ? '\u9078\u64c7 PC\u3001Android \u6216 iOS \u4f86\u6e90\uff0c\u63a5\u8457\u5728\u53f3\u5074\u586b\u5beb session \u8cc7\u8a0a\u4e26\u958b\u59cb\u9304\u88fd\u3002'
    : 'Choose a PC, Android, or iOS source, then fill session details on the right and start recording.'

  return (
    <div className="grid h-screen grid-cols-[minmax(360px,390px)_1fr] bg-zinc-950 text-zinc-100">
      <aside className="min-h-0 min-w-0 overflow-y-auto border-r border-zinc-800 p-4">
        <div className="mb-4 flex items-baseline gap-2">
          <h1 className="text-lg font-semibold">Loupe</h1>
          {appVersion && <span className="font-mono text-[11px] text-zinc-600">v{appVersion}</span>}
        </div>

        <section className="mb-4 rounded-lg border border-blue-800/70 bg-blue-950/20 p-3.5 shadow-sm shadow-black/10">
          <div className="mb-3">
            <div className="text-sm font-semibold text-blue-100">{importTitle}</div>
            <div className="mt-1 text-xs leading-5 text-blue-100/60">{importBody}</div>
          </div>
          <button
            type="button"
            onClick={() => setImportVideoOpen(true)}
            className="w-full rounded bg-blue-600 px-3 py-2.5 text-left text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <span className="block">{importAction}</span>
            <span className="mt-0.5 block text-xs font-normal text-blue-100/80">{importHint}</span>
          </button>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3.5 shadow-sm shadow-black/10">
          <div className="mb-3">
            <div className="text-sm font-semibold text-zinc-100">{recordingTitle}</div>
            <div className="mt-1 text-xs leading-5 text-zinc-500">{recordingBody}</div>
          </div>
          <DevicePicker
            api={api}
            selectedId={selected?.id ?? null}
            lastSource={lastRecordingSource}
            onSelect={(id, mode, label) => {
              const source = { id, mode, label }
              setSelected(source)
              setLastRecordingSource(source)
            }}
          />
        </section>
      </aside>

      <main className="flex min-w-0 flex-col overflow-hidden">
        <PreferencesController open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
        {toolsOpen && <ToolStatus onClose={() => setToolsOpen(false)} />}
        <ImportVideoDialog api={api} open={importVideoOpen} onClose={() => setImportVideoOpen(false)} />

        <HomeTopBar
          selectedLabel={selected?.label}
          missingTools={missing}
          onOpenTools={() => setToolsOpen(true)}
          onOpenPreferences={() => setPreferencesOpen(true)}
        />

        <div className="overflow-auto p-5">
          <MissingToolsNotice missingTools={missing} onOpenTools={() => setToolsOpen(true)} />

          <section className="mb-4 border border-zinc-800 bg-zinc-900/40 p-3">
            <h2 className="mb-3 text-sm font-medium text-zinc-300">{t('home.newSession')}</h2>
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
        </div>
      </main>
    </div>
  )
}
