import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import type { AppLocale, AudioAnalysisSettings, BugSeverity, GitLabPublishSettings, HotkeySettings, Session, SeveritySettings, SlackPublishSettings, ToolCheck } from '@shared/types'
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

interface PreferencesDialogProps {
  locale: AppLocale
  localeOptions: Array<{ value: AppLocale; label: string }>
  exportRoot: string
  hotkeys: HotkeySettings
  severities: SeveritySettings
  audioAnalysis: AudioAnalysisSettings
  slack: SlackPublishSettings
  slackSaved: boolean
  startingSlackOAuth: boolean
  slackError: string
  gitlab: GitLabPublishSettings
  gitlabLabelsInput: string
  gitlabMentionsInput: string
  savingGitLab: boolean
  gitlabSaved: boolean
  gitlabError: string
  onLocaleChange(locale: AppLocale): void
  onExportRootChange(value: string): void
  onSaveExportRoot(): void
  onChooseExportRoot(): void
  onHotkeysChange(value: HotkeySettings): void
  onSaveHotkeys(value: HotkeySettings): void
  onSeveritiesChange(value: SeveritySettings): void
  onSaveSeverities(value: SeveritySettings): void
  onAudioAnalysisChange(value: AudioAnalysisSettings): void
  onSaveAudioAnalysis(value: AudioAnalysisSettings): void
  onResetLabels(): void
  onStartSlackOAuth(): void
  onGitLabChange(value: GitLabPublishSettings): void
  onGitLabLabelsInputChange(value: string): void
  onGitLabMentionsInputChange(value: string): void
  onSaveGitLab(): void
  onClose(): void
}

function PreferencesDialog({
  locale,
  localeOptions,
  exportRoot,
  hotkeys,
  severities,
  audioAnalysis,
  slack,
  slackSaved,
  startingSlackOAuth,
  slackError,
  gitlab,
  gitlabLabelsInput,
  gitlabMentionsInput,
  savingGitLab,
  gitlabSaved,
  gitlabError,
  onLocaleChange,
  onExportRootChange,
  onSaveExportRoot,
  onChooseExportRoot,
  onHotkeysChange,
  onSaveHotkeys,
  onSeveritiesChange,
  onSaveSeverities,
  onAudioAnalysisChange,
  onSaveAudioAnalysis,
  onResetLabels,
  onStartSlackOAuth,
  onGitLabChange,
  onGitLabLabelsInputChange,
  onGitLabMentionsInputChange,
  onSaveGitLab,
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
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
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
              <div className="text-sm font-medium text-zinc-200">Audio analysis</div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">Offline QA microphone transcription with faster-whisper.</div>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-zinc-400">
                Language
                <input
                  value={audioAnalysis.language}
                  onChange={(e) => onAudioAnalysisChange({ ...audioAnalysis, language: e.target.value })}
                  onBlur={() => onSaveAudioAnalysis({ ...audioAnalysis, language: audioAnalysis.language.trim() || 'auto' })}
                  placeholder="auto, zh, en"
                  className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                Marker trigger keywords
                <input
                  value={audioAnalysis.triggerKeywords}
                  onChange={(e) => onAudioAnalysisChange({ ...audioAnalysis, triggerKeywords: e.target.value })}
                  onBlur={() => onSaveAudioAnalysis({ ...audioAnalysis, triggerKeywords: audioAnalysis.triggerKeywords.trim() })}
                  placeholder="記錄, 紀錄, record, mark"
                  className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                />
                <div className="mt-1 text-[11px] leading-4 text-zinc-500">Auto markers trigger only when a keyword is spoken near a label, for example "記錄 Bug" or "record Critical".</div>
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
            <div>
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
              </details>

              <details className="mt-3 rounded border border-zinc-800 bg-zinc-950/50 p-3">
                <summary className="cursor-pointer select-none text-xs font-medium text-zinc-300">GitLab</summary>
                <div className="mt-3 grid grid-cols-[1fr_180px] gap-2">
                  <label className="text-xs text-zinc-500">
                    GitLab base URL
                    <input value={gitlab.baseUrl} onChange={(e) => onGitLabChange({ ...gitlab, baseUrl: e.target.value })} placeholder="https://gitlab.com" className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                  <label className="text-xs text-zinc-500">
                    Project ID or path
                    <input value={gitlab.projectId} onChange={(e) => onGitLabChange({ ...gitlab, projectId: e.target.value })} placeholder="group/project" className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                  </label>
                </div>
                <label className="mt-2 block text-xs text-zinc-500">
                  GitLab token
                  <input value={gitlab.token} onChange={(e) => onGitLabChange({ ...gitlab, token: e.target.value })} type="password" placeholder="glpat-..." className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600" />
                </label>
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
                {gitlabError && <div className="mt-2 rounded border border-red-800 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">{gitlabError}</div>}
                <div className="mt-2 flex items-center justify-end gap-2">
                  {gitlabSaved && <span className="text-xs text-emerald-300">Saved</span>}
                  <button type="button" onClick={onSaveGitLab} disabled={savingGitLab} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
                    {savingGitLab ? 'Saving...' : 'Save GitLab settings'}
                  </button>
                </div>
              </details>
            </div>
          </section>
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
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisSettings>(DEFAULT_AUDIO_ANALYSIS)
  const [slack, setSlack] = useState<SlackPublishSettings>({ botToken: '', userToken: '', publishIdentity: 'user', channelId: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: '', oauthUserId: '', oauthTeamId: '', oauthTeamName: '', oauthConnectedAt: null, oauthUserScopes: [], channels: [], channelsFetchedAt: null, mentionUserIds: [], mentionAliases: {}, mentionUsers: [], usersFetchedAt: null })
  const [slackSaved, setSlackSaved] = useState(false)
  const [startingSlackOAuth, setStartingSlackOAuth] = useState(false)
  const [slackError, setSlackError] = useState('')
  const [gitlab, setGitLab] = useState<GitLabPublishSettings>({ baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: ['loupe', 'qa-evidence'], confidential: false, mentionUsernames: [] })
  const [gitlabLabelsInput, setGitLabLabelsInput] = useState('loupe, qa-evidence')
  const [gitlabMentionsInput, setGitLabMentionsInput] = useState('')
  const [savingGitLab, setSavingGitLab] = useState(false)
  const [gitlabSaved, setGitLabSaved] = useState(false)
  const [gitlabError, setGitLabError] = useState('')

  useEffect(() => { api.doctor().then(setChecks) }, [])
  useEffect(() => {
    api.settings.get().then(s => {
      setExportRoot(s.exportRoot)
      setHotkeys(s.hotkeys)
      setSeverities(s.severities)
      setAudioAnalysis(s.audioAnalysis)
      setSlack(s.slack)
      setGitLab(s.gitlab)
      setGitLabLabelsInput((s.gitlab.labels ?? []).join(', '))
      setGitLabMentionsInput((s.gitlab.mentionUsernames ?? []).map(name => `@${name}`).join(', '))
    })
  }, [])
  useEffect(() => api.onSlackOAuthCompleted(result => {
    setStartingSlackOAuth(false)
    setSlackSaved(false)
    if (result.ok && result.settings) {
      setSlack(result.settings.slack)
      setSlackSaved(true)
      setSlackError('')
    } else {
      setSlackError(result.error || 'Slack OAuth failed')
    }
  }), [])

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

  function parseListInput(value: string): string[] {
    return Array.from(new Set(value.split(/[,;\n]+/).map(part => part.trim()).filter(Boolean)))
  }

  async function saveGitLabSettings() {
    setSavingGitLab(true)
    setGitLabSaved(false)
    setGitLabError('')
    try {
      const settings = await api.settings.setGitLab({
        ...gitlab,
        baseUrl: gitlab.baseUrl.trim() || 'https://gitlab.com',
        projectId: gitlab.projectId.trim(),
        labels: parseListInput(gitlabLabelsInput),
        mentionUsernames: parseListInput(gitlabMentionsInput).map(name => name.replace(/^@/, '')),
      })
      setGitLab(settings.gitlab)
      setGitLabLabelsInput((settings.gitlab.labels ?? []).join(', '))
      setGitLabMentionsInput((settings.gitlab.mentionUsernames ?? []).map(name => `@${name}`).join(', '))
      setGitLabSaved(true)
    } catch (err) {
      setGitLabError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingGitLab(false)
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
        {preferencesOpen && (
          <PreferencesDialog
            locale={locale}
            localeOptions={localeOptions}
            exportRoot={exportRoot}
            hotkeys={hotkeys}
            severities={severities}
            audioAnalysis={audioAnalysis}
            slack={slack}
            slackSaved={slackSaved}
            startingSlackOAuth={startingSlackOAuth}
            slackError={slackError}
            gitlab={gitlab}
            gitlabLabelsInput={gitlabLabelsInput}
            gitlabMentionsInput={gitlabMentionsInput}
            savingGitLab={savingGitLab}
            gitlabSaved={gitlabSaved}
            gitlabError={gitlabError}
            onLocaleChange={changeLocale}
            onExportRootChange={setExportRoot}
            onSaveExportRoot={saveExportRoot}
            onChooseExportRoot={chooseExportRoot}
            onHotkeysChange={setHotkeys}
            onSaveHotkeys={saveHotkeys}
            onSeveritiesChange={setSeverities}
            onSaveSeverities={saveSeverities}
            onAudioAnalysisChange={setAudioAnalysis}
            onSaveAudioAnalysis={saveAudioAnalysis}
            onResetLabels={resetDefaultLabels}
            onStartSlackOAuth={startSlackUserOAuth}
            onGitLabChange={(next) => { setGitLab(next); setGitLabSaved(false) }}
            onGitLabLabelsInputChange={(value) => { setGitLabLabelsInput(value); setGitLabSaved(false) }}
            onGitLabMentionsInputChange={(value) => { setGitLabMentionsInput(value); setGitLabSaved(false) }}
            onSaveGitLab={saveGitLabSettings}
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

const DEFAULT_HOTKEYS: HotkeySettings = { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }
const DEFAULT_SEVERITIES: SeveritySettings = {
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
const DEFAULT_AUDIO_ANALYSIS: AudioAnalysisSettings = {
  enabled: true,
  engine: 'faster-whisper',
  modelPath: 'small',
  language: 'auto',
  triggerKeywords: '記錄, 紀錄, record, mark, log, 記録, 기록, grabar',
  showTriggerWords: false,
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
