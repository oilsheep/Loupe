import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import { DEFAULT_HOTKEYS, DEFAULT_SEVERITIES, googleDriveFolderUrl, googleSpreadsheetUrl, identityIdFromName, parseGoogleDriveFolderInput, parseGoogleSpreadsheetInput, PreferencesDialog, sortGoogleFolders, sortIdentities } from '@/components/PreferencesDialog'
import type { AppLocale, AppSettings, GitLabProject, GitLabPublishSettings, GoogleDriveFolder, GooglePublishSettings, GoogleSheetTab, GoogleSpreadsheet, HotkeySettings, MentionIdentity, Session, SeveritySettings, SlackPublishSettings, ToolCheck } from '@shared/types'
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
  const { t, locale, localeOptions, setLocale } = useI18n()
  const goDraft = useApp(s => s.goDraft)
  const [selected, setSelected] = useState<{ id: string; mode: 'usb' | 'wifi' | 'pc'; label?: string } | null>(null)
  const [checks, setChecks] = useState<ToolCheck[]>([])
  const [opening, setOpening] = useState(false)
  const [recentSessions, setRecentSessions] = useState<Session[] | null>(null)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [exportRoot, setExportRoot] = useState('')
  const [hotkeys, setHotkeys] = useState<HotkeySettings>(DEFAULT_HOTKEYS)
  const [severities, setSeverities] = useState<SeveritySettings>(DEFAULT_SEVERITIES)
  const [slack, setSlack] = useState<SlackPublishSettings>({ botToken: '', userToken: '', publishIdentity: 'user', channelId: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: '', oauthUserId: '', oauthTeamId: '', oauthTeamName: '', oauthConnectedAt: null, oauthUserScopes: [], channels: [], channelsFetchedAt: null, mentionUserIds: [], mentionAliases: {}, mentionUsers: [], usersFetchedAt: null })
  const [slackSaved, setSlackSaved] = useState(false)
  const [startingSlackOAuth, setStartingSlackOAuth] = useState(false)
  const [refreshingSlackUsers, setRefreshingSlackUsers] = useState(false)
  const [slackError, setSlackError] = useState('')
  const [gitlab, setGitLab] = useState<GitLabPublishSettings>({ baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: ['loupe', 'qa-evidence'], confidential: false, mentionUsernames: [] })
  const [gitlabLabelsInput, setGitLabLabelsInput] = useState('loupe, qa-evidence')
  const [gitlabMentionsInput, setGitLabMentionsInput] = useState('')
  const [savingGitLab, setSavingGitLab] = useState(false)
  const [gitlabSaved, setGitLabSaved] = useState(false)
  const [refreshingGitLabUsers, setRefreshingGitLabUsers] = useState(false)
  const [gitlabProjects, setGitLabProjects] = useState<GitLabProject[]>([])
  const [refreshingGitLabProjects, setRefreshingGitLabProjects] = useState(false)
  const [connectingGitLabOAuth, setConnectingGitLabOAuth] = useState(false)
  const [gitlabError, setGitLabError] = useState('')
  const [google, setGoogle] = useState<GooglePublishSettings>({ token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' })
  const [savingGoogle, setSavingGoogle] = useState(false)
  const [googleSaved, setGoogleSaved] = useState(false)
  const [connectingGoogleOAuth, setConnectingGoogleOAuth] = useState(false)
  const [googleFolders, setGoogleFolders] = useState<GoogleDriveFolder[]>([])
  const [refreshingGoogleFolders, setRefreshingGoogleFolders] = useState(false)
  const [newGoogleFolderName, setNewGoogleFolderName] = useState('')
  const [creatingGoogleFolder, setCreatingGoogleFolder] = useState(false)
  const [googleSpreadsheets, setGoogleSpreadsheets] = useState<GoogleSpreadsheet[]>([])
  const [refreshingGoogleSpreadsheets, setRefreshingGoogleSpreadsheets] = useState(false)
  const [googleSheetTabs, setGoogleSheetTabs] = useState<GoogleSheetTab[]>([])
  const [refreshingGoogleSheetTabs, setRefreshingGoogleSheetTabs] = useState(false)
  const [googleError, setGoogleError] = useState('')
  const [googleStatus, setGoogleStatus] = useState('')
  const [mentionIdentities, setMentionIdentities] = useState<MentionIdentity[]>([])
  const [savingMentionIdentities, setSavingMentionIdentities] = useState(false)
  const [mentionIdentitiesSaved, setMentionIdentitiesSaved] = useState(false)
  const [mentionIdentitiesError, setMentionIdentitiesError] = useState('')
  const [mentionIdentitiesStatus, setMentionIdentitiesStatus] = useState('')

  function applySettings(settings: AppSettings) {
    setExportRoot(settings.exportRoot)
    setHotkeys(settings.hotkeys)
    setSeverities(settings.severities)
    setSlack(settings.slack)
    setGitLab(settings.gitlab)
    setGitLabLabelsInput((settings.gitlab.labels ?? []).join(', '))
    setGitLabMentionsInput((settings.gitlab.mentionUsernames ?? []).map(name => `@${name}`).join(', '))
    setGoogle(settings.google)
    setMentionIdentities(settings.mentionIdentities ?? [])
    setMentionIdentitiesSaved(false)
    setMentionIdentitiesStatus('')
  }

  useEffect(() => { api.doctor().then(setChecks) }, [])
  useEffect(() => {
    api.settings.get().then(applySettings)
  }, [])
  useEffect(() => api.onSlackOAuthCompleted(result => {
    setStartingSlackOAuth(false)
    setSlackSaved(false)
    if (result.ok && result.settings) {
      setSlack(result.settings.slack)
      setMentionIdentities(result.settings.mentionIdentities ?? [])
      setSlackSaved(true)
      setSlackError('')
    } else {
      setSlackError(result.error || 'Slack OAuth failed')
    }
  }), [])

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

  async function saveExportRoot() {
    if (!exportRoot.trim()) return
    const settings = await api.settings.setExportRoot(exportRoot.trim())
    setExportRoot(settings.exportRoot)
  }

  async function changeLocale(next: AppLocale) {
    await setLocale(next)
  }

  async function saveHotkeys(next: HotkeySettings) {
    const settings = await api.settings.setHotkeys(next)
    setHotkeys(settings.hotkeys)
  }

  async function saveSeverities(next: SeveritySettings) {
    const settings = await api.settings.setSeverities(next)
    setSeverities(settings.severities)
  }

  async function resetDefaultLabels() {
    if (!window.confirm('Reset labels and hotkeys to defaults? Custom labels will be removed.')) return
    const settings = await api.settings.setHotkeys(DEFAULT_HOTKEYS)
    const severitySettings = await api.settings.setSeverities(DEFAULT_SEVERITIES)
    setHotkeys(settings.hotkeys)
    setSeverities(severitySettings.severities)
  }

  async function startSlackUserOAuth() {
    setStartingSlackOAuth(true)
    setSlackSaved(false)
    setSlackError('')
    try {
      const settings = await api.settings.startSlackUserOAuth({
        ...slack,
        botToken: slack.botToken.trim(),
        userToken: slack.userToken?.trim() || '',
        publishIdentity: 'user',
        channelId: slack.channelId.trim(),
        oauthClientId: slack.oauthClientId?.trim() || '',
        oauthClientSecret: slack.oauthClientSecret?.trim() || '',
        oauthRedirectUri: slack.oauthRedirectUri?.trim() || '',
      })
      setSlack(settings.slack)
    } catch (err) {
      setStartingSlackOAuth(false)
      setSlackError(err instanceof Error ? err.message : String(err))
    }
  }

  async function refreshSlackUsers() {
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

  function gitLabSettingsInput(overrides: Partial<GitLabPublishSettings> = {}): GitLabPublishSettings {
    const input = { ...gitlab, ...overrides }
    return {
      ...input,
      baseUrl: input.baseUrl.trim() || 'https://gitlab.com',
      authType: input.authType ?? 'pat',
      oauthClientId: input.oauthClientId?.trim() ?? '',
      oauthClientSecret: input.oauthClientSecret?.trim() ?? '',
      oauthRedirectUri: input.oauthRedirectUri?.trim() || 'http://127.0.0.1:38987/oauth/gitlab/callback',
      projectId: input.projectId.trim(),
      labels: parseListInput(gitlabLabelsInput),
      mentionUsernames: parseListInput(gitlabMentionsInput).map(name => name.replace(/^@/, '')),
      mentionUsers: input.mentionUsers ?? [],
      usersFetchedAt: input.usersFetchedAt ?? null,
      lastUserSyncWarning: input.lastUserSyncWarning ?? null,
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

  async function connectGitLabOAuth() {
    setConnectingGitLabOAuth(true)
    setGitLabSaved(false)
    setGitLabError('')
    try {
      const settings = await api.settings.connectGitLabOAuth(gitLabSettingsInput())
      applySettings(settings)
      await loadGitLabProjects(settings.gitlab)
      setGitLabSaved(true)
    } catch (err) {
      setGitLabError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnectingGitLabOAuth(false)
    }
  }

  async function cancelGitLabOAuth() {
    try {
      await api.settings.cancelGitLabOAuth()
    } finally {
      setConnectingGitLabOAuth(false)
    }
  }

  async function loadGitLabProjects(input = gitLabSettingsInput()) {
    setRefreshingGitLabProjects(true)
    setGitLabError('')
    try {
      const projects = await api.settings.listGitLabProjects(input)
      setGitLabProjects(projects)
    } catch (err) {
      setGitLabError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshingGitLabProjects(false)
    }
  }

  async function refreshGitLabUsers(forceEmailLookup = false) {
    const nextEmailLookup = forceEmailLookup ? 'admin-users-api' : gitlab.emailLookup
    const message = nextEmailLookup === 'admin-users-api'
      ? 'Refresh GitLab users and fetch missing emails through /users/:id? This may require a self-managed admin token.'
      : 'Refresh GitLab users may update the mention identity table. Continue?'
    if (!window.confirm(message)) return
    setRefreshingGitLabUsers(true)
    setGitLabSaved(false)
    setGitLabError('')
    try {
      if (forceEmailLookup) setGitLab(prev => ({ ...prev, emailLookup: 'admin-users-api' }))
      const savedSettings = await api.settings.setGitLab(gitLabSettingsInput(forceEmailLookup ? { emailLookup: 'admin-users-api' } : {}))
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

  function googleSettingsInput(): GooglePublishSettings {
    return {
      ...google,
      oauthClientId: google.oauthClientId?.trim() ?? '',
      oauthClientSecret: google.oauthClientSecret?.trim() ?? '',
      oauthRedirectUri: google.oauthRedirectUri?.trim() || 'http://127.0.0.1:38988/oauth/google/callback',
      driveFolderId: parseGoogleDriveFolderInput(google.driveFolderId),
      driveFolderName: google.driveFolderName?.trim() ?? '',
      spreadsheetId: parseGoogleSpreadsheetInput(google.spreadsheetId),
      spreadsheetName: google.spreadsheetName?.trim() ?? '',
      sheetName: google.sheetName?.trim() ?? '',
      updateSheet: Boolean(google.updateSheet),
    }
  }

  async function saveGoogleSettings() {
    setSavingGoogle(true)
    setGoogleSaved(false)
    setGoogleError('')
    setGoogleStatus('')
    try {
      const settings = await api.settings.setGoogle(googleSettingsInput())
      applySettings(settings)
      setGoogleSaved(true)
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingGoogle(false)
    }
  }

  async function connectGoogleOAuth() {
    setConnectingGoogleOAuth(true)
    setGoogleSaved(false)
    setGoogleError('')
    setGoogleStatus('')
    try {
      const settings = await api.settings.connectGoogleOAuth(googleSettingsInput())
      applySettings(settings)
      setGoogleStatus('Connected. Refresh folders to load Drive destinations.')
      setGoogleSaved(true)
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnectingGoogleOAuth(false)
    }
  }

  async function cancelGoogleOAuth() {
    try {
      await api.settings.cancelGoogleOAuth()
    } finally {
      setConnectingGoogleOAuth(false)
    }
  }

  async function loadGoogleFolders(input = googleSettingsInput()) {
    setRefreshingGoogleFolders(true)
    setGoogleError('')
    setGoogleStatus('')
    try {
      const folders = await api.settings.listGoogleDriveFolders(input)
      setGoogleFolders(folders)
      setGoogle(prev => {
        const driveFolderId = parseGoogleDriveFolderInput(prev.driveFolderId)
        const folder = folders.find(item => item.id === driveFolderId)
        return { ...prev, driveFolderId, driveFolderName: folder?.name ?? prev.driveFolderName }
      })
      const browsingChildren = Boolean(input.driveFolderId?.trim())
      setGoogleStatus(folders.length === 0
        ? browsingChildren ? 'No child folders found in the selected Drive folder.' : 'No Drive folders found. Create a folder or paste a folder URL.'
        : browsingChildren ? `Loaded ${folders.length} child folder${folders.length === 1 ? '' : 's'} in the selected Drive folder.` : `Loaded ${folders.length} Drive folder${folders.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshingGoogleFolders(false)
    }
  }

  async function createGoogleFolder() {
    const name = newGoogleFolderName.trim()
    if (!name) return
    setCreatingGoogleFolder(true)
    setGoogleSaved(false)
    setGoogleError('')
    setGoogleStatus('')
    try {
      const folder = await api.settings.createGoogleDriveFolder(googleSettingsInput(), name)
      setGoogle(prev => ({ ...prev, driveFolderId: folder.id, driveFolderName: folder.name }))
      setGoogleFolders(prev => sortGoogleFolders([...prev.filter(item => item.id !== folder.id), folder]))
      setNewGoogleFolderName('')
      setGoogleStatus(`Created folder: ${folder.name}`)
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingGoogleFolder(false)
    }
  }

  async function loadGoogleSpreadsheets(input = googleSettingsInput()) {
    setRefreshingGoogleSpreadsheets(true)
    setGoogleError('')
    setGoogleStatus('')
    try {
      const sheets = await api.settings.listGoogleSpreadsheets(input)
      setGoogleSpreadsheets(sheets)
      setGoogle(prev => {
        const spreadsheetId = parseGoogleSpreadsheetInput(prev.spreadsheetId)
        const spreadsheet = sheets.find(item => item.id === spreadsheetId)
        return { ...prev, spreadsheetId, spreadsheetName: spreadsheet?.name ?? prev.spreadsheetName }
      })
      setGoogleStatus(sheets.length === 0 ? 'No Google spreadsheets found. Paste a spreadsheet URL if needed.' : `Loaded ${sheets.length} spreadsheet${sheets.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshingGoogleSpreadsheets(false)
    }
  }

  async function loadGoogleSheetTabs(input = googleSettingsInput()) {
    setRefreshingGoogleSheetTabs(true)
    setGoogleError('')
    setGoogleStatus('')
    try {
      const tabs = await api.settings.listGoogleSheetTabs(input)
      setGoogleSheetTabs(tabs)
      setGoogle(prev => ({ ...prev, spreadsheetId: parseGoogleSpreadsheetInput(prev.spreadsheetId) }))
      setGoogleStatus(tabs.length === 0 ? 'No sheet tabs found.' : `Loaded ${tabs.length} sheet tab${tabs.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshingGoogleSheetTabs(false)
    }
  }

  async function openGoogleDriveFolder() {
    const url = googleDriveFolderUrl(google.driveFolderId)
    if (url) await api.app.openPath(url)
  }

  async function openGoogleSpreadsheet() {
    const url = googleSpreadsheetUrl(google.spreadsheetId)
    if (url) await api.app.openPath(url)
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
    const displayName = seed?.displayName?.trim() || seed?.email?.trim() || seed?.googleEmail?.trim() || seed?.gitlabUsername?.trim().replace(/^@/, '') || seed?.slackUserId || 'New person'
    const identity: MentionIdentity = {
      id: seed?.id?.trim() || identityIdFromName(displayName),
      displayName,
      ...(seed?.email ? { email: seed.email.trim().toLowerCase() } : {}),
      ...(seed?.googleEmail ? { googleEmail: seed.googleEmail.trim().toLowerCase() } : {}),
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
        {preferencesOpen && (
          <PreferencesDialog
            locale={locale}
            localeOptions={localeOptions}
            exportRoot={exportRoot}
            hotkeys={hotkeys}
            severities={severities}
            slack={slack}
            slackSaved={slackSaved}
            startingSlackOAuth={startingSlackOAuth}
            refreshingSlackUsers={refreshingSlackUsers}
            slackError={slackError}
            activeSlackUsers={activeSlackUsers}
            gitlab={gitlab}
            gitlabLabelsInput={gitlabLabelsInput}
            gitlabMentionsInput={gitlabMentionsInput}
            savingGitLab={savingGitLab}
            gitlabSaved={gitlabSaved}
            refreshingGitLabUsers={refreshingGitLabUsers}
            gitlabProjects={gitlabProjects}
            refreshingGitLabProjects={refreshingGitLabProjects}
            connectingGitLabOAuth={connectingGitLabOAuth}
            gitlabError={gitlabError}
            activeGitLabUsers={activeGitLabUsers}
            google={google}
            savingGoogle={savingGoogle}
            googleSaved={googleSaved}
            connectingGoogleOAuth={connectingGoogleOAuth}
            googleFolders={googleFolders}
            refreshingGoogleFolders={refreshingGoogleFolders}
            newGoogleFolderName={newGoogleFolderName}
            creatingGoogleFolder={creatingGoogleFolder}
            googleSpreadsheets={googleSpreadsheets}
            refreshingGoogleSpreadsheets={refreshingGoogleSpreadsheets}
            googleSheetTabs={googleSheetTabs}
            refreshingGoogleSheetTabs={refreshingGoogleSheetTabs}
            googleError={googleError}
            googleStatus={googleStatus}
            mentionIdentities={mentionIdentities}
            savingMentionIdentities={savingMentionIdentities}
            mentionIdentitiesSaved={mentionIdentitiesSaved}
            mentionIdentitiesError={mentionIdentitiesError}
            mentionIdentitiesStatus={mentionIdentitiesStatus}
            onLocaleChange={changeLocale}
            onExportRootChange={setExportRoot}
            onSaveExportRoot={saveExportRoot}
            onChooseExportRoot={chooseExportRoot}
            onHotkeysChange={setHotkeys}
            onSaveHotkeys={saveHotkeys}
            onSeveritiesChange={setSeverities}
            onSaveSeverities={saveSeverities}
            onResetLabels={resetDefaultLabels}
            onStartSlackOAuth={startSlackUserOAuth}
            onRefreshSlackUsers={() => { void refreshSlackUsers() }}
            onGitLabChange={(next) => { setGitLab(next); setGitLabSaved(false) }}
            onGitLabLabelsInputChange={(value) => { setGitLabLabelsInput(value); setGitLabSaved(false) }}
            onGitLabMentionsInputChange={(value) => { setGitLabMentionsInput(value); setGitLabSaved(false) }}
            onSaveGitLab={saveGitLabSettings}
            onConnectGitLabOAuth={connectGitLabOAuth}
            onCancelGitLabOAuth={cancelGitLabOAuth}
            onLoadGitLabProjects={() => { void loadGitLabProjects() }}
            onRefreshGitLabUsers={(forceEmailLookup) => { void refreshGitLabUsers(forceEmailLookup) }}
            onGoogleChange={(next) => { setGoogle(next); setGoogleSaved(false) }}
            onSaveGoogleSettings={saveGoogleSettings}
            onConnectGoogleOAuth={connectGoogleOAuth}
            onCancelGoogleOAuth={cancelGoogleOAuth}
            onLoadGoogleFolders={() => { void loadGoogleFolders() }}
            onCreateGoogleFolder={createGoogleFolder}
            onNewGoogleFolderNameChange={setNewGoogleFolderName}
            onLoadGoogleSpreadsheets={() => { void loadGoogleSpreadsheets() }}
            onLoadGoogleSheetTabs={() => { void loadGoogleSheetTabs() }}
            onOpenGoogleDriveFolder={openGoogleDriveFolder}
            onOpenGoogleSpreadsheet={openGoogleSpreadsheet}
            onUpdateMentionIdentity={updateMentionIdentity}
            onAddMentionIdentity={addMentionIdentity}
            onRemoveMentionIdentity={removeMentionIdentity}
            onImportMentionIdentities={importMentionIdentities}
            onExportMentionIdentities={exportMentionIdentities}
            onSaveMentionIdentities={saveMentionIdentities}
            onClose={() => setPreferencesOpen(false)}
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
