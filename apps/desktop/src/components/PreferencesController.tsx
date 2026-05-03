import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import {
  DEFAULT_HOTKEYS,
  DEFAULT_SEVERITIES,
  googleDriveFolderUrl,
  googleSpreadsheetUrl,
  identityIdFromName,
  parseGoogleDriveFolderInput,
  parseGoogleSpreadsheetInput,
  PreferencesDialog,
  sortGoogleFolders,
  sortIdentities,
} from '@/components/PreferencesDialog'
import { triggerPreset } from '@/lib/audioAnalysisPresets'
import type {
  AppLocale,
  AppSettings,
  AudioAnalysisSettings,
  GitLabProject,
  GitLabPublishSettings,
  GoogleDriveFolder,
  GooglePublishSettings,
  GoogleSheetTab,
  GoogleSpreadsheet,
  HotkeySettings,
  MentionIdentity,
  SeveritySettings,
  SlackPublishSettings,
} from '@shared/types'

interface PreferencesControllerProps {
  open: boolean
  onClose(): void
}

const DEFAULT_SLACK_SETTINGS: SlackPublishSettings = {
  botToken: '',
  userToken: '',
  publishIdentity: 'user',
  channelId: '',
  oauthClientId: '',
  oauthClientSecret: '',
  oauthRedirectUri: 'loupe://slack-oauth',
  oauthUserId: '',
  oauthTeamId: '',
  oauthTeamName: '',
  oauthConnectedAt: null,
  oauthUserScopes: [],
  channels: [],
  channelsFetchedAt: null,
  mentionUserIds: [],
  mentionAliases: {},
  mentionUsers: [],
  usersFetchedAt: null,
}

const DEFAULT_GITLAB_SETTINGS: GitLabPublishSettings = {
  baseUrl: 'https://gitlab.com',
  token: '',
  projectId: '',
  mode: 'single-issue',
  labels: ['loupe', 'qa-evidence'],
  confidential: false,
  mentionUsernames: [],
}

const DEFAULT_GOOGLE_SETTINGS: GooglePublishSettings = {
  token: '',
  refreshToken: '',
  tokenExpiresAt: null,
  accountEmail: '',
  oauthClientId: '',
  oauthClientSecret: '',
  oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback',
  driveFolderId: '',
  driveFolderName: '',
  updateSheet: false,
  spreadsheetId: '',
  spreadsheetName: '',
  sheetName: '',
}

const DEFAULT_AUDIO_ANALYSIS_SETTINGS: AudioAnalysisSettings = {
  enabled: true,
  engine: 'faster-whisper',
  modelPath: 'small',
  language: 'auto',
  chineseScript: 'zh-TW',
  triggerKeywords: triggerPreset('auto').words,
  showTriggerWords: false,
}

function parseListInput(value: string): string[] {
  return Array.from(new Set(value.split(/[,;\n]+/).map(part => part.trim()).filter(Boolean)))
}

export function PreferencesController({ open, onClose }: PreferencesControllerProps) {
  const { locale, localeOptions, setLocale } = useI18n()
  const [exportRoot, setExportRoot] = useState('')
  const [hotkeys, setHotkeys] = useState<HotkeySettings>(DEFAULT_HOTKEYS)
  const [severities, setSeverities] = useState<SeveritySettings>(DEFAULT_SEVERITIES)
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisSettings>(DEFAULT_AUDIO_ANALYSIS_SETTINGS)
  const [audioAnalysisSaved, setAudioAnalysisSaved] = useState(false)
  const [slack, setSlack] = useState<SlackPublishSettings>(DEFAULT_SLACK_SETTINGS)
  const [slackSaved, setSlackSaved] = useState(false)
  const [startingSlackOAuth, setStartingSlackOAuth] = useState(false)
  const [refreshingSlackUsers, setRefreshingSlackUsers] = useState(false)
  const [slackError, setSlackError] = useState('')
  const [gitlab, setGitLab] = useState<GitLabPublishSettings>(DEFAULT_GITLAB_SETTINGS)
  const [gitlabLabelsInput, setGitLabLabelsInput] = useState('loupe, qa-evidence')
  const [gitlabMentionsInput, setGitLabMentionsInput] = useState('')
  const [savingGitLab, setSavingGitLab] = useState(false)
  const [gitlabSaved, setGitLabSaved] = useState(false)
  const [refreshingGitLabUsers, setRefreshingGitLabUsers] = useState(false)
  const [gitlabProjects, setGitLabProjects] = useState<GitLabProject[]>([])
  const [refreshingGitLabProjects, setRefreshingGitLabProjects] = useState(false)
  const [connectingGitLabOAuth, setConnectingGitLabOAuth] = useState(false)
  const [gitlabError, setGitLabError] = useState('')
  const [google, setGoogle] = useState<GooglePublishSettings>(DEFAULT_GOOGLE_SETTINGS)
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
    setAudioAnalysis(settings.audioAnalysis)
    setAudioAnalysisSaved(false)
    setSlack(settings.slack)
    setGitLab(settings.gitlab)
    setGitLabLabelsInput((settings.gitlab.labels ?? []).join(', '))
    setGitLabMentionsInput((settings.gitlab.mentionUsernames ?? []).map(name => `@${name}`).join(', '))
    setGoogle(settings.google)
    setMentionIdentities(settings.mentionIdentities ?? [])
    setMentionIdentitiesSaved(false)
    setMentionIdentitiesStatus('')
  }

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

  const activeSlackUsers = useMemo(() => (slack.mentionUsers ?? []).filter(user => !user.deleted && !user.isBot), [slack.mentionUsers])
  const activeGitLabUsers = useMemo(() => (gitlab.mentionUsers ?? []).filter(user => !user.state || user.state === 'active'), [gitlab.mentionUsers])

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

  async function saveAudioAnalysis(next: AudioAnalysisSettings) {
    const settings = await api.settings.setAudioAnalysis(next)
    setAudioAnalysis(settings.audioAnalysis)
    setAudioAnalysisSaved(true)
  }

  function updateAudioAnalysis(next: AudioAnalysisSettings) {
    setAudioAnalysis(next)
    setAudioAnalysisSaved(false)
  }

  async function changeAudioAnalysisLanguage(language: string) {
    const next: AudioAnalysisSettings = {
      ...audioAnalysis,
      language,
      chineseScript: language === 'zh' ? (audioAnalysis.chineseScript ?? 'zh-TW') : audioAnalysis.chineseScript,
      triggerKeywords: triggerPreset(language).words,
    }
    setAudioAnalysis(next)
    await saveAudioAnalysis(next)
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
        oauthRedirectUri: 'loupe://slack-oauth',
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

  function gitLabSettingsInput(overrides: Partial<GitLabPublishSettings> = {}): GitLabPublishSettings {
    const input = { ...gitlab, ...overrides }
    return {
      ...input,
      baseUrl: input.baseUrl.trim() || 'https://gitlab.com',
      authType: input.authType ?? 'pat',
      oauthClientId: input.oauthClientId?.trim() ?? '',
      oauthClientSecret: input.oauthClientSecret?.trim() ?? '',
      oauthRedirectUri: 'loupe://gitlab-oauth',
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
      oauthRedirectUri: 'http://127.0.0.1:38988/oauth/google/callback',
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

  if (!open) return null

  return (
    <PreferencesDialog
      locale={locale}
      localeOptions={localeOptions}
      exportRoot={exportRoot}
      hotkeys={hotkeys}
      severities={severities}
      audioAnalysis={audioAnalysis}
      audioAnalysisSaved={audioAnalysisSaved}
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
      onAudioAnalysisChange={updateAudioAnalysis}
      onSaveAudioAnalysis={saveAudioAnalysis}
      onAudioAnalysisLanguageChange={(language) => { void changeAudioAnalysisLanguage(language) }}
      onSlackChange={(next) => { setSlack(next); setSlackSaved(false) }}
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
      onClose={onClose}
    />
  )
}
