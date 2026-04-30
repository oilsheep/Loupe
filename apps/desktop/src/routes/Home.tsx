import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import type { AppLocale, AppSettings, GitLabPublishSettings, MentionIdentity, SlackPublishSettings, ToolCheck } from '@shared/types'
import type { Session } from '@shared/types'
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

function identityIdFromName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `person-${Date.now()}`
}

function sortIdentities(identities: MentionIdentity[]): MentionIdentity[] {
  return [...identities].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

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
  const { t, locale, localeOptions, setLocale } = useI18n()
  const goDraft = useApp(s => s.goDraft)
  const [selected, setSelected] = useState<{ id: string; mode: 'usb' | 'wifi' | 'pc'; label?: string } | null>(null)
  const [checks, setChecks] = useState<ToolCheck[]>([])
  const [opening, setOpening] = useState(false)
  const [recentSessions, setRecentSessions] = useState<Session[] | null>(null)
  const [exportRoot, setExportRoot] = useState('')
  const [slack, setSlack] = useState<SlackPublishSettings>({ botToken: '', channelId: '', mentionUserIds: [], mentionAliases: {}, mentionUsers: [], usersFetchedAt: null })
  const [slackMentionInput, setSlackMentionInput] = useState('')
  const [savingSlack, setSavingSlack] = useState(false)
  const [slackSaved, setSlackSaved] = useState(false)
  const [refreshingSlackUsers, setRefreshingSlackUsers] = useState(false)
  const [slackError, setSlackError] = useState('')
  const [gitlab, setGitLab] = useState<GitLabPublishSettings>({ baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', emailLookup: 'off', labels: ['loupe', 'qa-evidence'], confidential: false, mentionUsernames: [], mentionUsers: [], usersFetchedAt: null, lastUserSyncWarning: null })
  const [gitlabLabelsInput, setGitLabLabelsInput] = useState('loupe, qa-evidence')
  const [gitlabMentionsInput, setGitLabMentionsInput] = useState('')
  const [savingGitLab, setSavingGitLab] = useState(false)
  const [gitlabSaved, setGitLabSaved] = useState(false)
  const [refreshingGitLabUsers, setRefreshingGitLabUsers] = useState(false)
  const [gitlabError, setGitLabError] = useState('')
  const [mentionIdentities, setMentionIdentities] = useState<MentionIdentity[]>([])
  const [savingMentionIdentities, setSavingMentionIdentities] = useState(false)
  const [mentionIdentitiesSaved, setMentionIdentitiesSaved] = useState(false)
  const [mentionIdentitiesError, setMentionIdentitiesError] = useState('')
  const [mentionIdentitiesStatus, setMentionIdentitiesStatus] = useState('')

  function applySettings(settings: AppSettings) {
    setExportRoot(settings.exportRoot)
    setSlack(settings.slack)
    setSlackMentionInput(formatMentionInput(settings.slack))
    setGitLab(settings.gitlab)
    setGitLabLabelsInput((settings.gitlab.labels ?? []).join(', '))
    setGitLabMentionsInput((settings.gitlab.mentionUsernames ?? []).map(name => `@${name}`).join(', '))
    setMentionIdentities(settings.mentionIdentities ?? [])
    setMentionIdentitiesSaved(false)
    setMentionIdentitiesStatus('')
  }

  useEffect(() => { api.doctor().then(setChecks) }, [])
  useEffect(() => {
    api.settings.get().then(applySettings)
  }, [])

  const missing = checks.filter(c => !c.ok)
  const activeSlackUsers = useMemo(() => (slack.mentionUsers ?? []).filter(user => !user.deleted && !user.isBot), [slack.mentionUsers])
  const activeGitLabUsers = useMemo(() => (gitlab.mentionUsers ?? []).filter(user => !user.state || user.state === 'active'), [gitlab.mentionUsers])

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
      applySettings(settings)
      setSlackSaved(true)
    } catch (err) {
      setSlackError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingSlack(false)
    }
  }

  async function refreshSlackUsers() {
    if (!window.confirm('Refresh Slack users may update the mention identity table. Continue?')) return
    setRefreshingSlackUsers(true)
    setSlackSaved(false)
    setSlackError('')
    try {
      const settings = await api.settings.refreshSlackUsers()
      applySettings(settings)
      setSlackSaved(true)
    } catch (err) {
      setSlackError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshingSlackUsers(false)
    }
  }

  function parseListInput(value: string): string[] {
    return Array.from(new Set(value.split(/[,;\n]+/).map(part => part.trim()).filter(Boolean)))
  }

  function gitLabSettingsInput(): GitLabPublishSettings {
    return {
      ...gitlab,
      baseUrl: gitlab.baseUrl.trim() || 'https://gitlab.com',
      projectId: gitlab.projectId.trim(),
      labels: parseListInput(gitlabLabelsInput),
      mentionUsernames: parseListInput(gitlabMentionsInput).map(name => name.replace(/^@/, '')),
      mentionUsers: gitlab.mentionUsers ?? [],
      usersFetchedAt: gitlab.usersFetchedAt ?? null,
      lastUserSyncWarning: gitlab.lastUserSyncWarning ?? null,
    }
  }

  async function saveGitLabSettings() {
    setSavingGitLab(true)
    setGitLabSaved(false)
    setGitLabError('')
    try {
      const settings = await api.settings.setGitLab(gitLabSettingsInput())
      applySettings(settings)
      setGitLabSaved(true)
    } catch (err) {
      setGitLabError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingGitLab(false)
    }
  }

  async function refreshGitLabUsers() {
    if (!window.confirm('Refresh GitLab users may update the mention identity table. If this token cannot read email, mapping may be less complete. Continue?')) return
    setRefreshingGitLabUsers(true)
    setGitLabSaved(false)
    setGitLabError('')
    try {
      const savedSettings = await api.settings.setGitLab(gitLabSettingsInput())
      applySettings(savedSettings)
      const settings = await api.settings.refreshGitLabUsers()
      applySettings(settings)
      setGitLabSaved(true)
    } catch (err) {
      setGitLabError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshingGitLabUsers(false)
    }
  }

  async function saveMentionIdentities() {
    setSavingMentionIdentities(true)
    setMentionIdentitiesSaved(false)
    setMentionIdentitiesError('')
    setMentionIdentitiesStatus('')
    try {
      const settings = await api.settings.setMentionIdentities(mentionIdentities)
      applySettings(settings)
      setMentionIdentitiesSaved(true)
    } catch (err) {
      setMentionIdentitiesError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingMentionIdentities(false)
    }
  }

  async function importMentionIdentities() {
    setMentionIdentitiesSaved(false)
    setMentionIdentitiesError('')
    setMentionIdentitiesStatus('')
    try {
      const settings = await api.settings.importMentionIdentities()
      if (!settings) return
      applySettings(settings)
      setMentionIdentitiesSaved(true)
      setMentionIdentitiesStatus('Imported')
    } catch (err) {
      setMentionIdentitiesError(err instanceof Error ? err.message : String(err))
    }
  }

  async function exportMentionIdentities() {
    setMentionIdentitiesSaved(false)
    setMentionIdentitiesError('')
    setMentionIdentitiesStatus('')
    try {
      const path = await api.settings.exportMentionIdentities()
      if (!path) return
      setMentionIdentitiesStatus(`Exported ${path}`)
    } catch (err) {
      setMentionIdentitiesError(err instanceof Error ? err.message : String(err))
    }
  }

  function updateMentionIdentity(index: number, patch: Partial<MentionIdentity>) {
    setMentionIdentitiesSaved(false)
    setMentionIdentitiesStatus('')
    setMentionIdentities(prev => prev.map((identity, i) => i === index ? { ...identity, ...patch } : identity))
  }

  function addMentionIdentity(seed?: Partial<MentionIdentity>) {
    setMentionIdentitiesSaved(false)
    setMentionIdentitiesStatus('')
    const displayName = seed?.displayName?.trim() || seed?.email?.trim() || seed?.gitlabUsername?.trim().replace(/^@/, '') || seed?.slackUserId || 'New person'
    const identity: MentionIdentity = {
      id: seed?.id?.trim() || identityIdFromName(displayName),
      displayName,
      ...(seed?.email ? { email: seed.email.trim().toLowerCase() } : {}),
      ...(seed?.slackUserId ? { slackUserId: seed.slackUserId } : {}),
      ...(seed?.gitlabUsername ? { gitlabUsername: seed.gitlabUsername.replace(/^@/, '') } : {}),
    }
    setMentionIdentities(prev => sortIdentities([...prev.filter(item => item.id !== identity.id), identity]))
  }

  function removeMentionIdentity(index: number) {
    setMentionIdentitiesSaved(false)
    setMentionIdentitiesStatus('')
    setMentionIdentities(prev => prev.filter((_, i) => i !== index))
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
        {recentSessions && (
          <RecentSessionDialog
            sessions={recentSessions}
            opening={opening}
            onSelect={openRecentSession}
            onBrowse={browseSavedSession}
            onCancel={() => setRecentSessions(null)}
          />
        )}

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

        <section className="mb-6">
          <div className="mb-2 text-xs font-medium text-zinc-300">Publish</div>
          <div className="space-y-3">
          <details className="border border-zinc-800 bg-zinc-900/40 p-3" open>
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-zinc-300">
            <span>Slack</span>
            <span className="text-[11px] font-normal text-zinc-500">Settings</span>
          </summary>
          <div className="mt-3">
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
                      <div className="truncate text-[11px] text-zinc-600">{user.id}{user.name ? ` · @${user.name}` : ''}{user.email ? ` · ${user.email}` : ''}</div>
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
              {savingSlack ? 'Saving...' : 'Save Slack settings'}
            </button>
          </div>

          </div>
          </details>

          <details className="border border-zinc-800 bg-zinc-900/40 p-3" open>
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-zinc-300">
              <span>GitLab</span>
              <span className="text-[11px] font-normal text-zinc-500">Settings</span>
            </summary>
            <div className="mt-3">
            <div className="grid grid-cols-[1fr_180px] gap-2">
              <label className="text-xs text-zinc-500">
                GitLab base URL
                <input
                  value={gitlab.baseUrl}
                  onChange={(e) => { setGitLab({ ...gitlab, baseUrl: e.target.value }); setGitLabSaved(false) }}
                  placeholder="https://gitlab.com"
                  className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
              <label className="text-xs text-zinc-500">
                Project ID or path
                <input
                  value={gitlab.projectId}
                  onChange={(e) => { setGitLab({ ...gitlab, projectId: e.target.value }); setGitLabSaved(false) }}
                  placeholder="group/project"
                  className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
            </div>
            <label className="mt-2 block text-xs text-zinc-500">
              GitLab token
              <input
                value={gitlab.token}
                onChange={(e) => { setGitLab({ ...gitlab, token: e.target.value }); setGitLabSaved(false) }}
                type="password"
                placeholder="glpat-..."
                className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-zinc-500">
                Labels
                <input
                  value={gitlabLabelsInput}
                  onChange={(e) => { setGitLabLabelsInput(e.target.value); setGitLabSaved(false) }}
                  placeholder="loupe, qa-evidence"
                  className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
              <label className="text-xs text-zinc-500">
                GitLab fallback usernames
                <input
                  value={gitlabMentionsInput}
                  onChange={(e) => { setGitLabMentionsInput(e.target.value); setGitLabSaved(false) }}
                  placeholder="@qa, @lead"
                  className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
            </div>
            <label className="mt-2 block text-xs text-zinc-500">
              Default GitLab mode
              <select
                value={gitlab.mode}
                onChange={(e) => { setGitLab({ ...gitlab, mode: e.target.value as GitLabPublishSettings['mode'] }); setGitLabSaved(false) }}
                className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="single-issue">Single issue</option>
                <option value="per-marker-issue">Issue per marker</option>
              </select>
            </label>
            <label className="mt-2 block text-xs text-zinc-500">
              GitLab email lookup
              <select
                value={gitlab.emailLookup ?? 'off'}
                onChange={(e) => { setGitLab({ ...gitlab, emailLookup: e.target.value as GitLabPublishSettings['emailLookup'] }); setGitLabSaved(false) }}
                className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="off">Off</option>
                <option value="admin-users-api">Admin users API</option>
              </select>
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={Boolean(gitlab.confidential)}
                onChange={(e) => { setGitLab({ ...gitlab, confidential: e.target.checked }); setGitLabSaved(false) }}
                className="h-4 w-4 accent-blue-600"
              />
              Create confidential/internal GitLab issues and notes
            </label>
            <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 p-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-zinc-300">GitLab users</div>
                  <div className="text-[11px] text-zinc-500">
                    {gitlab.usersFetchedAt ? `Updated ${new Date(gitlab.usersFetchedAt).toLocaleString()}` : 'Not synced yet'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={refreshGitLabUsers}
                  disabled={refreshingGitLabUsers || !gitlab.token.trim() || !gitlab.projectId.trim()}
                  className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {refreshingGitLabUsers ? 'Refreshing...' : 'Refresh users'}
                </button>
              </div>
              <div className="mt-2 max-h-36 overflow-auto rounded border border-zinc-800 bg-zinc-950">
                {activeGitLabUsers.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-zinc-500">Refresh users after setting a GitLab token and project.</div>
                ) : activeGitLabUsers.map(user => (
                  <div key={user.username} className="flex items-center justify-between gap-3 border-b border-zinc-900 px-2 py-1.5 last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate text-xs text-zinc-200">{user.name || user.username}</div>
                      <div className="truncate text-[11px] text-zinc-600">@{user.username}{user.email ? ` · ${user.email}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {gitlabError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{gitlabError}</div>}
            {gitlab.lastUserSyncWarning && <div className="mt-2 rounded border border-yellow-800 bg-yellow-950/40 px-2 py-1.5 text-xs text-yellow-200">{gitlab.lastUserSyncWarning}</div>}
            <div className="mt-2 flex items-center justify-end gap-2">
              {gitlabSaved && <span className="text-xs text-emerald-300">Saved</span>}
              <button
                onClick={saveGitLabSettings}
                disabled={savingGitLab}
                className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                {savingGitLab ? 'Saving...' : 'Save GitLab settings'}
              </button>
            </div>
          </div>
          </details>

          <details className="border border-zinc-800 bg-zinc-900/40 p-3" open>
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-zinc-300">
              <span>Mention identities</span>
              <span className="text-[11px] font-normal text-zinc-500">Shared Slack / GitLab mapping</span>
            </summary>
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] text-zinc-500">One display name can map to Slack and GitLab identities.</div>
                <button
                  type="button"
                  onClick={() => addMentionIdentity()}
                  className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                >
                  Add person
                </button>
              </div>
              <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950">
                <div className="grid min-w-[760px] grid-cols-[1.1fr_1.2fr_1fr_1fr_72px] border-b border-zinc-800 px-2 py-1.5 text-[11px] font-medium text-zinc-500">
                  <div>Display name</div>
                  <div>Email</div>
                  <div>Slack user ID</div>
                  <div>GitLab username</div>
                  <div />
                </div>
                {mentionIdentities.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-zinc-500">Refresh Slack users or add people manually.</div>
                ) : mentionIdentities.map((identity, index) => (
                  <div key={`${identity.id}-${index}`} className="grid min-w-[760px] grid-cols-[1.1fr_1.2fr_1fr_1fr_72px] gap-2 border-b border-zinc-900 px-2 py-1.5 last:border-b-0">
                    <input
                      value={identity.displayName}
                      onChange={(e) => updateMentionIdentity(index, { displayName: e.target.value })}
                      className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <input
                      value={identity.email ?? ''}
                      onChange={(e) => updateMentionIdentity(index, { email: e.target.value.trim().toLowerCase() || undefined })}
                      placeholder="name@example.com"
                      className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <input
                      value={identity.slackUserId ?? ''}
                      onChange={(e) => updateMentionIdentity(index, { slackUserId: e.target.value.trim() || undefined })}
                      placeholder="U123..."
                      className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <input
                      value={identity.gitlabUsername ? `@${identity.gitlabUsername}` : ''}
                      onChange={(e) => updateMentionIdentity(index, { gitlabUsername: e.target.value.trim().replace(/^@/, '') || undefined })}
                      placeholder="@username"
                      className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => removeMentionIdentity(index)}
                      className="rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-400 hover:bg-red-950 hover:text-red-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              {activeSlackUsers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeSlackUsers
                    .filter(user => !mentionIdentities.some(identity => identity.slackUserId === user.id))
                    .slice(0, 12)
                    .map(user => {
                      const label = user.displayName || user.realName || user.name || user.id
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => addMentionIdentity({ displayName: label, email: user.email, slackUserId: user.id })}
                          className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          Add {label}
                        </button>
                      )
                    })}
                </div>
              )}
              {activeGitLabUsers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeGitLabUsers
                    .filter(user => !mentionIdentities.some(identity => identity.gitlabUsername === user.username))
                    .slice(0, 12)
                    .map(user => (
                      <button
                        key={user.username}
                        type="button"
                        onClick={() => addMentionIdentity({ displayName: user.name || user.username, email: user.email, gitlabUsername: user.username })}
                        className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        Add @{user.username}
                      </button>
                    ))}
                </div>
              )}
              {mentionIdentitiesError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{mentionIdentitiesError}</div>}
              {mentionIdentitiesStatus && <div className="mt-2 truncate text-xs text-emerald-300">{mentionIdentitiesStatus}</div>}
              <div className="mt-2 flex items-center justify-end gap-2">
                {mentionIdentitiesSaved && <span className="text-xs text-emerald-300">Saved</span>}
                <button
                  type="button"
                  onClick={importMentionIdentities}
                  className="rounded bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={exportMentionIdentities}
                  className="rounded bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={saveMentionIdentities}
                  disabled={savingMentionIdentities}
                  className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {savingMentionIdentities ? 'Saving...' : 'Save mention identities'}
                </button>
              </div>
            </div>
          </details>
          </div>
        </section>
      </main>
    </div>
  )
}
