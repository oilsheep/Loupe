import { useEffect, useState } from 'react'
import type { AppLocale, BugSeverity, GitLabMentionUser, GitLabProject, GitLabPublishSettings, GoogleDriveFolder, GooglePublishSettings, GoogleSheetTab, GoogleSpreadsheet, HotkeySettings, MentionIdentity, SeveritySettings, SlackMentionUser, SlackPublishSettings } from '@shared/types'
import { useI18n } from '@/lib/i18n'

export function identityIdFromName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `person-${Date.now()}`
}

export function parseGoogleDriveFolderInput(value: string | undefined): string {
  const text = value?.trim() ?? ''
  if (!text) return ''
  try {
    const url = new URL(text)
    const folderMatch = url.pathname.match(/\/folders\/([^/?#]+)/)
    if (folderMatch?.[1]) return decodeURIComponent(folderMatch[1])
    const id = url.searchParams.get('id')
    if (id) return id
  } catch {
    // Plain Drive folder IDs are also accepted.
  }
  return text
}

export function parseGoogleSpreadsheetInput(value: string | undefined): string {
  const text = value?.trim() ?? ''
  if (!text) return ''
  try {
    const url = new URL(text)
    const spreadsheetMatch = url.pathname.match(/\/spreadsheets\/d\/([^/?#]+)/)
    if (spreadsheetMatch?.[1]) return decodeURIComponent(spreadsheetMatch[1])
    const id = url.searchParams.get('id')
    if (id) return id
  } catch {
    // Plain spreadsheet IDs are also accepted.
  }
  return text
}

export function googleDriveFolderUrl(value: string | undefined): string {
  const id = parseGoogleDriveFolderInput(value)
  return id ? `https://drive.google.com/drive/folders/${encodeURIComponent(id)}` : ''
}

export function googleSpreadsheetUrl(value: string | undefined): string {
  const id = parseGoogleSpreadsheetInput(value)
  return id ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit` : ''
}

export function sortIdentities(identities: MentionIdentity[]): MentionIdentity[] {
  return [...identities].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function sortGoogleFolders(folders: GoogleDriveFolder[]): GoogleDriveFolder[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name))
}

function MentionIdentityBadges({ identity }: { identity: MentionIdentity }) {
  const hasSlack = Boolean(identity.slackUserId)
  const hasGitLab = Boolean(identity.gitlabUsername)
  const hasGoogle = Boolean(identity.googleEmail)
  if (!hasSlack && !hasGitLab && !hasGoogle) {
    return (
      <span className="rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
        No mappings
      </span>
    )
  }
  return (
    <>
      {hasSlack && (
        <span className="rounded-full border border-sky-900/70 bg-sky-950/50 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
          Slack
        </span>
      )}
      {hasGitLab && (
        <span className="rounded-full border border-orange-900/70 bg-orange-950/50 px-1.5 py-0.5 text-[10px] font-medium text-orange-300">
          GitLab
        </span>
      )}
      {hasGoogle && (
        <span className="rounded-full border border-emerald-900/70 bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
          Google
        </span>
      )}
    </>
  )
}

interface PreferencesDialogProps {
  locale: AppLocale
  localeOptions: Array<{ value: AppLocale; label: string }>
  exportRoot: string
  hotkeys: HotkeySettings
  severities: SeveritySettings
  slack: SlackPublishSettings
  slackSaved: boolean
  startingSlackOAuth: boolean
  slackError: string
  activeSlackUsers: SlackMentionUser[]
  gitlab: GitLabPublishSettings
  gitlabLabelsInput: string
  gitlabMentionsInput: string
  savingGitLab: boolean
  gitlabSaved: boolean
  refreshingGitLabUsers: boolean
  gitlabProjects: GitLabProject[]
  refreshingGitLabProjects: boolean
  connectingGitLabOAuth: boolean
  gitlabError: string
  activeGitLabUsers: GitLabMentionUser[]
  google: GooglePublishSettings
  savingGoogle: boolean
  googleSaved: boolean
  connectingGoogleOAuth: boolean
  googleFolders: GoogleDriveFolder[]
  refreshingGoogleFolders: boolean
  newGoogleFolderName: string
  creatingGoogleFolder: boolean
  googleSpreadsheets: GoogleSpreadsheet[]
  refreshingGoogleSpreadsheets: boolean
  googleSheetTabs: GoogleSheetTab[]
  refreshingGoogleSheetTabs: boolean
  googleError: string
  googleStatus: string
  mentionIdentities: MentionIdentity[]
  savingMentionIdentities: boolean
  mentionIdentitiesSaved: boolean
  mentionIdentitiesError: string
  mentionIdentitiesStatus: string
  onLocaleChange(locale: AppLocale): void
  onExportRootChange(value: string): void
  onSaveExportRoot(): void
  onChooseExportRoot(): void
  onHotkeysChange(value: HotkeySettings): void
  onSaveHotkeys(value: HotkeySettings): void
  onSeveritiesChange(value: SeveritySettings): void
  onSaveSeverities(value: SeveritySettings): void
  onResetLabels(): void
  onStartSlackOAuth(): void
  onGitLabChange(value: GitLabPublishSettings): void
  onGitLabLabelsInputChange(value: string): void
  onGitLabMentionsInputChange(value: string): void
  onSaveGitLab(): void
  onConnectGitLabOAuth(): void
  onCancelGitLabOAuth(): void
  onLoadGitLabProjects(): void
  onRefreshGitLabUsers(forceEmailLookup: boolean): void
  onGoogleChange(value: GooglePublishSettings): void
  onSaveGoogleSettings(): void
  onConnectGoogleOAuth(): void
  onCancelGoogleOAuth(): void
  onLoadGoogleFolders(): void
  onCreateGoogleFolder(): void
  onNewGoogleFolderNameChange(value: string): void
  onLoadGoogleSpreadsheets(): void
  onLoadGoogleSheetTabs(): void
  onOpenGoogleDriveFolder(): void
  onOpenGoogleSpreadsheet(): void
  onUpdateMentionIdentity(index: number, patch: Partial<MentionIdentity>): void
  onAddMentionIdentity(seed?: Partial<MentionIdentity>): void
  onRemoveMentionIdentity(index: number): void
  onImportMentionIdentities(): void
  onExportMentionIdentities(): void
  onSaveMentionIdentities(): void
  onClose(): void
}

export function PreferencesDialog({
  locale,
  localeOptions,
  exportRoot,
  hotkeys,
  severities,
  slack,
  slackSaved,
  startingSlackOAuth,
  slackError,
  activeSlackUsers,
  gitlab,
  gitlabLabelsInput,
  gitlabMentionsInput,
  savingGitLab,
  gitlabSaved,
  refreshingGitLabUsers,
  gitlabProjects,
  refreshingGitLabProjects,
  connectingGitLabOAuth,
  gitlabError,
  activeGitLabUsers,
  google,
  savingGoogle,
  googleSaved,
  connectingGoogleOAuth,
  googleFolders,
  refreshingGoogleFolders,
  newGoogleFolderName,
  creatingGoogleFolder,
  googleSpreadsheets,
  refreshingGoogleSpreadsheets,
  googleSheetTabs,
  refreshingGoogleSheetTabs,
  googleError,
  googleStatus,
  mentionIdentities,
  savingMentionIdentities,
  mentionIdentitiesSaved,
  mentionIdentitiesError,
  mentionIdentitiesStatus,
  onLocaleChange,
  onExportRootChange,
  onSaveExportRoot,
  onChooseExportRoot,
  onHotkeysChange,
  onSaveHotkeys,
  onSeveritiesChange,
  onSaveSeverities,
  onResetLabels,
  onStartSlackOAuth,
  onGitLabChange,
  onGitLabLabelsInputChange,
  onGitLabMentionsInputChange,
  onSaveGitLab,
  onConnectGitLabOAuth,
  onCancelGitLabOAuth,
  onLoadGitLabProjects,
  onRefreshGitLabUsers,
  onGoogleChange,
  onSaveGoogleSettings,
  onConnectGoogleOAuth,
  onCancelGoogleOAuth,
  onLoadGoogleFolders,
  onCreateGoogleFolder,
  onNewGoogleFolderNameChange,
  onLoadGoogleSpreadsheets,
  onLoadGoogleSheetTabs,
  onOpenGoogleDriveFolder,
  onOpenGoogleSpreadsheet,
  onUpdateMentionIdentity,
  onAddMentionIdentity,
  onRemoveMentionIdentity,
  onImportMentionIdentities,
  onExportMentionIdentities,
  onSaveMentionIdentities,
  onClose,
}: PreferencesDialogProps) {
  const { t } = useI18n()
  const [customSlots, setCustomSlots] = useState<BugSeverity[]>(() => visibleCustomSeverities(severities))

  useEffect(() => {
    setCustomSlots(visibleCustomSeverities(severities))
  }, [severities])

  function saveSeverityLabel(severity: BugSeverity) {
    const trimmed = severities[severity]?.label?.trim() ?? ''
    const next = {
      ...severities,
      [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), label: trimmed || (CUSTOM_SEVERITIES.includes(severity) ? '' : DEFAULT_SEVERITIES[severity].label) },
    }
    if (CUSTOM_SEVERITIES.includes(severity) && !trimmed) setCustomSlots(customSlots.filter(slot => slot !== severity))
    onSaveSeverities(next)
  }

  function updateSeverity(severity: BugSeverity, patch: Partial<SeveritySettings[BugSeverity]>) {
    onSeveritiesChange({
      ...severities,
      [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), ...patch },
    })
  }

  function addCustomLabel() {
    const slot = CUSTOM_SEVERITIES.find(key => !customSlots.includes(key))
    if (!slot) return
    const next = {
      ...severities,
      [slot]: { ...(severities[slot] ?? DEFAULT_SEVERITIES[slot]), label: `tag ${5 + CUSTOM_SEVERITIES.indexOf(slot)}` },
    }
    setCustomSlots([...customSlots, slot])
    onSaveSeverities(next)
  }

  function removeCustomLabel(severity: BugSeverity) {
    const next = {
      ...severities,
      [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), label: '' },
    }
    setCustomSlots(customSlots.filter(slot => slot !== severity))
    onSaveSeverities(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="preferences-dialog">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-zinc-100">{t('preferences.title')}</div>
            <div className="mt-1 text-xs text-zinc-500">{t('preferences.body')}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
            {t('common.close')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <section className="grid gap-3 border-b border-zinc-800 pb-4 lg:grid-cols-[220px_1fr]">
            <div>
              <div className="text-sm font-medium text-zinc-200">{t('preferences.general')}</div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">{t('preferences.generalHelp')}</div>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-zinc-400">
                {t('home.language')}
                <select
                  value={locale}
                  onChange={(e) => onLocaleChange(e.target.value as AppLocale)}
                  className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                >
                  {localeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-xs text-zinc-400">
                {t('home.exportFolder')}
                <div className="mt-1 flex gap-2">
                  <input
                    value={exportRoot}
                    onChange={(e) => onExportRootChange(e.target.value)}
                    onBlur={onSaveExportRoot}
                    className="min-w-0 flex-1 rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  <button type="button" onClick={onChooseExportRoot} className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700">
                    {t('common.browse')}
                  </button>
                </div>
              </label>
            </div>
          </section>

          <section className="grid gap-3 border-b border-zinc-800 py-4 lg:grid-cols-[220px_1fr]">
            <div>
              <div className="text-sm font-medium text-zinc-200">{t('preferences.markerDefaults')}</div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">{t('preferences.markerDefaultsHelp')}</div>
              <button type="button" onClick={onResetLabels} className="mt-3 rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
                Reset
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {HOTKEY_SEVERITIES.map(({ key, severity }) => (
                  <label key={key} className="text-xs text-zinc-500">
                    <div className="mb-1">
                      <span className="inline-block max-w-full truncate rounded px-2 py-0.5 text-xs font-medium text-black" style={{ backgroundColor: colorOrDefault(severities, severity) }}>
                        {labelOrDefault(severities, severity)}
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_38px_72px] gap-1">
                      <input
                        value={severities[severity]?.label ?? ''}
                        onChange={(e) => updateSeverity(severity, { label: e.target.value })}
                        onBlur={() => saveSeverityLabel(severity)}
                        className="min-w-0 rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                      />
                      <input
                        type="color"
                        value={colorOrDefault(severities, severity)}
                        onChange={(e) => {
                          const next = { ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), color: e.target.value } }
                          onSaveSeverities(next)
                        }}
                        className="h-8 w-full cursor-pointer rounded border border-zinc-800 bg-zinc-950 p-1"
                      />
                      <input
                        value={hotkeys[key]}
                        onChange={(e) => onHotkeysChange({ ...hotkeys, [key]: e.target.value })}
                        onBlur={() => onSaveHotkeys({ ...hotkeys, [key]: hotkeys[key].trim() || DEFAULT_HOTKEYS[key] })}
                        className="min-w-0 rounded bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>
                  </label>
                ))}
              </div>

              <div className="border-t border-zinc-800 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300">Custom labels</span>
                  {customSlots.length < CUSTOM_SEVERITIES.length && (
                    <button type="button" onClick={addCustomLabel} className="inline-flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-sm text-zinc-200 hover:bg-zinc-700" title={t('common.add')}>
                      +
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {customSlots.map(severity => (
                    <label key={severity} className="text-xs text-zinc-500">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="inline-block max-w-full truncate rounded px-2 py-0.5 text-xs font-medium text-black" style={{ backgroundColor: colorOrDefault(severities, severity) }}>
                          {labelOrDefault(severities, severity)}
                        </span>
                        <button type="button" onClick={() => removeCustomLabel(severity)} className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-sm text-zinc-400 hover:bg-red-700 hover:text-white" title={t('bug.deleteConfirm')}>
                          x
                        </button>
                      </div>
                      <div className="grid grid-cols-[1fr_38px] gap-1">
                        <input
                          value={severities[severity]?.label ?? ''}
                          onChange={(e) => updateSeverity(severity, { label: e.target.value })}
                          onBlur={() => saveSeverityLabel(severity)}
                          className="min-w-0 rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                        />
                        <input
                          type="color"
                          value={colorOrDefault(severities, severity)}
                          onChange={(e) => {
                            const next = { ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity]), color: e.target.value } }
                            onSaveSeverities(next)
                          }}
                          className="h-8 w-full cursor-pointer rounded border border-zinc-800 bg-zinc-950 p-1"
                        />
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 pt-4 lg:grid-cols-[220px_1fr]">
            <div>
              <div className="text-sm font-medium text-zinc-200">Publish</div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">{t('preferences.publishHelp')}</div>
            </div>
            <div className="space-y-3">
              <details className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
                <summary className="cursor-pointer select-none text-xs font-medium text-zinc-300">Slack</summary>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs text-zinc-500">
                      {slack.oauthUserId
                        ? `Connected as ${slack.oauthUserId}${slack.oauthTeamName ? ` in ${slack.oauthTeamName}` : ''}`
                        : 'Choose your Slack account and workspace in the browser.'}
                    </div>
                    {(slackSaved || slack.oauthConnectedAt) && (
                      <div className="mt-1 text-[11px] text-emerald-300">
                        {slackSaved ? 'Slack connected.' : `Connected ${new Date(slack.oauthConnectedAt ?? '').toLocaleString()}`}
                      </div>
                    )}
                    {slackError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{slackError}</div>}
                  </div>
                  <button type="button" onClick={onStartSlackOAuth} disabled={startingSlackOAuth} className="shrink-0 rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:opacity-50">
                    {startingSlackOAuth ? 'Waiting...' : slack.oauthUserId ? 'Reconnect Slack' : 'Connect Slack'}
                  </button>
                </div>
                {activeSlackUsers.length > 0 && (
                  <div className="mt-2 max-h-28 overflow-auto rounded border border-zinc-800 bg-zinc-950">
                    {activeSlackUsers.map(user => {
                      const label = user.displayName || user.realName || user.name || user.id
                      return (
                        <div key={user.id} className="border-b border-zinc-900 px-2 py-1.5 last:border-b-0">
                          <div className="truncate text-xs text-zinc-200">{label}</div>
                          <div className="truncate text-[11px] text-zinc-600">{user.id}{user.name ? ` / @${user.name}` : ''}{user.email ? ` / ${user.email}` : ''}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </details>

              <details className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
                <summary className="cursor-pointer select-none text-xs font-medium text-zinc-300">Google Drive</summary>
                <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-2 text-xs text-zinc-500">
                  Google OAuth credentials are bundled with Loupe. Redirect URI: {google.oauthRedirectUri || 'http://127.0.0.1:38988/oauth/google/callback'}
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  {google.token.trim() && <span className="text-xs text-emerald-300">Connected{google.accountEmail ? ` as ${google.accountEmail}` : ''}</span>}
                  <button type="button" onClick={onConnectGoogleOAuth} disabled={connectingGoogleOAuth} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {connectingGoogleOAuth ? 'Connecting...' : 'Connect Google'}
                  </button>
                  {connectingGoogleOAuth && (
                    <button type="button" onClick={onCancelGoogleOAuth} className="rounded bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                      Cancel OAuth
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
                  <label className="text-xs text-zinc-500">
                    Drive folder
                    <input
                      value={google.driveFolderId ?? ''}
                      onChange={(e) => {
                        const driveFolderId = parseGoogleDriveFolderInput(e.target.value)
                        const folder = googleFolders.find(item => item.id === driveFolderId)
                        onGoogleChange({ ...google, driveFolderId: e.target.value, driveFolderName: folder?.name ?? '' })
                      }}
                      onBlur={() => {
                        const driveFolderId = parseGoogleDriveFolderInput(google.driveFolderId)
                        const folder = googleFolders.find(item => item.id === driveFolderId)
                        onGoogleChange({ ...google, driveFolderId, driveFolderName: folder?.name ?? google.driveFolderName })
                      }}
                      placeholder="Drive folder URL or ID"
                      className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    {googleFolders.length > 0 && (
                      <select
                        value={googleFolders.some(folder => folder.id === google.driveFolderId) ? google.driveFolderId : ''}
                        onChange={(e) => {
                          const folder = googleFolders.find(item => item.id === e.target.value)
                          onGoogleChange({ ...google, driveFolderId: folder?.id ?? google.driveFolderId, driveFolderName: folder?.name ?? google.driveFolderName })
                        }}
                        className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                      >
                        <option value="">Choose refreshed folder...</option>
                        {googleFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                      </select>
                    )}
                  </label>
                  <div className="flex gap-1">
                    <button type="button" onClick={onOpenGoogleDriveFolder} disabled={!parseGoogleDriveFolderInput(google.driveFolderId)} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">Open</button>
                    <button type="button" onClick={onLoadGoogleFolders} disabled={refreshingGoogleFolders || !google.token.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                      {refreshingGoogleFolders ? 'Refreshing...' : 'Refresh folders'}
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
                  <label className="text-xs text-zinc-500">
                    New folder
                    <input value={newGoogleFolderName} onChange={(e) => onNewGoogleFolderNameChange(e.target.value)} placeholder="Loupe QA Evidence" className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                  <button type="button" onClick={onCreateGoogleFolder} disabled={creatingGoogleFolder || !google.token.trim() || !newGoogleFolderName.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {creatingGoogleFolder ? 'Creating...' : 'Create folder'}
                  </button>
                </div>

                <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={Boolean(google.updateSheet)} onChange={(e) => onGoogleChange({ ...google, updateSheet: e.target.checked })} className="h-4 w-4 accent-blue-600" />
                  Append every marker to Google Sheet
                </label>
                {google.updateSheet && (
                  <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 p-2">
                    <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                      <label className="text-xs text-zinc-500">
                        Spreadsheet
                        <input
                          value={google.spreadsheetId ?? ''}
                          onChange={(e) => {
                            const spreadsheetId = parseGoogleSpreadsheetInput(e.target.value)
                            const spreadsheet = googleSpreadsheets.find(item => item.id === spreadsheetId)
                            onGoogleChange({ ...google, spreadsheetId: e.target.value, spreadsheetName: spreadsheet?.name ?? '', sheetName: '' })
                          }}
                          onBlur={() => {
                            const spreadsheetId = parseGoogleSpreadsheetInput(google.spreadsheetId)
                            const spreadsheet = googleSpreadsheets.find(item => item.id === spreadsheetId)
                            onGoogleChange({ ...google, spreadsheetId, spreadsheetName: spreadsheet?.name ?? google.spreadsheetName })
                          }}
                          placeholder="Google Sheets URL or ID"
                          className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                        />
                        {googleSpreadsheets.length > 0 && (
                          <select
                            value={googleSpreadsheets.some(sheet => sheet.id === google.spreadsheetId) ? google.spreadsheetId : ''}
                            onChange={(e) => {
                              const spreadsheet = googleSpreadsheets.find(item => item.id === e.target.value)
                              onGoogleChange({ ...google, spreadsheetId: spreadsheet?.id ?? google.spreadsheetId, spreadsheetName: spreadsheet?.name ?? google.spreadsheetName, sheetName: '' })
                            }}
                            className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                          >
                            <option value="">Choose refreshed spreadsheet...</option>
                            {googleSpreadsheets.map(sheet => <option key={sheet.id} value={sheet.id}>{sheet.name}</option>)}
                          </select>
                        )}
                      </label>
                      <div className="flex gap-1">
                        <button type="button" onClick={onOpenGoogleSpreadsheet} disabled={!parseGoogleSpreadsheetInput(google.spreadsheetId)} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">Open</button>
                        <button type="button" onClick={onLoadGoogleSpreadsheets} disabled={refreshingGoogleSpreadsheets || !google.token.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                          {refreshingGoogleSpreadsheets ? 'Refreshing...' : 'Refresh sheets'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
                      <label className="text-xs text-zinc-500">
                        Sheet tab
                        <input value={google.sheetName ?? ''} onChange={(e) => onGoogleChange({ ...google, sheetName: e.target.value })} placeholder="Sheet1" className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                        {googleSheetTabs.length > 0 && (
                          <select value={googleSheetTabs.some(tab => tab.title === google.sheetName) ? google.sheetName : ''} onChange={(e) => onGoogleChange({ ...google, sheetName: e.target.value })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600">
                            <option value="">Choose refreshed tab...</option>
                            {googleSheetTabs.map(tab => <option key={tab.sheetId} value={tab.title}>{tab.title}</option>)}
                          </select>
                        )}
                      </label>
                      <button type="button" onClick={onLoadGoogleSheetTabs} disabled={refreshingGoogleSheetTabs || !google.token.trim() || !google.spreadsheetId?.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                        {refreshingGoogleSheetTabs ? 'Refreshing...' : 'Refresh tabs'}
                      </button>
                    </div>
                  </div>
                )}
                {googleError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{googleError}</div>}
                {googleStatus && <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5 text-xs text-zinc-400">{googleStatus}</div>}
                <div className="mt-2 flex items-center justify-end gap-2">
                  {googleSaved && <span className="text-xs text-emerald-300">Saved</span>}
                  <button type="button" onClick={onSaveGoogleSettings} disabled={savingGoogle} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {savingGoogle ? 'Saving...' : 'Save Google settings'}
                  </button>
                </div>
              </details>

              <details className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
                <summary className="cursor-pointer select-none text-xs font-medium text-zinc-300">GitLab</summary>
                <label className="mt-3 block text-xs text-zinc-500">
                  GitLab base URL
                  <input value={gitlab.baseUrl} onChange={(e) => onGitLabChange({ ...gitlab, baseUrl: e.target.value })} placeholder="https://gitlab.com" className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                </label>
                <div className="mt-2 grid grid-cols-[1fr_180px] gap-2">
                  <div>
                    {gitlab.authType !== 'oauth' && (
                      <label className="text-xs text-zinc-500">
                        GitLab token
                        <input value={gitlab.token} onChange={(e) => onGitLabChange({ ...gitlab, token: e.target.value })} type="password" placeholder="glpat-..." className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                      </label>
                    )}
                  </div>
                  <label className="text-xs text-zinc-500">
                    GitLab auth
                    <select value={gitlab.authType ?? 'pat'} onChange={(e) => onGitLabChange({ ...gitlab, authType: e.target.value as GitLabPublishSettings['authType'] })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600">
                      <option value="pat">Personal access token</option>
                      <option value="oauth">OAuth</option>
                    </select>
                  </label>
                </div>
                {gitlab.authType === 'oauth' && (
                  <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-zinc-500">OAuth client ID<input value={gitlab.oauthClientId ?? ''} onChange={(e) => onGitLabChange({ ...gitlab, oauthClientId: e.target.value })} placeholder="Application ID" className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" /></label>
                      <label className="text-xs text-zinc-500">OAuth client secret<input value={gitlab.oauthClientSecret ?? ''} onChange={(e) => onGitLabChange({ ...gitlab, oauthClientSecret: e.target.value })} type="password" placeholder="Optional for confidential apps" className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" /></label>
                      <label className="text-xs text-zinc-500">Redirect URI<input value={gitlab.oauthRedirectUri ?? 'http://127.0.0.1:38987/oauth/gitlab/callback'} onChange={(e) => onGitLabChange({ ...gitlab, oauthRedirectUri: e.target.value })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" /></label>
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      {gitlab.token.trim() && <span className="text-xs text-emerald-300">Connected</span>}
                      <button type="button" onClick={onConnectGitLabOAuth} disabled={savingGitLab || connectingGitLabOAuth || !gitlab.baseUrl.trim() || !gitlab.oauthClientId?.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                        {connectingGitLabOAuth ? 'Connecting...' : 'Connect OAuth'}
                      </button>
                      {connectingGitLabOAuth && <button type="button" onClick={onCancelGitLabOAuth} className="rounded bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">Cancel OAuth</button>}
                    </div>
                  </div>
                )}
                <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
                  <label className="text-xs text-zinc-500">
                    Project
                    {gitlabProjects.length > 0 ? (
                      <select value={gitlab.projectId} onChange={(e) => onGitLabChange({ ...gitlab, projectId: e.target.value })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600">
                        {!gitlabProjects.some(project => project.pathWithNamespace === gitlab.projectId) && <option value={gitlab.projectId}>{gitlab.projectId || 'Select a project'}</option>}
                        {gitlabProjects.map(project => <option key={project.id} value={project.pathWithNamespace}>{project.nameWithNamespace}</option>)}
                      </select>
                    ) : (
                      <input value={gitlab.projectId} onChange={(e) => onGitLabChange({ ...gitlab, projectId: e.target.value })} placeholder="group/project" className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                    )}
                  </label>
                  <button type="button" onClick={onLoadGitLabProjects} disabled={refreshingGitLabProjects || !gitlab.baseUrl.trim() || !gitlab.token.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {refreshingGitLabProjects ? 'Refreshing...' : 'Refresh projects'}
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-xs text-zinc-500">
                    Labels
                    <input value={gitlabLabelsInput} onChange={(e) => onGitLabLabelsInputChange(e.target.value)} placeholder="loupe, qa-evidence" className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                  <label className="text-xs text-zinc-500">
                    Mention usernames
                    <input value={gitlabMentionsInput} onChange={(e) => onGitLabMentionsInputChange(e.target.value)} placeholder="@qa, @lead" className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                </div>
                <label className="mt-2 block text-xs text-zinc-500">
                  Default GitLab mode
                  <select value={gitlab.mode} onChange={(e) => onGitLabChange({ ...gitlab, mode: e.target.value as GitLabPublishSettings['mode'] })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600">
                    <option value="single-issue">Single issue</option>
                    <option value="per-marker-issue">Issue per marker</option>
                  </select>
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={Boolean(gitlab.confidential)} onChange={(e) => onGitLabChange({ ...gitlab, confidential: e.target.checked })} className="h-4 w-4 accent-blue-600" />
                  Create confidential/internal GitLab issues and notes
                </label>
                <label className="mt-2 block text-xs text-zinc-500">
                  GitLab email lookup
                  <select value={gitlab.emailLookup ?? 'off'} onChange={(e) => onGitLabChange({ ...gitlab, emailLookup: e.target.value as GitLabPublishSettings['emailLookup'] })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600">
                    <option value="off">Off</option>
                    <option value="admin-users-api">Admin users API</option>
                  </select>
                  <span className="mt-1 block text-[11px] leading-4 text-zinc-600">
                    Admin users API calls GitLab /users/:id after member fetch to fill missing emails. Self-managed GitLab usually requires an admin token with api scope.
                  </span>
                </label>
                <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-zinc-300">GitLab users</div>
                      <div className="text-[11px] text-zinc-500">{gitlab.usersFetchedAt ? `Updated ${new Date(gitlab.usersFetchedAt).toLocaleString()}` : 'Not synced yet'}</div>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => onRefreshGitLabUsers(false)} disabled={refreshingGitLabUsers || !gitlab.token.trim() || !gitlab.projectId.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                        {refreshingGitLabUsers ? 'Refreshing...' : 'Refresh users'}
                      </button>
                      <button type="button" onClick={() => onRefreshGitLabUsers(true)} disabled={refreshingGitLabUsers || !gitlab.token.trim() || !gitlab.projectId.trim()} className="rounded bg-emerald-800 px-2.5 py-1.5 text-xs text-emerald-50 hover:bg-emerald-700 disabled:opacity-50">
                        Fetch emails
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 max-h-36 overflow-auto rounded border border-zinc-800 bg-zinc-950">
                    {activeGitLabUsers.length === 0 ? <div className="px-2 py-3 text-xs text-zinc-500">Refresh users after setting a GitLab token and project.</div> : activeGitLabUsers.map(user => (
                      <div key={user.username} className="border-b border-zinc-900 px-2 py-1.5 last:border-b-0">
                        <div className="truncate text-xs text-zinc-200">{user.name || user.username}</div>
                        <div className="truncate text-[11px] text-zinc-600">@{user.username}{user.email ? ` / ${user.email}` : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {gitlabError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{gitlabError}</div>}
                {gitlab.lastUserSyncWarning && <div className="mt-2 rounded border border-yellow-800 bg-yellow-950/40 px-2 py-1.5 text-xs text-yellow-200">{gitlab.lastUserSyncWarning}</div>}
                <div className="mt-2 flex items-center justify-end gap-2">
                  {gitlabSaved && <span className="text-xs text-emerald-300">Saved</span>}
                  <button type="button" onClick={onSaveGitLab} disabled={savingGitLab} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {savingGitLab ? 'Saving...' : 'Save GitLab settings'}
                  </button>
                </div>
              </details>

              <details className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-zinc-300">
                  <span>{t('settings.mentionIdentities.title')}</span>
                  <span className="text-[11px] font-normal text-zinc-500">{t('settings.mentionIdentities.subtitle')}</span>
                </summary>
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-zinc-500">{t('settings.mentionIdentities.help')}</div>
                    <button type="button" onClick={() => onAddMentionIdentity()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">{t('settings.mentionIdentities.addPerson')}</button>
                  </div>
                  <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950">
                    <div className="grid min-w-[920px] grid-cols-[1.1fr_1.2fr_1fr_1fr_1.2fr_72px] border-b border-zinc-800 px-2 py-1.5 text-[11px] font-medium text-zinc-500">
                      <div>{t('settings.mentionIdentities.displayName')}</div>
                      <div>{t('settings.mentionIdentities.email')}</div>
                      <div>{t('settings.mentionIdentities.slackUserId')}</div>
                      <div>{t('settings.mentionIdentities.gitlabUsername')}</div>
                      <div>Google email</div>
                      <div />
                    </div>
                    {mentionIdentities.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-zinc-500">{t('settings.mentionIdentities.empty')}</div>
                    ) : mentionIdentities.map((identity, index) => (
                      <div key={`${identity.id}-${index}`} className="grid min-w-[920px] grid-cols-[1.1fr_1.2fr_1fr_1fr_1.2fr_72px] items-start gap-2 border-b border-zinc-900 px-2 py-1.5 last:border-b-0">
                        <div className="min-w-0">
                          <input value={identity.displayName} onChange={(e) => onUpdateMentionIdentity(index, { displayName: e.target.value })} className="w-full min-w-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600" />
                          <div className="mt-1 flex min-h-5 flex-wrap gap-1">
                            <MentionIdentityBadges identity={identity} />
                          </div>
                        </div>
                        <input value={identity.email ?? ''} onChange={(e) => onUpdateMentionIdentity(index, { email: e.target.value.trim().toLowerCase() || undefined })} placeholder="name@example.com" className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600" />
                        <input value={identity.slackUserId ?? ''} onChange={(e) => onUpdateMentionIdentity(index, { slackUserId: e.target.value.trim() || undefined })} placeholder="U123..." className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600" />
                        <input value={identity.gitlabUsername ? `@${identity.gitlabUsername}` : ''} onChange={(e) => onUpdateMentionIdentity(index, { gitlabUsername: e.target.value.trim().replace(/^@/, '') || undefined })} placeholder="@username" className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600" />
                        <input value={identity.googleEmail ?? ''} onChange={(e) => onUpdateMentionIdentity(index, { googleEmail: e.target.value.trim().toLowerCase() || undefined })} placeholder="name@example.com" className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600" />
                        <button type="button" onClick={() => onRemoveMentionIdentity(index)} className="rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-400 hover:bg-red-950 hover:text-red-100">{t('common.remove')}</button>
                      </div>
                    ))}
                  </div>
                  {activeSlackUsers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeSlackUsers.filter(user => !mentionIdentities.some(identity => identity.slackUserId === user.id)).slice(0, 12).map(user => {
                        const label = user.displayName || user.realName || user.name || user.id
                        return <button key={user.id} type="button" onClick={() => onAddMentionIdentity({ displayName: label, email: user.email, slackUserId: user.id })} className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">{t('settings.mentionIdentities.addSlack', { name: label })}</button>
                      })}
                    </div>
                  )}
                  {activeGitLabUsers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeGitLabUsers.filter(user => !mentionIdentities.some(identity => identity.gitlabUsername === user.username)).slice(0, 12).map(user => (
                        <button key={user.username} type="button" onClick={() => onAddMentionIdentity({ displayName: user.name || user.username, email: user.email, gitlabUsername: user.username })} className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">{t('settings.mentionIdentities.addGitLab', { username: user.username })}</button>
                      ))}
                    </div>
                  )}
                  {mentionIdentitiesError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{mentionIdentitiesError}</div>}
                  {mentionIdentitiesStatus && <div className="mt-2 truncate text-xs text-emerald-300">{mentionIdentitiesStatus}</div>}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    {mentionIdentitiesSaved && <span className="text-xs text-emerald-300">{t('common.saved')}</span>}
                    <button type="button" onClick={onImportMentionIdentities} className="rounded bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">{t('common.import')}</button>
                    <button type="button" onClick={onExportMentionIdentities} className="rounded bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">{t('common.export')}</button>
                    <button type="button" onClick={onSaveMentionIdentities} disabled={savingMentionIdentities} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                      {savingMentionIdentities ? t('common.saving') : t('settings.mentionIdentities.save')}
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}


export const DEFAULT_HOTKEYS: HotkeySettings = { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }
export const DEFAULT_SEVERITIES: SeveritySettings = {
  note: { label: 'note', color: '#a1a1aa' },
  major: { label: 'Critical', color: '#ff4d4f' },
  normal: { label: 'Bug', color: '#f59e0b' },
  minor: { label: 'Polish', color: '#22b8f0' },
  improvement: { label: 'Note', color: '#22c55e' },
  custom1: { label: '', color: '#8b5cf6' },
  custom2: { label: '', color: '#ec4899' },
  custom3: { label: '', color: '#14b8a6' },
  custom4: { label: '', color: '#eab308' },
}
const HOTKEY_SEVERITIES: Array<{ key: keyof HotkeySettings; severity: BugSeverity }> = [
  { key: 'improvement', severity: 'improvement' },
  { key: 'minor', severity: 'minor' },
  { key: 'normal', severity: 'normal' },
  { key: 'major', severity: 'major' },
]
const CUSTOM_SEVERITIES: BugSeverity[] = ['custom1', 'custom2', 'custom3', 'custom4']

function visibleCustomSeverities(severities: SeveritySettings): BugSeverity[] {
  return CUSTOM_SEVERITIES.filter(key => severities[key]?.label?.trim())
}

function labelOrDefault(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.label?.trim() || DEFAULT_SEVERITIES[severity].label
}

function colorOrDefault(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.color || DEFAULT_SEVERITIES[severity].color
}
