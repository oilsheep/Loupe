import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import { PreferencesController } from '@/components/PreferencesController'
import { RecentSessions } from '@/components/RecentSessions'
import { HomeTopBar } from '@/components/HomeTopBar'
import { MissingToolsNotice } from '@/components/MissingToolsNotice'
import type { ToolCheck } from '@shared/types'
import { useApp } from '@/lib/store'
import { useI18n } from '@/lib/i18n'
import type { RecordingSourceSelection } from '@/lib/recordingSource'

export function Home() {
  const { t } = useI18n()
  const goDraft = useApp(s => s.goDraft)
  const goTools = useApp(s => s.goTools)
  const goLegal = useApp(s => s.goLegal)
  const [selected, setSelected] = useState<RecordingSourceSelection | null>(null)
  const [checks, setChecks] = useState<ToolCheck[]>([])
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  useEffect(() => { api.doctor().then(setChecks) }, [])

  const missing = checks.filter(c => !c.ok)

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
      <main className="flex min-w-0 flex-col overflow-hidden">
        <PreferencesController open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />

        <HomeTopBar
          selectedLabel={selected?.label}
          missingTools={missing}
          onOpenTools={goTools}
          onOpenLegal={goLegal}
          onOpenPreferences={() => setPreferencesOpen(true)}
        />

        <div className="overflow-auto p-5">
          <MissingToolsNotice missingTools={missing} onOpenTools={goTools} />

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
