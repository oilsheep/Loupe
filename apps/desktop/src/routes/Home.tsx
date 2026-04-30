import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import type { AppLocale, SlackPublishSettings, ToolCheck } from '@shared/types'
import { useApp } from '@/lib/store'
import { useI18n } from '@/lib/i18n'

function formatMentionInput(slack: SlackPublishSettings): string {
  const fetchedIds = new Set((slack.mentionUsers ?? []).map(user => user.id))
  return (slack.mentionUserIds ?? [])
    .filter(id => !fetchedIds.has(id))
    .map(id => slack.mentionAliases?.[id] ? `${slack.mentionAliases[id]}=${id}` : id)
    .join(', ')
}

function parseMentionInput(value: string): { mentionUserIds: string[]; mentionAliases: Record<string, string> } {
  const mentionUserIds: string[] = []
  const mentionAliases: Record<string, string> = {}
  for (const rawPart of value.split(/[,;\n]+/)) {
    const part = rawPart.trim()
    if (!part) continue
    const pair = part.match(/^(.+?)\s*=\s*(<?@?[^>\s]+>?)$/)
    const slackMention = part.match(/^(.+?)\s+<@([^>|]+)(?:\|[^>]+)?>$/)
    const label = pair?.[1]?.trim() || slackMention?.[1]?.trim() || ''
    const id = (pair?.[2] || slackMention?.[2] || part)
      .trim()
      .replace(/^<@([^>|]+)(?:\|[^>]+)?>$/, '$1')
      .replace(/^@/, '')
    if (!id || mentionUserIds.includes(id)) continue
    mentionUserIds.push(id)
    if (label && label !== id) mentionAliases[id] = label
  }
  return { mentionUserIds, mentionAliases }
}

export function Home() {
  const { t, locale, localeOptions, setLocale } = useI18n()
  const goDraft = useApp(s => s.goDraft)
  const [selected, setSelected] = useState<{ id: string; mode: 'usb' | 'wifi' | 'pc'; label?: string } | null>(null)
  const [checks, setChecks] = useState<ToolCheck[]>([])
  const [opening, setOpening] = useState(false)
  const [exportRoot, setExportRoot] = useState('')
  const [slack, setSlack] = useState<SlackPublishSettings>({ botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {}, mentionUsers: [], usersFetchedAt: null })
  const [slackMentionInput, setSlackMentionInput] = useState('')
  const [savingSlack, setSavingSlack] = useState(false)
  const [slackSaved, setSlackSaved] = useState(false)
  const [refreshingSlackUsers, setRefreshingSlackUsers] = useState(false)
  const [slackError, setSlackError] = useState('')

  useEffect(() => { api.doctor().then(setChecks) }, [])
  useEffect(() => {
    api.settings.get().then(s => {
      setExportRoot(s.exportRoot)
      setSlack(s.slack)
      setSlackMentionInput(formatMentionInput(s.slack))
    })
  }, [])

  const missing = checks.filter(c => !c.ok)
  const activeSlackUsers = useMemo(() => (slack.mentionUsers ?? []).filter(user => !user.deleted && !user.isBot), [slack.mentionUsers])

  async function openSavedSession() {
    setOpening(true)
    try {
      const session = await api.session.openProject()
      if (session) goDraft(session.id)
    } finally {
      setOpening(false)
    }
  }

  async function chooseExportRoot() {
    const settings = await api.settings.chooseExportRoot()
    if (settings) setExportRoot(settings.exportRoot)
  }

  async function saveSlackSettings() {
    setSavingSlack(true)
    setSlackSaved(false)
    setSlackError('')
    try {
      const mentions = parseMentionInput(slackMentionInput)
      const settings = await api.settings.setSlack({
        botToken: slack.botToken.trim(),
        channelId: slack.channelId.trim(),
        mentionUserIds: mentions.mentionUserIds,
        mentionAliases: mentions.mentionAliases,
        mentionUsers: slack.mentionUsers ?? [],
        usersFetchedAt: slack.usersFetchedAt ?? null,
      })
      setSlack(settings.slack)
      setSlackMentionInput(formatMentionInput(settings.slack))
      setSlackSaved(true)
    } catch (err) {
      setSlackError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingSlack(false)
    }
  }

  async function refreshSlackUsers() {
    setRefreshingSlackUsers(true)
    setSlackSaved(false)
    setSlackError('')
    try {
      const settings = await api.settings.refreshSlackUsers()
      setSlack(settings.slack)
      setSlackMentionInput(formatMentionInput(settings.slack))
      setSlackSaved(true)
    } catch (err) {
      setSlackError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshingSlackUsers(false)
    }
  }

  return (
    <div className="grid h-screen grid-cols-[360px_1fr] bg-zinc-950 text-zinc-100">
      <aside className="border-r border-zinc-800 p-4">
        <h1 className="mb-4 text-lg font-semibold">Loupe</h1>
        <DevicePicker
          api={api}
          selectedId={selected?.id ?? null}
          onSelect={(id, mode, label) => setSelected({ id, mode, label })}
        />
      </aside>
      <main className="overflow-auto p-8">
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

        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-300">{t('home.session')}</h2>
          <button
            onClick={openSavedSession}
            disabled={opening}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            {opening ? t('home.opening') : t('home.openSaved')}
          </button>
        </div>

        <section className="mb-6 border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-300">{t('home.newSession')}</h3>
          {selected
            ? <NewSessionForm api={api} deviceId={selected.id} connectionMode={selected.mode} sourceName={selected.label} />
            : (
              <div className="border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
                {t('home.selectPrompt')}
              </div>
            )
          }
        </section>

        {!selected && (
          <section className="mb-6 border border-zinc-800 bg-zinc-900/40 p-5">
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

        <div className="mb-6 border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-2 text-xs font-medium text-zinc-300">{t('home.exportFolder')}</div>
          <div className="flex items-center gap-2">
            <input
              value={exportRoot}
              onChange={(e) => setExportRoot(e.target.value)}
              onBlur={() => { if (exportRoot.trim()) api.settings.setExportRoot(exportRoot.trim()).then(s => setExportRoot(s.exportRoot)) }}
              className="min-w-0 flex-1 rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
            />
            <button
              onClick={chooseExportRoot}
              className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              {t('common.browse')}
            </button>
          </div>
          <label className="mt-3 block text-xs font-medium text-zinc-300">
            {t('home.language')}
            <select
              value={locale}
              onChange={(e) => { void setLocale(e.target.value as AppLocale) }}
              className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
            >
              {localeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        <div className="mb-6 border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-2 text-xs font-medium text-zinc-300">Publish</div>
          <div className="grid grid-cols-[1fr_180px] gap-2">
            <label className="text-xs text-zinc-500">
              Slack bot token
              <input
                value={slack.botToken}
                onChange={(e) => { setSlack({ ...slack, botToken: e.target.value }); setSlackSaved(false) }}
                type="password"
                placeholder="xoxb-..."
                className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>
            <label className="text-xs text-zinc-500">
              Slack channel ID
              <input
                value={slack.channelId}
                onChange={(e) => { setSlack({ ...slack, channelId: e.target.value }); setSlackSaved(false) }}
                placeholder="C..."
                className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>
          </div>
          <label className="mt-2 block text-xs text-zinc-500">
            Slack mention fallback users
            <input
              value={slackMentionInput}
              onChange={(e) => { setSlackMentionInput(e.target.value); setSlackSaved(false) }}
              placeholder="Miki=U1234567890, QA Lead=<@U2345678901>"
              className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
          <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 p-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-zinc-300">Slack users</div>
                <div className="text-[11px] text-zinc-500">
                  {slack.usersFetchedAt ? `Updated ${new Date(slack.usersFetchedAt).toLocaleString()}` : 'Not synced yet'}
                </div>
              </div>
              <button
                type="button"
                onClick={refreshSlackUsers}
                disabled={refreshingSlackUsers || !slack.botToken.trim()}
                className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                {refreshingSlackUsers ? 'Refreshing...' : 'Refresh users'}
              </button>
            </div>
            <div className="mt-2 max-h-36 overflow-auto rounded border border-zinc-800 bg-zinc-950">
              {activeSlackUsers.length === 0 ? (
                <div className="px-2 py-3 text-xs text-zinc-500">Refresh users to build a display-name mention list.</div>
              ) : activeSlackUsers.map(user => {
                const label = user.displayName || user.realName || user.name || user.id
                return (
                  <div key={user.id} className="flex items-center justify-between gap-3 border-b border-zinc-900 px-2 py-1.5 last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate text-xs text-zinc-200">{label}</div>
                      <div className="truncate text-[11px] text-zinc-600">{user.id}{user.name ? ` · @${user.name}` : ''}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {slackError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{slackError}</div>}
          <div className="mt-2 flex items-center justify-end gap-2">
            {slackSaved && <span className="text-xs text-emerald-300">Saved</span>}
            <button
              onClick={saveSlackSettings}
              disabled={savingSlack}
              className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {savingSlack ? 'Saving...' : 'Save publish settings'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
