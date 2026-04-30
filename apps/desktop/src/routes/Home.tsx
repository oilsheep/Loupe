import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import { PreferencesController } from '@/components/PreferencesController'
import type { Session, ToolCheck } from '@shared/types'
import { useApp } from '@/lib/store'
import { useI18n } from '@/lib/i18n'

function formatSessionDate(ms: number): string {
  return new Date(ms).toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSessionDuration(ms: number | null): string {
  if (ms == null) return '-'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

interface RecentSessionDialogProps {
  sessions: Session[]
  opening: boolean
  onSelect(id: string): void
  onBrowse(): void
  onCancel(): void
}

function RecentSessionDialog({ sessions, opening, onSelect, onBrowse, onCancel }: RecentSessionDialogProps) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="recent-session-dialog">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
          <div className="text-sm font-medium text-zinc-100">{t('home.recentSessionsTitle')}</div>
          <div className="mt-1 text-xs text-zinc-500">{t('home.recentSessionsBody')}</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">{t('home.noRecentSessions')}</div>
          ) : sessions.map(session => {
            const title = session.buildVersion.trim() || session.deviceModel || session.id
            const note = session.testNote.trim()
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
                disabled={opening}
                className="block w-full rounded border border-transparent px-3 py-2 text-left hover:border-zinc-700 hover:bg-zinc-800/70 disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-100">{title}</div>
                    <div className="mt-1 truncate text-xs text-zinc-500">
                      {session.deviceModel || '-'} · {session.tester || '-'} · {formatSessionDate(session.startedAt)}
                    </div>
                  </div>
                  <div className="shrink-0 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
                    {formatSessionDuration(session.durationMs)}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span className="rounded bg-zinc-950 px-2 py-0.5">{session.connectionMode.toUpperCase()}</span>
                  <span className="rounded bg-zinc-950 px-2 py-0.5">{session.status}</span>
                  <span className="min-w-0 flex-1 truncate">{note || t('home.noSessionNote')}</span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={opening}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onBrowse}
              disabled={opening}
              className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {opening ? t('home.opening') : t('home.browseOtherSession')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Home() {
  const { t } = useI18n()
  const goDraft = useApp(s => s.goDraft)
  const [selected, setSelected] = useState<{ id: string; mode: 'usb' | 'wifi' | 'pc'; label?: string } | null>(null)
  const [checks, setChecks] = useState<ToolCheck[]>([])
  const [opening, setOpening] = useState(false)
  const [recentSessions, setRecentSessions] = useState<Session[] | null>(null)
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  useEffect(() => { api.doctor().then(setChecks) }, [])

  const missing = checks.filter(c => !c.ok)

  async function openSavedSession() {
    setOpening(true)
    try {
      const sessions = await api.session.list()
      setRecentSessions(sessions.slice(0, 10))
    } finally {
      setOpening(false)
    }
  }

  async function openRecentSession(id: string) {
    setOpening(true)
    try {
      setRecentSessions(null)
      goDraft(id)
    } finally {
      setOpening(false)
    }
  }

  async function browseSavedSession() {
    setOpening(true)
    try {
      const session = await api.session.openProject()
      setRecentSessions(null)
      if (session) goDraft(session.id)
    } finally {
      setOpening(false)
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
        {recentSessions && (
          <RecentSessionDialog
            sessions={recentSessions}
            opening={opening}
            onSelect={openRecentSession}
            onBrowse={browseSavedSession}
            onCancel={() => setRecentSessions(null)}
          />
        )}
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
              <button
                onClick={openSavedSession}
                disabled={opening}
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                {opening ? t('home.opening') : t('home.openSaved')}
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
