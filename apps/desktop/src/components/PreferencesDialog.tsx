import { useEffect, useState } from 'react'
import type { AppLocale, AudioAnalysisSettings, BugSeverity, CommonSessionSettings, GitLabMentionUser, GitLabProject, GitLabPublishSettings, GoogleDriveFolder, GooglePublishSettings, GoogleSheetTab, GoogleSpreadsheet, HotkeySettings, MentionIdentity, SeveritySettings, SlackMentionUser, SlackPublishSettings } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import { AUDIO_ANALYSIS_LANGUAGE_OPTIONS, CHINESE_SCRIPT_OPTIONS, triggerPreset } from '@/lib/audioAnalysisPresets'
import { THIRD_PARTY_SECTIONS } from '@/routes/Legal'

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

function maskSlackToken(value: string): string {
  const token = value.trim()
  if (!token) return ''
  if (token.length <= 10) return '••••'
  return `${token.slice(0, 6)}...${token.slice(-4)}`
}

type Translate = (key: string, vars?: Record<string, string | number>) => string

function SlackSetupGuide({ mode, t }: { mode: 'user' | 'bot'; t: Translate }) {
  const prefix = mode === 'user' ? 'oauth' : 'bot'
  const stepCount = mode === 'user' ? 5 : 6
  return (
    <details className="mt-3 rounded border border-zinc-800 bg-zinc-950/70 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-zinc-200">
        <span>{t(`preferences.slackSetup.${prefix}.title`)}</span>
        <span className="text-[11px] font-normal text-zinc-500">{t('preferences.slackSetup.expandHint')}</span>
      </summary>
      <div className="mt-3 space-y-2">
        {Array.from({ length: stepCount }, (_, index) => index + 1).map(step => (
          <div key={step} className="rounded border border-zinc-800 bg-zinc-900/70 p-2">
            <div className="text-xs font-medium text-zinc-200">
              {t('preferences.slackSetup.stepLabel', { step })} {t(`preferences.slackSetup.${prefix}.step${step}Title`)}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-zinc-500">
              {t(`preferences.slackSetup.${prefix}.step${step}Body`)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded border border-zinc-800 bg-zinc-900/70 p-2">
        <div className="text-xs font-medium text-zinc-200">{t(`preferences.slackSetup.${prefix}.scopesTitle`)}</div>
        <div className="mt-2 grid gap-1.5">
          {(mode === 'user'
            ? ['chatWrite', 'filesWrite', 'usersRead', 'channelsRead', 'groupsRead']
            : ['chatWrite', 'filesWrite', 'channelsRead', 'groupsRead', 'usersRead', 'usersReadEmail', 'chatWritePublic']
          ).map(scope => (
            <div key={scope} className="grid gap-1 rounded bg-zinc-950/70 px-2 py-1.5 text-[11px] leading-5 text-zinc-500 sm:grid-cols-[150px_1fr]">
              <code className="text-zinc-200">{t(`preferences.slackSetup.scope.${scope}.name`)}</code>
              <span>{t(`preferences.slackSetup.scope.${scope}.body`)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded border border-blue-900/50 bg-blue-950/20 px-2 py-1.5 text-[11px] leading-5 text-blue-100/80">
        {t(`preferences.slackSetup.${prefix}.tip`)}
      </div>
    </details>
  )
}

function MentionIdentityBadges({ identity }: { identity: MentionIdentity }) {
  const { t } = useI18n()
  const hasSlack = Boolean(identity.slackUserId)
  const hasGitLab = Boolean(identity.gitlabUsername)
  const hasGoogle = Boolean(identity.googleEmail)
  if (!hasSlack && !hasGitLab && !hasGoogle) {
    return (
      <span className="rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
        {t('settings.mentionIdentities.noMappings')}
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
  audioAnalysis: AudioAnalysisSettings
  audioAnalysisSaved: boolean
  commonSession: CommonSessionSettings
  slack: SlackPublishSettings
  slackSaved: boolean
  startingSlackOAuth: boolean
  refreshingSlackUsers: boolean
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
  onAudioAnalysisChange(value: AudioAnalysisSettings): void
  onSaveAudioAnalysis(value: AudioAnalysisSettings): void
  onAudioAnalysisLanguageChange(language: string): void
  onCommonSessionChange(value: CommonSessionSettings): void
  onSaveCommonSession(value: CommonSessionSettings): void
  onSlackChange(value: SlackPublishSettings): void
  onStartSlackOAuth(): void
  onSaveSlack(): void
  onRefreshSlackUsers(): void
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
  audioAnalysis,
  audioAnalysisSaved,
  commonSession,
  slack,
  slackSaved,
  startingSlackOAuth,
  refreshingSlackUsers,
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
  onAudioAnalysisChange,
  onSaveAudioAnalysis,
  onAudioAnalysisLanguageChange,
  onCommonSessionChange,
  onSaveCommonSession,
  onSlackChange,
  onStartSlackOAuth,
  onSaveSlack,
  onRefreshSlackUsers,
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
  const { t, resolvedLocale } = useI18n()
  const zh = resolvedLocale.startsWith('zh')
  const googleHasOAuthCredentials = Boolean(google.oauthClientId?.trim())
  const [customSlots, setCustomSlots] = useState<BugSeverity[]>(() => visibleCustomSeverities(severities))

  useEffect(() => {
    setCustomSlots(visibleCustomSeverities(severities))
  }, [severities])

  function saveSeverityLabel(severity: BugSeverity) {
    const trimmed = severities[severity]?.label?.trim() ?? ''
    const isCustom = !HOTKEY_SEVERITIES.some(item => item.severity === severity) && severity !== 'note'
    const next = {
      ...severities,
      [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { color: '#8b5cf6' }), label: trimmed || (isCustom ? '' : DEFAULT_SEVERITIES[severity]?.label || severity) },
    }
    if (isCustom && !trimmed) setCustomSlots(customSlots.filter(slot => slot !== severity))
    onSaveSeverities(next)
  }

  function updateSeverity(severity: BugSeverity, patch: Partial<SeveritySettings[BugSeverity]>) {
    onSeveritiesChange({
      ...severities,
      [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { label: severity, color: '#8b5cf6' }), ...patch },
    })
  }

  function addCustomLabel() {
    let index = 1
    while (severities[`custom${index}`]) index += 1
    const slot = `custom${index}`
    const colors = ['#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#f97316', '#06b6d4', '#84cc16', '#f43f5e']
    const customCount = Object.keys(severities).filter(key => key.startsWith('custom')).length
    const next = {
      ...severities,
      [slot]: { label: `tag ${customCount + 1}`, color: colors[customCount % colors.length] },
    }
    setCustomSlots([...customSlots, slot])
    onSaveSeverities(next)
  }

  function removeCustomLabel(severity: BugSeverity) {
    const next = {
      ...severities,
      [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { color: '#8b5cf6' }), label: '' },
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
              <div className="text-sm font-medium text-zinc-200">{zh ? '\u5e38\u7528\u8cc7\u8a0a' : 'Common session info'}</div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">
                {zh ? '\u7ba1\u7406\u5e73\u53f0\u3001\u5c08\u6848\u3001\u6e2c\u8a66\u4eba\u54e1\u5e38\u7528\u503c\uff0c\u65b0 session \u6703\u81ea\u52d5\u5e36\u5165\u4e0a\u6b21\u4f7f\u7528\u7684\u5e73\u53f0\u3001\u5c08\u6848\u8207\u6e2c\u8a66\u4eba\u54e1\u3002' : 'Manage common platforms, projects, and testers. New sessions reuse the last platform, project, and tester.'}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ['platforms', zh ? '\u5e73\u53f0' : 'Platforms'],
                ['projects', zh ? '\u5c08\u6848' : 'Projects'],
                ['testers', zh ? '\u6e2c\u8a66\u4eba\u54e1' : 'Testers'],
              ] as const).map(([key, label]) => (
                <label key={key} className="text-xs text-zinc-400">
                  {label}
                  <textarea
                    value={(commonSession[key] ?? []).join('\n')}
                    rows={5}
                    onChange={(e) => onCommonSessionChange({
                      ...commonSession,
                      [key]: e.target.value.split(/[,;\n]+/).map(item => item.trim()).filter(Boolean),
                    })}
                    onBlur={() => onSaveCommonSession(commonSession)}
                    className="mt-1 w-full resize-y rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="grid gap-3 border-b border-zinc-800 py-4 lg:grid-cols-[220px_1fr]">
            <div>
              <div className="text-sm font-medium text-zinc-200">{zh ? '語音辨識' : 'Speech recognition'}</div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">
                {zh ? '設定語音自動打點的預設語言與觸發詞。切換語言會套用建議觸發詞，之後仍可手動修改。' : 'Set default language and trigger words for audio auto-markers. Changing language applies suggested triggers, which you can still edit.'}
              </div>
            </div>
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-zinc-400">
                  {zh ? '辨識語言' : 'Recognition language'}
                  <select
                    value={audioAnalysis.language || 'auto'}
                    onChange={(e) => onAudioAnalysisLanguageChange(e.target.value)}
                    className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                  >
                    {AUDIO_ANALYSIS_LANGUAGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {(audioAnalysis.language || 'auto') === 'zh' && (
                  <label className="block text-xs text-zinc-400">
                    {zh ? '中文輸出' : 'Chinese output'}
                    <select
                      value={audioAnalysis.chineseScript ?? 'zh-TW'}
                      onChange={(e) => {
                        const next = { ...audioAnalysis, chineseScript: e.target.value as AudioAnalysisSettings['chineseScript'] }
                        onAudioAnalysisChange(next)
                        onSaveAudioAnalysis(next)
                      }}
                      className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                    >
                      {CHINESE_SCRIPT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <label className="block text-xs text-zinc-400">
                {zh ? '觸發詞' : 'Trigger words'}
                <textarea
                  value={audioAnalysis.triggerKeywords}
                  rows={3}
                  onChange={(e) => onAudioAnalysisChange({ ...audioAnalysis, triggerKeywords: e.target.value })}
                  onBlur={() => onSaveAudioAnalysis({
                    ...audioAnalysis,
                    triggerKeywords: audioAnalysis.triggerKeywords.trim() || triggerPreset(audioAnalysis.language || 'auto').words,
                  })}
                  className="mt-1 w-full resize-y rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                />
                <span className="mt-1 block text-[11px] leading-5 text-zinc-500">
                  {triggerPreset(audioAnalysis.language || 'auto').hint}
                </span>
              </label>
              {audioAnalysisSaved && <div className="text-xs text-emerald-300">{t('common.saved')}</div>}
            </div>
          </section>

          <section className="grid gap-3 border-b border-zinc-800 py-4 lg:grid-cols-[220px_1fr]">
            <div>
              <div className="text-sm font-medium text-zinc-200">{t('preferences.markerDefaults')}</div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">{t('preferences.markerDefaultsHelp')}</div>
              <button type="button" onClick={onResetLabels} className="mt-3 rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">
                {t('preferences.reset')}
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
                          const next = { ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { label: severity }), color: e.target.value } }
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
                  <span className="text-xs font-medium text-zinc-300">{t('preferences.customLabels')}</span>
                  <button type="button" onClick={addCustomLabel} className="inline-flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-sm text-zinc-200 hover:bg-zinc-700" title={t('common.add')}>
                    +
                  </button>
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
                            const next = { ...severities, [severity]: { ...(severities[severity] ?? DEFAULT_SEVERITIES[severity] ?? { label: severity }), color: e.target.value } }
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
              <div className="text-sm font-medium text-zinc-200">{t('preferences.publish')}</div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">{t('preferences.publishHelp')}</div>
            </div>
            <div className="min-w-0 space-y-3">
              <details className="min-w-0 overflow-hidden rounded border border-zinc-800 bg-zinc-950/50 p-3">
                <summary className="cursor-pointer select-none text-xs font-medium text-zinc-300">{t('preferences.slack')}</summary>
                <div className="mt-3 rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs leading-5 text-amber-100/80">
                  <div className="font-medium text-amber-100">{t('preferences.slackMultiCompanyTitle')}</div>
                  <div className="mt-1">{t('preferences.slackMultiCompanyHelp')}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href="https://docs.slack.dev/distribution" className="text-amber-200 underline" target="_blank" rel="noreferrer">{t('preferences.slackDistributionDocs')}</a>
                    <a href="https://docs.slack.dev/authentication/installing-with-oauth" className="text-amber-200 underline" target="_blank" rel="noreferrer">{t('preferences.slackOauthDocs')}</a>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(['user', 'bot'] as const).map(mode => {
                    const active = (slack.publishIdentity ?? 'user') === mode
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onSlackChange({ ...slack, publishIdentity: mode })}
                        className={`rounded border p-3 text-left ${active ? 'border-blue-600 bg-blue-950/30 text-blue-100' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-900'}`}
                      >
                        <span className="block text-sm font-medium">{mode === 'user' ? t('preferences.slackOauthMode') : t('preferences.slackBotMode')}</span>
                        <span className="mt-1 block text-xs leading-5">{mode === 'user' ? t('preferences.slackOauthModeHelp') : t('preferences.slackBotModeHelp')}</span>
                      </button>
                    )
                  })}
                </div>
                <SlackSetupGuide mode={(slack.publishIdentity ?? 'user') === 'bot' ? 'bot' : 'user'} t={t} />

                {(slack.publishIdentity ?? 'user') === 'user' ? (
                  <>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-950 p-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs text-zinc-500">
                          {slack.oauthUserId
                            ? t('preferences.slackConnectedAs', { user: slack.oauthUserId, workspace: slack.oauthTeamName ? t('preferences.slackWorkspaceSuffix', { workspace: slack.oauthTeamName }) : '' })
                            : t('preferences.slackChooseAccount')}
                        </div>
                        {slack.oauthUserScopes && slack.oauthUserScopes.length > 0 && (
                          <div className="mt-1 truncate text-[11px] text-zinc-600">{t('preferences.slackScopes')}: {slack.oauthUserScopes.join(', ')}</div>
                        )}
                        {(slackSaved || slack.oauthConnectedAt) && (
                          <div className="mt-1 text-[11px] text-emerald-300">
                            {slackSaved ? t('preferences.slackConnected') : t('preferences.connectedAt', { date: new Date(slack.oauthConnectedAt ?? '').toLocaleString() })}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {(slack.oauthUserId || slack.userToken?.trim()) && (
                          <span className="text-xs text-emerald-300">{t('common.connected')}</span>
                        )}
                        <button type="button" onClick={onStartSlackOAuth} disabled={startingSlackOAuth} className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:opacity-50">
                          {startingSlackOAuth ? t('preferences.waiting') : slack.oauthUserId ? t('preferences.reconnectSlack') : t('preferences.connectSlack')}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="min-w-0 text-xs text-zinc-500">
                        {t('preferences.oauthClientId')}
                        <input
                          value={slack.oauthClientId ?? ''}
                          onChange={(e) => onSlackChange({ ...slack, oauthClientId: e.target.value })}
                          placeholder={t('preferences.slackClientIdPlaceholder')}
                          className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </label>
                      <label className="min-w-0 text-xs text-zinc-500">
                        {t('preferences.oauthClientSecret')}
                        <input
                          value={slack.oauthClientSecret ?? ''}
                          onChange={(e) => onSlackChange({ ...slack, oauthClientSecret: e.target.value })}
                          type="password"
                          placeholder={t('preferences.slackClientSecretPlaceholder')}
                          className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </label>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      {t('preferences.redirectUriFixed')} <span className="font-mono text-zinc-400">loupe://slack-oauth</span>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-3">
                    <div className="text-xs leading-5 text-zinc-500">{t('preferences.slackBotTokenHelp')}</div>
                    <label className="mt-3 block min-w-0 text-xs text-zinc-500">
                      {t('preferences.slackBotToken')}
                      <input
                        value={slack.botToken}
                        onChange={(e) => onSlackChange({ ...slack, publishIdentity: 'bot', botToken: e.target.value })}
                        type="password"
                        placeholder="xoxb-..."
                        className="mt-1 w-full rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </label>
                    <div className="mt-2 text-[11px] text-zinc-600">
                      {slack.botToken.trim() ? t('preferences.slackBotTokenSavedAs', { token: maskSlackToken(slack.botToken) }) : t('preferences.slackBotTokenMissing')}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button type="button" onClick={onSaveSlack} className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-600">
                        {t('preferences.saveSlackSettings')}
                      </button>
                    </div>
                  </div>
                )}
                {slackError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{slackError}</div>}
                <div className="mt-3 rounded border border-zinc-800 bg-zinc-950">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 px-2 py-1.5">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-300">{t('preferences.slackUsers')}</div>
                      <div className="text-[11px] text-zinc-500">{slack.usersFetchedAt ? t('preferences.updatedAt', { date: new Date(slack.usersFetchedAt).toLocaleString() }) : t('preferences.notSyncedYet')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={onRefreshSlackUsers}
                      disabled={refreshingSlackUsers || ((slack.publishIdentity ?? 'user') === 'user' ? !slack.userToken?.trim() : !slack.botToken.trim())}
                      className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {refreshingSlackUsers ? t('preferences.refreshing') : t('preferences.refreshUsers')}
                    </button>
                  </div>
                  <div className="max-h-28 overflow-auto">
                    {activeSlackUsers.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-zinc-500">{t('preferences.refreshSlackUsersHelp')}</div>
                    ) : activeSlackUsers.map(user => {
                        const label = user.displayName || user.realName || user.name || user.id
                        return (
                          <div key={user.id} className="border-b border-zinc-900 px-2 py-1.5 last:border-b-0">
                            <div className="truncate text-xs text-zinc-200">{label}</div>
                            <div className="truncate text-[11px] text-zinc-600">{user.id}{user.name ? ` / @${user.name}` : ''}{user.email ? ` / ${user.email}` : ''}</div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              </details>

              <details className="min-w-0 overflow-hidden rounded border border-zinc-800 bg-zinc-950/50 p-3">
                <summary className="cursor-pointer select-none text-xs font-medium text-zinc-300">{t('preferences.googleDrive')}</summary>
                <div className={`mt-3 break-words rounded border px-2 py-2 text-xs ${googleHasOAuthCredentials ? 'border-zinc-800 bg-zinc-950/60 text-zinc-500' : 'border-amber-800 bg-amber-950/30 text-amber-100'}`}>
                  {googleHasOAuthCredentials
                    ? t('preferences.googleOauthReady', { uri: google.oauthRedirectUri || 'http://127.0.0.1:38988/oauth/google/callback' })
                    : t('preferences.googleOauthMissingHelp', { uri: google.oauthRedirectUri || 'http://127.0.0.1:38988/oauth/google/callback' })}
                </div>
                <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <div className="text-xs font-medium text-zinc-300">{t('preferences.googleOauthCredentials')}</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="min-w-0 text-xs text-zinc-500">
                      {t('preferences.oauthClientId')}
                      <input
                        value={google.oauthClientId ?? ''}
                        onChange={(e) => onGoogleChange({ ...google, oauthClientId: e.target.value })}
                        placeholder={t('preferences.googleClientIdPlaceholder')}
                        className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </label>
                    <label className="min-w-0 text-xs text-zinc-500">
                      {t('preferences.oauthClientSecret')}
                      <input
                        value={google.oauthClientSecret ?? ''}
                        onChange={(e) => onGoogleChange({ ...google, oauthClientSecret: e.target.value })}
                        type="password"
                        placeholder={t('preferences.googleClientSecretPlaceholder')}
                        className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </label>
                  </div>
                  <div className="mt-2 text-[11px] leading-5 text-zinc-500">{t('preferences.googleOauthCredentialHelp')}</div>
                </div>
                <div className="mt-2 break-all rounded bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-500">
                  {t('preferences.redirectUri')}: {google.oauthRedirectUri || 'http://127.0.0.1:38988/oauth/google/callback'}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {google.token.trim() && <span className="text-xs text-emerald-300">{google.accountEmail ? t('preferences.googleConnectedAs', { email: google.accountEmail }) : t('common.connected')}</span>}
                  <button type="button" onClick={onConnectGoogleOAuth} disabled={connectingGoogleOAuth || !googleHasOAuthCredentials} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {connectingGoogleOAuth ? t('preferences.connecting') : t('preferences.connectGoogle')}
                  </button>
                  {connectingGoogleOAuth && (
                    <button type="button" onClick={onCancelGoogleOAuth} className="rounded bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                      {t('preferences.cancelOAuth')}
                    </button>
                  )}
                </div>

                <div className="mt-3 grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="min-w-0 text-xs text-zinc-500">
                    {t('preferences.driveFolder')}
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
                      placeholder={t('preferences.driveFolderPlaceholder')}
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
                        <option value="">{t('preferences.chooseRefreshedFolder')}</option>
                        {googleFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                      </select>
                    )}
                  </label>
                  <div className="flex flex-wrap justify-end gap-1">
                    <button type="button" onClick={onOpenGoogleDriveFolder} disabled={!parseGoogleDriveFolderInput(google.driveFolderId)} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">{t('preferences.open')}</button>
                    <button type="button" onClick={onLoadGoogleFolders} disabled={refreshingGoogleFolders || !google.token.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                      {refreshingGoogleFolders ? t('preferences.refreshing') : t('preferences.refreshFolders')}
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="min-w-0 text-xs text-zinc-500">
                    {t('preferences.newFolder')}
                    <input value={newGoogleFolderName} onChange={(e) => onNewGoogleFolderNameChange(e.target.value)} placeholder={t('preferences.newFolderPlaceholder')} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                  <button type="button" onClick={onCreateGoogleFolder} disabled={creatingGoogleFolder || !google.token.trim() || !newGoogleFolderName.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {creatingGoogleFolder ? t('preferences.creating') : t('preferences.createFolder')}
                  </button>
                </div>

                <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={Boolean(google.updateSheet)} onChange={(e) => onGoogleChange({ ...google, updateSheet: e.target.checked })} className="h-4 w-4 accent-blue-600" />
                  {t('preferences.appendEveryMarkerToSheet')}
                </label>
                {google.updateSheet && (
                  <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 p-2">
                    <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <label className="min-w-0 text-xs text-zinc-500">
                        {t('preferences.spreadsheet')}
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
                          placeholder={t('preferences.spreadsheetPlaceholder')}
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
                            <option value="">{t('preferences.chooseRefreshedSpreadsheet')}</option>
                            {googleSpreadsheets.map(sheet => <option key={sheet.id} value={sheet.id}>{sheet.name}</option>)}
                          </select>
                        )}
                      </label>
                      <div className="flex flex-wrap justify-end gap-1">
                        <button type="button" onClick={onOpenGoogleSpreadsheet} disabled={!parseGoogleSpreadsheetInput(google.spreadsheetId)} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">{t('preferences.open')}</button>
                        <button type="button" onClick={onLoadGoogleSpreadsheets} disabled={refreshingGoogleSpreadsheets || !google.token.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                          {refreshingGoogleSpreadsheets ? t('preferences.refreshing') : t('preferences.refreshSheets')}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <label className="min-w-0 text-xs text-zinc-500">
                        {t('preferences.sheetTab')}
                        <input value={google.sheetName ?? ''} onChange={(e) => onGoogleChange({ ...google, sheetName: e.target.value })} placeholder={t('preferences.sheetTabPlaceholder')} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                        {googleSheetTabs.length > 0 && (
                          <select value={googleSheetTabs.some(tab => tab.title === google.sheetName) ? google.sheetName : ''} onChange={(e) => onGoogleChange({ ...google, sheetName: e.target.value })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600">
                            <option value="">{t('preferences.chooseRefreshedTab')}</option>
                            {googleSheetTabs.map(tab => <option key={tab.sheetId} value={tab.title}>{tab.title}</option>)}
                          </select>
                        )}
                      </label>
                      <button type="button" onClick={onLoadGoogleSheetTabs} disabled={refreshingGoogleSheetTabs || !google.token.trim() || !google.spreadsheetId?.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                        {refreshingGoogleSheetTabs ? t('preferences.refreshing') : t('preferences.refreshTabs')}
                      </button>
                    </div>
                  </div>
                )}
                {googleError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{googleError}</div>}
                {googleStatus && <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5 text-xs text-zinc-400">{googleStatus}</div>}
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {googleSaved && <span className="text-xs text-emerald-300">{t('common.saved')}</span>}
                  <button type="button" onClick={onSaveGoogleSettings} disabled={savingGoogle} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {savingGoogle ? t('common.saving') : t('preferences.saveGoogleSettings')}
                  </button>
                </div>
              </details>

              <details className="min-w-0 overflow-hidden rounded border border-zinc-800 bg-zinc-950/50 p-3">
                <summary className="cursor-pointer select-none text-xs font-medium text-zinc-300">{t('preferences.gitlab')}</summary>
                <label className="mt-3 block min-w-0 text-xs text-zinc-500">
                  {t('preferences.gitlabBaseUrl')}
                  <input value={gitlab.baseUrl} onChange={(e) => onGitLabChange({ ...gitlab, baseUrl: e.target.value })} placeholder={t('preferences.gitlabBaseUrlPlaceholder')} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                </label>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
                  <div className="min-w-0">
                    {gitlab.authType !== 'oauth' && (
                      <label className="min-w-0 text-xs text-zinc-500">
                        {t('preferences.gitlabToken')}
                        <input value={gitlab.token} onChange={(e) => onGitLabChange({ ...gitlab, token: e.target.value })} type="password" placeholder={t('preferences.gitlabTokenPlaceholder')} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                      </label>
                    )}
                  </div>
                  <label className="min-w-0 text-xs text-zinc-500">
                    {t('preferences.gitlabAuth')}
                    <select value={gitlab.authType ?? 'pat'} onChange={(e) => onGitLabChange({ ...gitlab, authType: e.target.value as GitLabPublishSettings['authType'] })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600">
                      <option value="pat">{t('preferences.personalAccessToken')}</option>
                      <option value="oauth">OAuth</option>
                    </select>
                  </label>
                </div>
                {gitlab.authType === 'oauth' && (
                  <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 p-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="min-w-0 text-xs text-zinc-500">{t('preferences.oauthClientId')}<input value={gitlab.oauthClientId ?? ''} onChange={(e) => onGitLabChange({ ...gitlab, oauthClientId: e.target.value })} placeholder={t('preferences.applicationIdPlaceholder')} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" /></label>
                      <label className="min-w-0 text-xs text-zinc-500">{t('preferences.oauthClientSecret')}<input value={gitlab.oauthClientSecret ?? ''} onChange={(e) => onGitLabChange({ ...gitlab, oauthClientSecret: e.target.value })} type="password" placeholder={t('preferences.optionalConfidentialPlaceholder')} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" /></label>
                      <div className="min-w-0 text-xs text-zinc-500">
                        {t('preferences.redirectUri')}
                        <div className="mt-1 break-all rounded bg-zinc-950 px-2 py-1.5 font-mono text-[11px] text-zinc-400">loupe://gitlab-oauth</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                      {gitlab.token.trim() && <span className="text-xs text-emerald-300">{t('common.connected')}</span>}
                      <button type="button" onClick={onConnectGitLabOAuth} disabled={savingGitLab || connectingGitLabOAuth || !gitlab.baseUrl.trim() || !gitlab.oauthClientId?.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                        {connectingGitLabOAuth ? t('preferences.connecting') : t('preferences.connectOAuth')}
                      </button>
                      {connectingGitLabOAuth && <button type="button" onClick={onCancelGitLabOAuth} className="rounded bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">{t('preferences.cancelOAuth')}</button>}
                    </div>
                  </div>
                )}
                <div className="mt-2 grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="min-w-0 text-xs text-zinc-500">
                    {t('preferences.project')}
                    {gitlabProjects.length > 0 ? (
                      <select value={gitlab.projectId} onChange={(e) => onGitLabChange({ ...gitlab, projectId: e.target.value })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600">
                        {!gitlabProjects.some(project => project.pathWithNamespace === gitlab.projectId) && <option value={gitlab.projectId}>{gitlab.projectId || t('preferences.selectProject')}</option>}
                        {gitlabProjects.map(project => <option key={project.id} value={project.pathWithNamespace}>{project.nameWithNamespace}</option>)}
                      </select>
                    ) : (
                      <input value={gitlab.projectId} onChange={(e) => onGitLabChange({ ...gitlab, projectId: e.target.value })} placeholder={t('preferences.gitlabProjectPlaceholder')} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                    )}
                  </label>
                  <button type="button" onClick={onLoadGitLabProjects} disabled={refreshingGitLabProjects || !gitlab.baseUrl.trim() || !gitlab.token.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {refreshingGitLabProjects ? t('preferences.refreshing') : t('preferences.refreshProjects')}
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="min-w-0 text-xs text-zinc-500">
                    {t('preferences.labels')}
                    <input value={gitlabLabelsInput} onChange={(e) => onGitLabLabelsInputChange(e.target.value)} placeholder={t('preferences.gitlabLabelsPlaceholder')} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                  <label className="min-w-0 text-xs text-zinc-500">
                    {t('preferences.mentionUsernames')}
                    <input value={gitlabMentionsInput} onChange={(e) => onGitLabMentionsInputChange(e.target.value)} placeholder={t('preferences.gitlabMentionsPlaceholder')} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                </div>
                <label className="mt-2 block text-xs text-zinc-500">
                  {t('preferences.defaultGitLabMode')}
                  <select value={gitlab.mode} onChange={(e) => onGitLabChange({ ...gitlab, mode: e.target.value as GitLabPublishSettings['mode'] })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600">
                    <option value="single-issue">{t('preferences.singleIssue')}</option>
                    <option value="per-marker-issue">{t('preferences.issuePerMarker')}</option>
                  </select>
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={Boolean(gitlab.confidential)} onChange={(e) => onGitLabChange({ ...gitlab, confidential: e.target.checked })} className="h-4 w-4 accent-blue-600" />
                  {t('preferences.gitlabConfidential')}
                </label>
                <label className="mt-2 block text-xs text-zinc-500">
                  {t('preferences.gitlabEmailLookup')}
                  <select value={gitlab.emailLookup ?? 'off'} onChange={(e) => onGitLabChange({ ...gitlab, emailLookup: e.target.value as GitLabPublishSettings['emailLookup'] })} className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600">
                    <option value="off">{t('preferences.off')}</option>
                    <option value="admin-users-api">{t('preferences.adminUsersApi')}</option>
                  </select>
                  <span className="mt-1 block text-[11px] leading-4 text-zinc-600">
                    {t('preferences.gitlabEmailLookupHelp')}
                  </span>
                </label>
                <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-300">{t('preferences.gitlabUsers')}</div>
                      <div className="text-[11px] text-zinc-500">{gitlab.usersFetchedAt ? t('preferences.updatedAt', { date: new Date(gitlab.usersFetchedAt).toLocaleString() }) : t('preferences.notSyncedYet')}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      <button type="button" onClick={() => onRefreshGitLabUsers(false)} disabled={refreshingGitLabUsers || !gitlab.token.trim() || !gitlab.projectId.trim()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                        {refreshingGitLabUsers ? t('preferences.refreshing') : t('preferences.refreshUsers')}
                      </button>
                      <button type="button" onClick={() => onRefreshGitLabUsers(true)} disabled={refreshingGitLabUsers || !gitlab.token.trim() || !gitlab.projectId.trim()} className="rounded bg-emerald-800 px-2.5 py-1.5 text-xs text-emerald-50 hover:bg-emerald-700 disabled:opacity-50">
                        {t('preferences.fetchEmails')}
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 max-h-36 overflow-auto rounded border border-zinc-800 bg-zinc-950">
                    {activeGitLabUsers.length === 0 ? <div className="px-2 py-3 text-xs text-zinc-500">{t('preferences.refreshGitLabUsersHelp')}</div> : activeGitLabUsers.map(user => (
                      <div key={user.username} className="border-b border-zinc-900 px-2 py-1.5 last:border-b-0">
                        <div className="truncate text-xs text-zinc-200">{user.name || user.username}</div>
                        <div className="truncate text-[11px] text-zinc-600">@{user.username}{user.email ? ` / ${user.email}` : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {gitlabError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{gitlabError}</div>}
                {gitlab.lastUserSyncWarning && <div className="mt-2 rounded border border-yellow-800 bg-yellow-950/40 px-2 py-1.5 text-xs text-yellow-200">{gitlab.lastUserSyncWarning}</div>}
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {gitlabSaved && <span className="text-xs text-emerald-300">{t('common.saved')}</span>}
                  <button type="button" onClick={onSaveGitLab} disabled={savingGitLab} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {savingGitLab ? t('common.saving') : t('preferences.saveGitLabSettings')}
                  </button>
                </div>
              </details>

              <details className="min-w-0 overflow-hidden rounded border border-zinc-800 bg-zinc-950/50 p-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-xs font-medium text-zinc-300">
                  <span>{t('settings.mentionIdentities.title')}</span>
                  <span className="text-[11px] font-normal text-zinc-500">{t('settings.mentionIdentities.subtitle')}</span>
                </summary>
                <div className="mt-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-[11px] text-zinc-500">{t('settings.mentionIdentities.help')}</div>
                    <button type="button" onClick={() => onAddMentionIdentity()} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700">{t('settings.mentionIdentities.addPerson')}</button>
                  </div>
                  <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950">
                    <div className="grid min-w-[920px] grid-cols-[1.1fr_1.2fr_1fr_1fr_1.2fr_72px] border-b border-zinc-800 px-2 py-1.5 text-[11px] font-medium text-zinc-500">
                      <div>{t('settings.mentionIdentities.displayName')}</div>
                      <div>{t('settings.mentionIdentities.email')}</div>
                      <div>{t('settings.mentionIdentities.slackUserId')}</div>
                      <div>{t('settings.mentionIdentities.gitlabUsername')}</div>
                      <div>{t('settings.mentionIdentities.googleEmail')}</div>
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
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
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

          <section className="mt-4 border-t border-zinc-800 pt-4">
            <div className="text-sm font-medium text-zinc-200">{t('legal.title')}</div>
            <div className="mt-1 text-xs leading-5 text-zinc-500">{t('legal.noticeBody')}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {THIRD_PARTY_SECTIONS.map(section => (
                <details key={section.titleKey} className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
                  <summary className="cursor-pointer select-none text-xs font-medium text-zinc-300">{t(section.titleKey)}</summary>
                  <div className="mt-2 space-y-2">
                    {section.items.map(item => (
                      <div key={item.name} className="text-[11px] leading-5 text-zinc-500">
                        <div className="font-medium text-zinc-300">{item.name} <span className="text-zinc-600">/ {item.license}</span></div>
                        <div>{t(item.usageKey)}</div>
                        <a href={item.source} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">{item.source}</a>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}


export const DEFAULT_HOTKEYS: HotkeySettings = { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }
export const DEFAULT_SEVERITIES: SeveritySettings = {
  note: { label: 'default', color: '#a1a1aa' },
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
function visibleCustomSeverities(severities: SeveritySettings): BugSeverity[] {
  return Object.keys(severities)
    .filter(key => !HOTKEY_SEVERITIES.some(item => item.severity === key) && key !== 'note' && severities[key]?.label?.trim())
    .sort((a, b) => {
      const aNum = Number(a.match(/^custom(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
      const bNum = Number(b.match(/^custom(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
      return aNum === bNum ? a.localeCompare(b) : aNum - bNum
    })
}

function labelOrDefault(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.label?.trim() || DEFAULT_SEVERITIES[severity]?.label || severity
}

function colorOrDefault(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.color || DEFAULT_SEVERITIES[severity]?.color || '#a1a1aa'
}
