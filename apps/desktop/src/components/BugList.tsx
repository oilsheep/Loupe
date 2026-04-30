import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { Bug, BugSeverity, DesktopApi, ExportProgress, GitLabPublishMode, MentionIdentity, PublishTarget, SeveritySettings, SlackChannel, SlackMentionUser, SlackPublishSettings, SlackThreadMode } from '@shared/types'
import { localFileUrl } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

interface Props {
  api: DesktopApi
  sessionId: string
  bugs: Bug[]
  selectedBugId: string | null
  onSelect(bug: Bug): void
  onMutated(): void
  allowExport?: boolean
  autoFocusLatest?: boolean
  buildVersion?: string
  tester?: string
  testNote?: string
  hasSessionMicTrack?: boolean
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

const BASE_SEVERITIES: BugSeverity[] = ['note', 'major', 'normal', 'minor', 'improvement']
const CUSTOM_SEVERITIES: BugSeverity[] = ['custom1', 'custom2', 'custom3', 'custom4']
const CLIP_MIN_SEC = 2
const CLIP_MAX_SEC = 60
const THUMB_PENDING_MS = 45_000
const LOGCAT_COLLAPSED_LINES = 2
const LOGCAT_EXPANDED_LINES = 10
const ORIGINAL_FILES_WARNING_KEY = 'loupe.skipOriginalFilesWarning'

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

function visibleSeverities(severities: SeveritySettings): BugSeverity[] {
  return [
    ...BASE_SEVERITIES,
    ...CUSTOM_SEVERITIES.filter(severity => severities[severity]?.label?.trim()),
  ]
}

function severityLabel(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.label?.trim() || DEFAULT_SEVERITIES[severity]?.label || severity
}

function severityColor(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.color || DEFAULT_SEVERITIES[severity]?.color || '#a1a1aa'
}

function slackUserLabel(user: SlackMentionUser): string {
  return user.displayName || user.realName || user.name || user.id
}

function mentionIdentityLabel(identity: MentionIdentity): string {
  return identity.displayName || identity.email || identity.googleEmail || identity.gitlabUsername || identity.slackUserId || identity.id
}

function MentionProviderBadges({ hasSlack, hasGitLab, hasGoogle }: { hasSlack: boolean; hasGitLab: boolean; hasGoogle: boolean }) {
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

function slackChannelLabel(channel: SlackChannel): string {
  return `${channel.isPrivate ? 'private / ' : '#'}${channel.name}${channel.isMember === false ? ' (not joined)' : ''}`
}

function slackPublishToken(settings: SlackPublishSettings | null): string {
  if (!settings) return ''
  const userToken = settings.userToken?.trim() ?? ''
  const botToken = settings.botToken.trim()
  return settings.publishIdentity === 'bot' ? botToken : userToken || botToken
}

function isSlackConnected(settings: SlackPublishSettings | null): boolean {
  return Boolean(slackPublishToken(settings))
}

function normalizeManualSlackMentions(value: string): string[] {
  return Array.from(new Set(value
    .split(/[\s,;]+/)
    .map(part => part.trim())
    .map(part => part.replace(/^<!(subteam\^[^>|]+)(?:\|[^>]+)?>$/, '!$1'))
    .map(part => part.replace(/^<!(here|channel|everyone)>$/, '!$1'))
    .map(part => part.replace(/^@(here|channel|everyone)$/, '!$1'))
    .filter(part => part.startsWith('!'))))
}

function formatManualSlackMentions(ids: string[]): string {
  return ids.filter(id => id.startsWith('!')).map(id => id.replace(/^!(here|channel|everyone)$/, '@$1')).join(', ')
}

function mentionLabel(id: string, users: SlackMentionUser[], aliases: Record<string, string>): string {
  if (aliases[id]) return aliases[id]
  if (id === '!here' || id === '!channel' || id === '!everyone') return `@${id.slice(1)}`
  const user = users.find(candidate => candidate.id === id)
  if (user) return `@${slackUserLabel(user)}`
  const subteam = id.match(/^!subteam\^[^|]+(?:\|(.+))?$/)
  if (subteam) return `@${subteam[1] || id.replace(/^!subteam\^/, '')}`
  return id
}

function channelIdFromSettings(slack: Awaited<ReturnType<DesktopApi['settings']['get']>>['slack']): string {
  const channels = (slack.channels ?? []).filter(channel => !channel.isArchived)
  return channels.some(channel => channel.id === slack.channelId) ? slack.channelId : ''
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      value => {
        window.clearTimeout(timer)
        resolve(value)
      },
      error => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function latestLogcatLines(logcat: string, lineCount: number): string {
  return logcat.split(/\r?\n/).slice(-lineCount).join('\n')
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </svg>
  )
}

function ThumbnailWaiting({ label }: { label: string }) {
  return (
    <div className="flex h-24 w-28 items-center justify-center rounded border border-zinc-800 bg-zinc-950">
      <div
        className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-400"
        aria-label={label}
        title={label}
      />
    </div>
  )
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function notifyExported(api: DesktopApi, firstPath: string, count: number, t: (key: string, params?: Record<string, string | number>) => string): void {
  const message = count === 1
    ? t('export.done.one', { path: firstPath })
    : t('export.done.many', { count })
  if (askConfirm(message)) {
    void api.app.openPath(exportRootFromOutputPath(firstPath))
  }
}

function askConfirm(message: string): boolean {
  return typeof window.confirm === 'function' ? window.confirm(message) : true
}

function exportRootFromOutputPath(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  const parent = parts.at(-2)?.toLowerCase()
  if ((parent === 'records' || parent === 'report') && parts.length > 2) {
    return parts.slice(0, -2).join(filePath.includes('\\') ? '\\' : '/')
  }
  return parts.slice(0, -1).join(filePath.includes('\\') ? '\\' : '/') || filePath
}

interface ExportRequest {
  bugs: Bug[]
  bugIds: string[]
}

interface ExportConfirmDialogProps {
  count: number
  outputRoot: string
  reportTitle: string
  buildVersion: string
  tester: string
  testNote: string
  includeLogcat: boolean
  includeMicTrack: boolean
  includeOriginalFiles: boolean
  mergeOriginalAudio: boolean
  hasSessionMicTrack: boolean
  hasMarkerAudioNotes: boolean
  slackConnected: boolean
  slackConnecting: boolean
  publishSlack: boolean
  publishGitLab: boolean
  publishGoogleDrive: boolean
  slackThreadMode: SlackThreadMode
  slackChannels: SlackChannel[]
  slackChannelId: string
  slackUsers: SlackMentionUser[]
  slackMentionIds: string[]
  slackMentionAliases: Record<string, string>
  slackManualMentionInput: string
  slackDirectoryRefreshing: boolean
  slackDirectoryError: string
  gitlabMode: GitLabPublishMode
  busy: boolean
  error: string
  canceling: boolean
  progress: ExportProgress | null
  hasMissingNotes: boolean
  onOutputRootChange(value: string): void
  onReportTitleChange(value: string): void
  onBuildVersionChange(value: string): void
  onTesterChange(value: string): void
  onTestNoteChange(value: string): void
  onIncludeLogcatChange(value: boolean): void
  onIncludeMicTrackChange(value: boolean): void
  onIncludeOriginalFilesChange(value: boolean): void
  onMergeOriginalAudioChange(value: boolean): void
  onConnectSlack(): void
  onPublishSlackChange(value: boolean): void
  onPublishGitLabChange(value: boolean): void
  onPublishGoogleDriveChange(value: boolean): void
  onSlackThreadModeChange(value: SlackThreadMode): void
  onSlackChannelIdChange(value: string): void
  onSlackMentionIdsChange(value: string[]): void
  onSlackManualMentionInputChange(value: string): void
  onRefreshSlackDirectory(): void
  onGitLabModeChange(value: GitLabPublishMode): void
  onBrowseOutputRoot(): void
  onCancel(): void
  onConfirm(): void
}

function ExportConfirmDialog({
  count,
  outputRoot,
  reportTitle,
  buildVersion,
  tester,
  testNote,
  includeLogcat,
  includeMicTrack,
  includeOriginalFiles,
  mergeOriginalAudio,
  hasSessionMicTrack,
  hasMarkerAudioNotes,
  slackConnected,
  slackConnecting,
  publishSlack,
  publishGitLab,
  publishGoogleDrive,
  slackThreadMode,
  slackChannels,
  slackChannelId,
  slackUsers,
  slackMentionIds,
  slackMentionAliases,
  slackManualMentionInput,
  slackDirectoryRefreshing,
  slackDirectoryError,
  gitlabMode,
  busy,
  error,
  canceling,
  progress,
  hasMissingNotes,
  onOutputRootChange,
  onReportTitleChange,
  onBuildVersionChange,
  onTesterChange,
  onTestNoteChange,
  onIncludeLogcatChange,
  onIncludeMicTrackChange,
  onIncludeOriginalFilesChange,
  onMergeOriginalAudioChange,
  onConnectSlack,
  onPublishSlackChange,
  onPublishGitLabChange,
  onPublishGoogleDriveChange,
  onSlackThreadModeChange,
  onSlackChannelIdChange,
  onSlackMentionIdsChange,
  onSlackManualMentionInputChange,
  onRefreshSlackDirectory,
  onGitLabModeChange,
  onBrowseOutputRoot,
  onCancel,
  onConfirm,
}: ExportConfirmDialogProps) {
  const isSlack = publishSlack
  const isGitLab = publishGitLab
  const isGoogleDrive = publishGoogleDrive
  const { t } = useI18n()
  const progressPct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="export-dialog">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="shrink-0 px-4 pt-4">
          <div className="text-sm font-medium text-zinc-100">{count === 1 ? t('export.title.one') : t('export.title.many', { count })}</div>
          <div className="mt-1 text-xs text-zinc-500">{t('export.body')}</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <label className="mt-4 block text-xs text-zinc-500">
          {t('export.outputFolder')}
          <div className="mt-1 flex gap-2">
            <input
              value={outputRoot}
              onChange={(e) => onOutputRootChange(e.target.value)}
              className="min-w-0 flex-1 rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
              autoFocus
            />
            <button
              type="button"
              onClick={onBrowseOutputRoot}
              disabled={busy}
              className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {t('common.browse')}
            </button>
          </div>
        </label>

        <label className="mt-3 block text-xs font-semibold text-zinc-300">
          Report title
          <input
            value={reportTitle}
            onChange={(e) => onReportTitleChange(e.target.value)}
            placeholder="Loupe QA Report"
            className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm font-normal text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
          />
        </label>

        <label className="mt-3 block text-xs font-semibold text-zinc-300">
          {t('new.buildVersion')}
          <input
            value={buildVersion}
            onChange={(e) => onBuildVersionChange(e.target.value)}
            placeholder="1.4.2-RC3"
            className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm font-normal text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-500">
            {t('export.tester')}
            <input
              value={tester}
              onChange={(e) => onTesterChange(e.target.value)}
              placeholder={t('export.qaName')}
              className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
          <label className="text-xs text-zinc-500">
            {t('export.testNote')}
            <input
              value={testNote}
              onChange={(e) => onTestNoteChange(e.target.value)}
              placeholder={t('export.scope')}
              className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={includeLogcat}
            onChange={(e) => onIncludeLogcatChange(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          Export marker logcat as sidecar text files
        </label>

        {hasSessionMicTrack && (
          <label className="mt-3 flex items-start gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={includeMicTrack}
              onChange={(e) => onIncludeMicTrackChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-blue-600"
            />
            <span>
              <span className="block text-zinc-300">Use session MIC track in exported clips</span>
              {hasMarkerAudioNotes && (
                <span className="mt-1 block text-amber-300">This replaces marker audio notes for these exports.</span>
              )}
            </span>
          </label>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <div className="text-xs font-medium text-zinc-300">Publish</div>
            <div className="mt-1 text-xs text-zinc-500">Local files are always exported.</div>
          </div>

          <section className={`rounded border p-3 ${isSlack ? 'border-blue-700 bg-blue-950/20' : 'border-zinc-800 bg-zinc-950/60'}`}>
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium text-zinc-200">Slack</span>
                <span className="mt-1 block text-xs text-zinc-500">Post the summary, detailed PDF, and marker videos to Slack.</span>
              </span>
              {slackConnected ? (
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-zinc-300">
                  <span>Publish</span>
                  <input
                    type="checkbox"
                    checked={isSlack}
                    onChange={(e) => onPublishSlackChange(e.target.checked)}
                    className="h-4 w-4 accent-blue-600"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={onConnectSlack}
                  disabled={busy || slackConnecting}
                  className="shrink-0 rounded bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {slackConnecting ? 'Connecting...' : 'Connect Slack'}
                </button>
              )}
            </div>

            {isSlack && (
              <div className="mt-3 space-y-3 border-t border-blue-900/60 pt-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="min-w-0 flex-1 text-xs text-zinc-500">
                    Channel
                    <SlackChannelPicker
                      channels={slackChannels}
                      value={slackChannelId}
                      onChange={onSlackChannelIdChange}
                      disabled={busy}
                      loading={slackDirectoryRefreshing}
                      onOpen={() => {
                        if (slackChannels.length === 0 && !slackDirectoryRefreshing) onRefreshSlackDirectory()
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onRefreshSlackDirectory}
                    disabled={busy || slackDirectoryRefreshing}
                    className="mt-5 shrink-0 rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {slackDirectoryRefreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
                {slackDirectoryError && <div className="mt-1 text-xs text-red-300">{slackDirectoryError}</div>}
                {slackChannels.length === 0 && !slackDirectoryError && (
                  <div className="mt-1 text-xs text-zinc-500">Reconnect Slack after scope changes, then refresh channels.</div>
                )}
              </div>

              <div>
                <div className="text-xs text-zinc-500">Mentions</div>
                <div className="mt-1">
                  <SlackMentionComposer
                    users={slackUsers}
                    selectedIds={slackMentionIds}
                    aliases={slackMentionAliases}
                    onChange={(ids) => {
                      onSlackMentionIdsChange(ids)
                      onSlackManualMentionInputChange(formatManualSlackMentions(ids))
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Slack thread layout</div>
                <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Slack publish mode">
                  <button
                    type="button"
                    onClick={() => onSlackThreadModeChange('single-thread')}
                    className={`rounded px-3 py-2 text-sm ${slackThreadMode === 'single-thread' ? 'bg-sky-700 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                  >
                    All markers in one thread
                  </button>
                  <button
                    type="button"
                    onClick={() => onSlackThreadModeChange('per-marker-thread')}
                    className={`rounded px-3 py-2 text-sm ${slackThreadMode === 'per-marker-thread' ? 'bg-sky-700 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                  >
                    Every marker per thread
                  </button>
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  Marker-level mentions override this default mention list; otherwise these mentions are added to marker replies.
                </div>
              </div>
            </div>
            )}
          </section>

          <section className={`rounded border p-3 ${isGitLab ? 'border-sky-700 bg-sky-950/20' : 'border-zinc-800 bg-zinc-950/60'}`}>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium text-zinc-200">GitLab</span>
                <span className="mt-1 block text-xs text-zinc-500">Create GitLab issue output for the selected markers.</span>
              </span>
              <input
                type="checkbox"
                checked={isGitLab}
                onChange={(e) => onPublishGitLabChange(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-blue-600"
              />
            </label>

            {isGitLab && (
            <div className="mt-3 border-t border-sky-900/60 pt-3">
              <div className="text-xs text-zinc-500">GitLab publish mode</div>
              <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="GitLab publish mode">
                <button
                  type="button"
                  onClick={() => onGitLabModeChange('single-issue')}
                  className={`rounded px-3 py-2 text-sm ${gitlabMode === 'single-issue' ? 'bg-sky-700 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                >
                  Single issue
                </button>
                <button
                  type="button"
                  onClick={() => onGitLabModeChange('per-marker-issue')}
                  className={`rounded px-3 py-2 text-sm ${gitlabMode === 'per-marker-issue' ? 'bg-sky-700 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                >
                  Issue per marker
                </button>
              </div>
            </div>
            )}
          </section>

          <section className={`rounded border p-3 ${isGoogleDrive ? 'border-emerald-700 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-950/60'}`}>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium text-zinc-200">Google Drive</span>
                <span className="mt-1 block text-xs text-zinc-500">Upload the full local export folder to the configured Drive folder and update Google Sheet rows when enabled.</span>
              </span>
              <input
                type="checkbox"
                checked={isGoogleDrive}
                onChange={(e) => onPublishGoogleDriveChange(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-blue-600"
              />
            </label>
          </section>
        </div>

        {hasMissingNotes && (
          <div className="mt-3 rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            {t('export.missingNotes')}
          </div>
        )}

        {busy && (
          <div className="mt-4 rounded border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
              <span>{progress?.message ?? t('export.progressStarting')}</span>
              <span className="font-mono tabular-nums">{progressPct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
              <div>
                {t('export.progressStep', {
                  current: progress?.current ?? 0,
                  total: progress?.total ?? 0,
                })}
              </div>
              <div className="text-right">
                {t('export.progressRemaining', { count: progress?.remaining ?? count })}
              </div>
            </div>
            {progress?.detail && (
              <div className="mt-2 break-words text-[11px] leading-4 text-zinc-500">{progress.detail}</div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <label className="mt-3 flex items-start gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            aria-label="輸出全時長錄影"
            data-testid="include-original-files"
            checked={includeOriginalFiles}
            onChange={(e) => {
              onIncludeOriginalFilesChange(e.target.checked)
              if (!e.target.checked) onMergeOriginalAudioChange(false)
            }}
            className="mt-0.5 h-4 w-4 accent-blue-600"
          />
          <span>
            <span className="block text-zinc-300">輸出全時長錄影</span>
            <span className="mt-1 block text-zinc-500">Copies the full-length recording into the local export folder only. This file is not uploaded to Slack or GitLab.</span>
          </span>
        </label>

        {includeOriginalFiles && hasSessionMicTrack && (
          <label className="ml-6 mt-2 flex items-start gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              aria-label="合併音軌"
              data-testid="merge-original-audio"
              checked={mergeOriginalAudio}
              onChange={(e) => onMergeOriginalAudioChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-blue-600"
            />
            <span>
              <span className="block text-zinc-300">合併音軌</span>
              <span className="mt-1 block text-zinc-500">MIC audio is mixed over the original video audio; it does not replace the original track.</span>
            </span>
          </label>
        )}
        </div>

        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={canceling}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            {canceling ? t('export.canceling') : t('common.cancel')}
          </button>
          <button
            onClick={() => onConfirm()}
            disabled={busy || !outputRoot.trim()}
            data-testid="confirm-export"
            className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? t('common.exporting') : t('common.export')}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ClipWindowControlProps {
  id: string
  pre: number
  post: number
  onPreChange(value: number): void
  onPostChange(value: number): void
}

function ClipWindowControl({ id, pre, post, onPreChange, onPostChange }: ClipWindowControlProps) {
  const { t } = useI18n()
  const prePct = 50 - (pre / CLIP_MAX_SEC) * 50
  const postPct = 50 + (post / CLIP_MAX_SEC) * 50

  return (
    <div className="grid grid-cols-[42px_1fr_42px] items-center gap-2 text-xs text-zinc-500">
      <span className="text-right tabular-nums">-{pre}s</span>
      <div className="relative h-8">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-800" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-600/80"
          style={{ left: `${prePct}%`, width: `${postPct - prePct}%` }}
        />
        <div className="absolute left-1/2 top-1/2 h-5 w-px -translate-y-1/2 bg-zinc-400" title={t('bug.markerTime')} />
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-200 bg-blue-500 shadow"
          style={{ left: `${prePct}%` }}
        />
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-200 bg-blue-500 shadow"
          style={{ left: `${postPct}%` }}
        />
        <input
          dir="rtl"
          type="range"
          min={CLIP_MIN_SEC}
          max={CLIP_MAX_SEC}
          value={pre}
          onChange={(e) => onPreChange(Number(e.target.value))}
          data-testid={`pre-${id}`}
          aria-label={t('bug.preAria')}
          className="absolute left-0 top-0 h-8 w-1/2 cursor-ew-resize opacity-0"
        />
        <input
          type="range"
          min={CLIP_MIN_SEC}
          max={CLIP_MAX_SEC}
          value={post}
          onChange={(e) => onPostChange(Number(e.target.value))}
          data-testid={`post-${id}`}
          aria-label={t('bug.postAria')}
          className="absolute left-1/2 top-0 h-8 w-1/2 cursor-ew-resize opacity-0"
        />
      </div>
      <span className="tabular-nums">+{post}s</span>
    </div>
  )
}

interface SeveritySelectProps {
  bugId: string
  value: BugSeverity
  severities: SeveritySettings
  visibleSeverities: BugSeverity[]
  onChange(severity: BugSeverity): void
}

function SeveritySelect({ bugId, value, severities, visibleSeverities, onChange }: SeveritySelectProps) {
  const color = severityColor(severities, value)
  return (
    <div className="flex items-center gap-2" data-row-click-ignore="true">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as BugSeverity)}
        data-testid={`severity-select-${bugId}`}
        aria-label="Marker severity"
        className="max-w-40 rounded px-3 py-1.5 text-sm font-semibold text-black outline-none focus:ring-2 focus:ring-blue-600"
        style={{ backgroundColor: color }}
      >
        {visibleSeverities.map(severity => (
          <option key={severity} value={severity}>{severityLabel(severities, severity)}</option>
        ))}
      </select>
    </div>
  )
}

interface MentionOption {
  id: string
  label: string
  detail: string
  hasSlack: boolean
  hasGitLab: boolean
  hasGoogle: boolean
  slackUserId?: string
}

interface MentionPickerProps {
  options: MentionOption[]
  selectedIds: string[]
  aliases: Record<string, string>
  onChange(ids: string[]): void
}

interface SlackMentionComposerProps {
  users: SlackMentionUser[]
  selectedIds: string[]
  aliases: Record<string, string>
  onChange(ids: string[]): void
}

type MentionSuggestion = {
  id: string
  label: string
  detail: string
}

const SPECIAL_MENTION_SUGGESTIONS: MentionSuggestion[] = [
  { id: '!here', label: '@here', detail: 'notify active channel members' },
  { id: '!channel', label: '@channel', detail: 'notify all channel members' },
  { id: '!everyone', label: '@everyone', detail: 'workspace-wide alert' },
]

function normalizeMentionDraft(value: string): string {
  const trimmed = value.trim().replace(/,$/, '').trim()
  if (!trimmed) return ''
  const subteam = trimmed.match(/^<!?(subteam\^[^>|]+)(?:\|([^>]+))?>$/)
  if (subteam) return `!${subteam[1]}${subteam[2] ? `|${subteam[2]}` : ''}`
  const special = normalizeManualSlackMentions(trimmed)
  if (special.length > 0) return special[0]
  return ''
}

function SlackMentionComposer({ users, selectedIds, aliases, onChange }: SlackMentionComposerProps) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = new Set(selectedIds)
  const query = draft.trim().replace(/^@/, '').toLowerCase()
  const userSuggestions: MentionSuggestion[] = users
    .filter(user => !selected.has(user.id))
    .filter(user => {
      if (!query) return true
      return [slackUserLabel(user), user.name, user.realName, user.displayName, user.id]
        .some(text => text.toLowerCase().includes(query))
    })
    .slice(0, 8)
    .map(user => ({ id: user.id, label: `@${slackUserLabel(user)}`, detail: user.id }))
  const specialSuggestions = SPECIAL_MENTION_SUGGESTIONS
    .filter(item => !selected.has(item.id))
    .filter(item => !query || item.label.toLowerCase().includes(query) || item.id.toLowerCase().includes(query))
  const suggestions = [...specialSuggestions, ...userSuggestions]
  const showSuggestions = open && draft.trim().startsWith('@') && suggestions.length > 0
  const activeSuggestion = suggestions[Math.min(activeIndex, Math.max(0, suggestions.length - 1))]

  useEffect(() => {
    if (!open) return
    function onDoc(event: globalThis.MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function addMention(id: string) {
    const next = Array.from(new Set([...selectedIds, id]))
    onChange(next)
    setDraft('')
    setOpen(false)
    setActiveIndex(0)
  }

  function removeMention(id: string) {
    onChange(selectedIds.filter(item => item !== id))
  }

  function commitDraft() {
    if (activeSuggestion && draft.trim().startsWith('@')) {
      addMention(activeSuggestion.id)
      return
    }
    const normalized = normalizeMentionDraft(draft)
    if (normalized) addMention(normalized)
    else setDraft('')
  }

  return (
    <div ref={rootRef} className="relative" data-row-click-ignore="true">
      <div
        className="flex min-h-10 w-full flex-wrap items-center gap-1 rounded bg-zinc-900 px-2 py-1 text-sm text-zinc-200 outline-none focus-within:ring-1 focus-within:ring-blue-600"
        onClick={() => inputRef.current?.focus()}
      >
        {selectedIds.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => removeMention(id)}
            className="max-w-40 truncate rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-red-900/70"
            title="Remove mention"
          >
            {mentionLabel(id, users, aliases)} x
          </button>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setDraft(event.target.value)
            setOpen(true)
            setActiveIndex(0)
          }}
          onKeyDown={(event) => {
            if ((event.key === ',' || event.key === ' ') && draft.trim()) {
              event.preventDefault()
              commitDraft()
            } else if (event.key === 'Enter' && draft.trim()) {
              event.preventDefault()
              commitDraft()
            } else if (event.key === 'ArrowDown' && showSuggestions) {
              event.preventDefault()
              setActiveIndex(index => Math.min(index + 1, suggestions.length - 1))
            } else if (event.key === 'ArrowUp' && showSuggestions) {
              event.preventDefault()
              setActiveIndex(index => Math.max(index - 1, 0))
            } else if (event.key === 'Backspace' && !draft && selectedIds.length > 0) {
              removeMention(selectedIds[selectedIds.length - 1])
            }
          }}
          onBlur={() => {
            if (draft.trim()) commitDraft()
          }}
          placeholder={selectedIds.length === 0 ? '@name, @here, @channel, <!subteam^S123|qa-team>' : '@tag more'}
          className="min-w-40 flex-1 bg-transparent px-1 py-1 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
        />
      </div>
      {showSuggestions && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border border-zinc-700 bg-zinc-950 py-1 shadow-xl">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addMention(suggestion.id)}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-800 ${index === activeIndex ? 'bg-blue-950/60 text-blue-100' : 'text-zinc-200'}`}
            >
              <span className="min-w-0 truncate">{suggestion.label}</span>
              <span className="shrink-0 text-[11px] text-zinc-500">{suggestion.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface SlackChannelPickerProps {
  channels: SlackChannel[]
  value: string
  disabled?: boolean
  loading?: boolean
  onOpen?(): void
  onChange(id: string): void
}

function SlackChannelPicker({ channels, value, disabled = false, loading = false, onOpen, onChange }: SlackChannelPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = channels.find(channel => channel.id === value)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredChannels = normalizedQuery
    ? channels.filter(channel => [
        channel.name,
        channel.id,
        slackChannelLabel(channel),
      ].some(text => text.toLowerCase().includes(normalizedQuery)))
    : channels

  useEffect(() => {
    if (!open) return
    function onDoc(event: globalThis.MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function toggleOpen() {
    if (disabled) return
    setOpen(prev => {
      const next = !prev
      if (next) onOpen?.()
      return next
    })
  }

  return (
    <div ref={rootRef} className="relative mt-1" data-row-click-ignore="true">
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-2 rounded bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-200 outline-none hover:bg-zinc-800 focus:ring-1 focus:ring-blue-600 disabled:opacity-50"
      >
        <span className="min-w-0 truncate">{selected ? slackChannelLabel(selected) : (loading ? 'Loading channels...' : 'Select Slack channel')}</span>
        <span className="shrink-0 text-zinc-500">v</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded border border-zinc-700 bg-zinc-950 shadow-xl">
          <div className="border-b border-zinc-800 p-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              placeholder="Search channels"
              className="w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {loading && (
              <div className="px-3 py-2 text-sm text-zinc-500">Loading channels...</div>
            )}
            {!loading && filteredChannels.length === 0 && (
              <div className="px-3 py-2 text-sm text-zinc-500">{channels.length === 0 ? 'No channels loaded' : 'No matching channels'}</div>
            )}
            {filteredChannels.map(channel => (
              <button
                key={channel.id}
                type="button"
                onClick={() => {
                  onChange(channel.id)
                  setOpen(false)
                  setQuery('')
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-800 ${channel.id === value ? 'bg-blue-950/60 text-blue-100' : 'text-zinc-200'}`}
              >
                <span className="min-w-0 truncate">{slackChannelLabel(channel)}</span>
                <span className="shrink-0 text-[11px] text-zinc-500">{channel.isMember === false ? 'not joined' : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MentionPicker({ options, selectedIds, aliases, onChange }: MentionPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = new Set(selectedIds)
  const optionMap = new Map(options.map(option => [option.id, option]))
  const slackOptionMap = new Map(options.flatMap(option => option.slackUserId ? [[option.slackUserId, option] as const] : []))
  const labels = selectedIds.map(id => aliases[id] || optionMap.get(id)?.label || slackOptionMap.get(id)?.label || id)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = normalizedQuery
    ? options.filter(option => [
        option.label,
        option.detail,
        option.id,
        option.hasSlack ? 'slack' : '',
        option.hasGitLab ? 'gitlab' : '',
        option.hasGoogle ? 'google' : '',
      ].some(value => value.toLowerCase().includes(normalizedQuery)))
    : options

  function optionSelected(option: MentionOption): boolean {
    return selected.has(option.id) || Boolean(option.slackUserId && selected.has(option.slackUserId))
  }

  function toggle(option: MentionOption) {
    const next = new Set(selected)
    if (optionSelected(option)) {
      next.delete(option.id)
      if (option.slackUserId) next.delete(option.slackUserId)
    } else {
      next.add(option.id)
    }
    onChange([...next])
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative" data-row-click-ignore="true">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="max-w-full rounded bg-zinc-800 px-2 py-1 text-left text-[11px] text-zinc-300 hover:bg-zinc-700"
      >
        {labels.length > 0 ? `Mention: ${labels.join(', ')}` : 'Mention people'}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-80 max-w-[calc(100vw-2rem)] overflow-auto rounded border border-zinc-700 bg-zinc-950 p-1 shadow-xl">
          {options.length > 0 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people"
              className="mb-1 w-full rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
              autoFocus
            />
          )}
          {options.length === 0 ? (
            <div className="px-2 py-2 text-xs text-zinc-500">Refresh Slack or GitLab users in Publish settings.</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-2 py-2 text-xs text-zinc-500">No matching people.</div>
          ) : filteredOptions.map(option => (
            <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900">
              <input
                type="checkbox"
                checked={optionSelected(option)}
                onChange={() => toggle(option)}
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <MentionProviderBadges hasSlack={option.hasSlack} hasGitLab={option.hasGitLab} hasGoogle={option.hasGoogle} />
                </span>
              </span>
              <span className="max-w-24 shrink-0 truncate text-[10px] text-zinc-600">{option.detail || option.id}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

interface OriginalFilesWarningDialogProps {
  remember: boolean
  onRememberChange(value: boolean): void
  onCancel(): void
  onConfirm(): void
}

function OriginalFilesWarningDialog({ remember, onRememberChange, onCancel, onConfirm }: OriginalFilesWarningDialogProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" data-testid="original-files-warning">
      <div className="w-full max-w-md rounded-lg border border-amber-700 bg-zinc-900 p-4 shadow-2xl">
        <div className="text-sm font-semibold text-amber-200">輸出全時長錄影可能會很大</div>
        <div className="mt-2 text-xs leading-5 text-zinc-400">
          Loupe 會把全時長錄影輸出到本機輸出資料夾。這個檔案只會本地輸出，不會上傳到 Slack 或 GitLab；檔案可能很大，輸出時間和磁碟空間用量都會增加。
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => onRememberChange(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          以後不再詢問
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-500"
          >
            繼續輸出
          </button>
        </div>
      </div>
    </div>
  )
}

export function BugList({ api, sessionId, bugs, selectedBugId, onSelect, onMutated, allowExport = true, autoFocusLatest = false, buildVersion = '', tester = '', testNote = '', hasSessionMicTrack = false }: Props) {
  const { t } = useI18n()
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [nowMs, setNowMs] = useState(Date.now())
  const [logcatPreview, setLogcatPreview] = useState<Record<string, string>>({})
  const [expandedLogcatIds, setExpandedLogcatIds] = useState<Set<string>>(new Set())
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [cancelingExport, setCancelingExport] = useState(false)
  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null)
  const [exportRoot, setExportRoot] = useState('')
  const [exportReportTitle, setExportReportTitle] = useState('Loupe QA Report')
  const [exportBuildVersion, setExportBuildVersion] = useState(buildVersion)
  const [exportTester, setExportTester] = useState(tester)
  const [exportTestNote, setExportTestNote] = useState(testNote)
  const [exportIncludeLogcat, setExportIncludeLogcat] = useState(false)
  const [exportIncludeMicTrack, setExportIncludeMicTrack] = useState(false)
  const [exportIncludeOriginalFiles, setExportIncludeOriginalFiles] = useState(false)
  const [exportMergeOriginalAudio, setExportMergeOriginalAudio] = useState(false)
  const [showOriginalFilesWarning, setShowOriginalFilesWarning] = useState(false)
  const [rememberOriginalFilesWarning, setRememberOriginalFilesWarning] = useState(false)
  const [publishSlack, setPublishSlack] = useState(false)
  const [publishGitLab, setPublishGitLab] = useState(false)
  const [publishGoogleDrive, setPublishGoogleDrive] = useState(false)
  const [slackSettings, setSlackSettings] = useState<SlackPublishSettings | null>(null)
  const [slackConnecting, setSlackConnecting] = useState(false)
  const [slackThreadMode, setSlackThreadMode] = useState<SlackThreadMode>('per-marker-thread')
  const [slackChannelId, setSlackChannelId] = useState('')
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([])
  const [slackMentionIds, setSlackMentionIds] = useState<string[]>([])
  const [slackManualMentionInput, setSlackManualMentionInput] = useState('')
  const [slackDirectoryRefreshing, setSlackDirectoryRefreshing] = useState(false)
  const [slackDirectoryError, setSlackDirectoryError] = useState('')
  const slackDirectoryRefreshPromiseRef = useRef<Promise<Awaited<ReturnType<DesktopApi['settings']['get']> | null>> | null>(null)
  const [gitlabMode, setGitLabMode] = useState<GitLabPublishMode>('single-issue')
  const [exportError, setExportError] = useState('')
  const [exportId, setExportId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [severities, setSeverities] = useState<SeveritySettings>(DEFAULT_SEVERITIES)
  const [slackUsers, setSlackUsers] = useState<SlackMentionUser[]>([])
  const [slackAliases, setSlackAliases] = useState<Record<string, string>>({})
  const [mentionIdentities, setMentionIdentities] = useState<MentionIdentity[]>([])
  const visibleSeverityList = useMemo(() => visibleSeverities(severities), [severities])
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const options = mentionIdentities.map(identity => {
      const details = [
        identity.email || identity.googleEmail || '',
        identity.gitlabUsername ? `@${identity.gitlabUsername}` : '',
        identity.slackUserId || '',
      ].filter(Boolean)
      return {
        id: identity.id,
        label: mentionIdentityLabel(identity),
        detail: details.join(' / '),
        hasSlack: Boolean(identity.slackUserId),
        hasGitLab: Boolean(identity.gitlabUsername),
        hasGoogle: Boolean(identity.googleEmail),
        slackUserId: identity.slackUserId,
      }
    })
    const identityIds = new Set(options.map(option => option.id))
    const identitySlackIds = new Set(options.map(option => option.slackUserId).filter(Boolean))
    for (const user of slackUsers) {
      if (identityIds.has(user.id) || identitySlackIds.has(user.id)) continue
      options.push({
        id: user.id,
        label: slackUserLabel(user),
        detail: user.id,
        hasSlack: true,
        hasGitLab: false,
        hasGoogle: false,
        slackUserId: user.id,
      })
    }
    return options.sort((a, b) => a.label.localeCompare(b.label))
  }, [mentionIdentities, slackUsers])
  const knownBugIdsRef = useRef<Set<string>>(new Set())

  const allChecked = bugs.length > 0 && bugs.every(b => checked.has(b.id))
  const checkedIds = useMemo(() => bugs.filter(b => checked.has(b.id)).map(b => b.id), [bugs, checked])

  useEffect(() => {
    api.settings.get().then(settings => {
      setSeverities(settings.severities)
      setSlackSettings(settings.slack)
      const fetchedUsers = (settings.slack.mentionUsers ?? []).filter(user => !user.deleted && !user.isBot)
      const fetchedIds = new Set(fetchedUsers.map(user => user.id))
      const fallbackUsers = (settings.slack.mentionUserIds ?? [])
        .filter(id => !fetchedIds.has(id))
        .map(id => ({ id, name: '', displayName: settings.slack.mentionAliases?.[id] ?? id, realName: '' }))
      setSlackUsers([...fetchedUsers, ...fallbackUsers])
      setSlackAliases(settings.slack.mentionAliases ?? {})
      setSlackChannels((settings.slack.channels ?? []).filter(channel => !channel.isArchived))
      setMentionIdentities(settings.mentionIdentities ?? [])
    }).catch(() => {})
  }, [api])

  useEffect(() => api.onSlackOAuthCompleted((result) => {
    setSlackConnecting(false)
    if (result.ok && result.settings) {
      setSlackSettings(result.settings.slack)
      applySlackDirectory(result.settings)
      setSlackChannelId(channelIdFromSettings(result.settings.slack))
      setSlackMentionIds(result.settings.slack.mentionUserIds ?? [])
      setSlackManualMentionInput(formatManualSlackMentions(result.settings.slack.mentionUserIds ?? []))
      setPublishSlack(isSlackConnected(result.settings.slack))
      setSlackDirectoryError('')
    } else {
      setSlackDirectoryError(result.error || 'Slack connection failed.')
    }
  }), [api])

  useEffect(() => {
    const hasPendingThumbnail = bugs.some(b => !b.screenshotRel && nowMs - b.createdAt < THUMB_PENDING_MS)
    if (!hasPendingThumbnail) return
    const timer = window.setTimeout(() => setNowMs(Date.now()), 1000)
    return () => window.clearTimeout(timer)
  }, [bugs, nowMs])

  useEffect(() => api.onBugExportProgress((progress) => {
    setExportProgress(prev => {
      if (progress.exportId !== exportId) return prev
      return progress
    })
  }), [api, exportId])

  useEffect(() => {
    setChecked(prev => {
      const bugIds = new Set(bugs.map(b => b.id))
      const next = new Set([...prev].filter(id => bugIds.has(id)))
      for (const bug of bugs) {
        if (!knownBugIdsRef.current.has(bug.id)) next.add(bug.id)
      }
      knownBugIdsRef.current = bugIds
      return next
    })
  }, [bugs])

  useEffect(() => {
    let cancelled = false
    Promise.all(
      bugs
        .filter(b => b.screenshotRel)
        .map(async b => {
          const abs = await api._resolveAssetPath(b.sessionId, b.screenshotRel!)
          return [b.id, localFileUrl(abs)] as const
        })
    ).then(entries => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [id, url] of entries) next[id] = url
      setThumbs(next)
    })
    return () => { cancelled = true }
  }, [bugs, api])

  useEffect(() => {
    let cancelled = false
    Promise.all(
      bugs
        .filter(b => b.logcatRel)
        .map(async b => {
          const preview = await api.bug.getLogcatPreview({ sessionId: b.sessionId, relPath: b.logcatRel! })
          return [b.id, preview ?? ''] as const
        })
    ).then(entries => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [id, preview] of entries) {
        if (preview) next[id] = preview
      }
      setLogcatPreview(next)
    })
    return () => { cancelled = true }
  }, [bugs, api])

  useEffect(() => {
    const bugIds = new Set(bugs.map(b => b.id))
    setExpandedLogcatIds(prev => new Set([...prev].filter(id => bugIds.has(id))))
  }, [bugs])

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(bugs.map(b => b.id)))
  }

  function toggleOne(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function applySlackDirectory(settings: Awaited<ReturnType<DesktopApi['settings']['get']>>): void {
    const fetchedUsers = (settings.slack.mentionUsers ?? []).filter(user => !user.deleted && !user.isBot)
    const fetchedIds = new Set(fetchedUsers.map(user => user.id))
    const fallbackUsers = (settings.slack.mentionUserIds ?? [])
      .filter(id => !fetchedIds.has(id) && !id.startsWith('!'))
      .map(id => ({ id, name: '', displayName: settings.slack.mentionAliases?.[id] ?? id, realName: '' }))
    setSlackUsers([...fetchedUsers, ...fallbackUsers])
    setSlackAliases(settings.slack.mentionAliases ?? {})
    setSlackChannels((settings.slack.channels ?? []).filter(channel => !channel.isArchived))
    setMentionIdentities(settings.mentionIdentities ?? [])
  }

  async function refreshSlackDirectoryForExport(): Promise<Awaited<ReturnType<DesktopApi['settings']['get']>> | null> {
    if (slackDirectoryRefreshPromiseRef.current) return slackDirectoryRefreshPromiseRef.current
    setSlackDirectoryRefreshing(true)
    setSlackDirectoryError('')
    const refreshPromise = (async () => {
      const settings = await withTimeout(
        api.settings.refreshSlackChannels(),
        15000,
        'Slack channel loading timed out. Try Refresh again in a minute.',
      )
      setSlackSettings(settings.slack)
      applySlackDirectory(settings)
      setSlackChannelId(channelIdFromSettings(settings.slack))
      if ((settings.slack.channels ?? []).length === 0) {
        setSlackDirectoryError('Slack connected, but no channels were returned.')
      }
      return settings
    })()
    slackDirectoryRefreshPromiseRef.current = refreshPromise
    try {
      return await refreshPromise
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSlackDirectoryError(/ratelimited|rate.?limited/i.test(message)
        ? 'Slack rate limit reached. Keep the selected channel ID or try Refresh again in a minute.'
        : message)
      return null
    } finally {
      slackDirectoryRefreshPromiseRef.current = null
      setSlackDirectoryRefreshing(false)
    }
  }

  async function beginExport(request: ExportRequest) {
    let settings: Awaited<ReturnType<DesktopApi['settings']['get']>>
    try {
      settings = await api.settings.get()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setExportError(message || 'Could not open export dialog')
      if (typeof window.alert === 'function') window.alert(message)
      return
    }
    setSlackDirectoryError('')
    setExportRoot(settings.exportRoot)
    setExportReportTitle('Loupe QA Report')
    setExportBuildVersion(buildVersion)
    setExportTester(tester)
    setExportTestNote(testNote)
    setExportIncludeLogcat(request.bugs.some(b => Boolean(b.logcatRel)))
    setExportIncludeMicTrack(false)
    setExportIncludeOriginalFiles(false)
    setExportMergeOriginalAudio(false)
    setShowOriginalFilesWarning(false)
    setRememberOriginalFilesWarning(false)
    setPublishSlack(false)
    setPublishGitLab(false)
    setPublishGoogleDrive(false)
    setSlackThreadMode('per-marker-thread')
    setSlackSettings(settings.slack)
    setSlackChannelId(channelIdFromSettings(settings.slack))
    setSlackMentionIds(settings.slack.mentionUserIds ?? [])
    setSlackManualMentionInput(formatManualSlackMentions(settings.slack.mentionUserIds ?? []))
    applySlackDirectory(settings)
    setGitLabMode(settings.gitlab.mode)
    setExportError('')
    setExportProgress(null)
    setExportId(null)
    setCancelingExport(false)
    setExportRequest(request)
  }

  async function connectSlackForExport() {
    setSlackConnecting(true)
    setSlackDirectoryError('')
    setExportError('')
    try {
      const settings = await api.settings.get()
      setSlackSettings(settings.slack)
      const nextSettings = await api.settings.startSlackUserOAuth(settings.slack)
      setSlackSettings(nextSettings.slack)
      applySlackDirectory(nextSettings)
      setSlackChannelId(channelIdFromSettings(nextSettings.slack))
      setSlackMentionIds(nextSettings.slack.mentionUserIds ?? [])
      setSlackManualMentionInput(formatManualSlackMentions(nextSettings.slack.mentionUserIds ?? []))
      if (isSlackConnected(nextSettings.slack)) {
        setPublishSlack(true)
        setSlackConnecting(false)
      }
    } catch (err) {
      setSlackConnecting(false)
      setSlackDirectoryError(err instanceof Error ? err.message : String(err))
    }
  }

  async function exportSelected() {
    if (checkedIds.length === 0) return
    const selectedBugs = bugs.filter(b => checked.has(b.id))
    await beginExport({ bugs: selectedBugs, bugIds: checkedIds })
  }

  async function confirmExport(skipOriginalFilesWarning = false) {
    if (!exportRequest) return
    const trimmedRoot = exportRoot.trim()
    if (!trimmedRoot) return
    if (publishSlack && !isSlackConnected(slackSettings)) {
      setExportError('Connect Slack before exporting to Slack.')
      return
    }
    if (publishSlack && !slackChannelId.trim()) {
      setExportError('Select a Slack channel before exporting.')
      return
    }
    if (exportIncludeOriginalFiles && !skipOriginalFilesWarning && localStorage.getItem(ORIGINAL_FILES_WARNING_KEY) !== '1') {
      setRememberOriginalFilesWarning(false)
      setShowOriginalFilesWarning(true)
      return
    }
    const nextExportId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setExportId(nextExportId)
    setExportProgress({
      exportId: nextExportId,
      phase: 'prepare',
      message: t('export.progressStarting'),
      detail: t('export.progressUpdatingMetadata'),
      current: 0,
      total: Math.max(1, 1 + exportRequest.bugIds.length * 3),
      clipIndex: 0,
      clipCount: exportRequest.bugIds.length,
      remaining: exportRequest.bugIds.length,
    })
    setExporting(true)
    setExportError('')
    setCancelingExport(false)
    try {
      await api.settings.setExportRoot(trimmedRoot)
      await api.session.updateMetadata(sessionId, {
        buildVersion: exportBuildVersion.trim(),
        tester: exportTester.trim(),
        testNote: exportTestNote.trim(),
      })
      let currentSettings = await api.settings.get()
      if (publishSlack && slackChannelId.trim()) {
        const manualMentions = normalizeManualSlackMentions(slackManualMentionInput)
        const nextMentionIds = Array.from(new Set([
          ...slackMentionIds.filter(id => !id.startsWith('!')),
          ...manualMentions,
        ]))
        const nextSlack: SlackPublishSettings = {
          ...currentSettings.slack,
          channelId: slackChannelId.trim(),
          mentionUserIds: nextMentionIds,
          mentionAliases: slackAliases,
        }
        currentSettings = await api.settings.setSlack(nextSlack)
        setSlackMentionIds(currentSettings.slack.mentionUserIds ?? [])
        setSlackManualMentionInput(formatManualSlackMentions(currentSettings.slack.mentionUserIds ?? []))
      }
      onMutated()
      const targets: PublishTarget[] = [
        ...(publishSlack ? ['slack' as const] : []),
        ...(publishGitLab ? ['gitlab' as const] : []),
        ...(publishGoogleDrive ? ['google-drive' as const] : []),
      ]
      const publish = {
        target: targets[0] ?? 'local',
        targets: targets.length > 0 ? targets : ['local' as const],
        slackThreadMode,
        gitlabMode,
      }
      const paths = exportRequest.bugIds.length === 1
        ? ([await api.bug.exportClip({ sessionId, bugId: exportRequest.bugIds[0], exportId: nextExportId, reportTitle: exportReportTitle.trim() || 'Loupe QA Report', includeLogcat: exportIncludeLogcat, includeMicTrack: exportIncludeMicTrack, includeOriginalFiles: exportIncludeOriginalFiles, mergeOriginalAudio: exportIncludeOriginalFiles && exportMergeOriginalAudio, publish })].filter(Boolean) as string[])
        : await api.bug.exportClips({ sessionId, bugIds: exportRequest.bugIds, exportId: nextExportId, reportTitle: exportReportTitle.trim() || 'Loupe QA Report', includeLogcat: exportIncludeLogcat, includeMicTrack: exportIncludeMicTrack, includeOriginalFiles: exportIncludeOriginalFiles, mergeOriginalAudio: exportIncludeOriginalFiles && exportMergeOriginalAudio, publish })
      if (paths && paths.length > 0) notifyExported(api, paths[0], paths.length, t)
      setExportRequest(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/cancel/i.test(message)) {
        setExportRequest(null)
        return
      }
      setExportError(message || 'Export failed')
      setExportProgress(prev => prev
        ? { ...prev, phase: 'error', message: t('export.progressFailed'), detail: message }
        : null)
      if (typeof window.alert === 'function') window.alert(message)
    } finally {
      setExporting(false)
      setCancelingExport(false)
    }
  }

  function confirmOriginalFilesWarning() {
    if (rememberOriginalFilesWarning) localStorage.setItem(ORIGINAL_FILES_WARNING_KEY, '1')
    setShowOriginalFilesWarning(false)
    void confirmExport(true)
  }

  async function cancelExport() {
    if (!exporting || !exportId) {
      setExportRequest(null)
      return
    }
    setCancelingExport(true)
    setExportProgress(prev => prev
      ? { ...prev, message: t('export.canceling'), detail: t('export.cancelingDetail') }
      : prev)
    await api.bug.cancelExport(exportId)
  }

  async function browseExportRoot() {
    const settings = await api.settings.chooseExportRoot()
    if (settings) setExportRoot(settings.exportRoot)
  }

  return (
    <div className="min-h-full">
      {allowExport && bugs.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-800 bg-zinc-950/95 px-3 py-2 backdrop-blur">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 accent-blue-600" />
            {t('bug.selectAll')}
          </label>
          <button
            onClick={exportSelected}
            disabled={checkedIds.length === 0 || exporting}
            className="ml-auto rounded bg-blue-700 px-2.5 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {exporting ? t('common.exporting') : t('bug.exportCount', { count: checkedIds.length || '' })}
          </button>
        </div>
      )}
      <ul className="space-y-1.5 p-2" data-testid="bug-list">
        {bugs.length === 0 && <li className="p-4 text-sm text-zinc-500">{t('bug.noMarkers')}</li>}
        {bugs.map(b => (
          <BugRow
            key={b.id}
            bug={b}
            api={api}
            sessionId={sessionId}
            isSelected={b.id === selectedBugId}
            isChecked={checked.has(b.id)}
            thumbnailUrl={thumbs[b.id]}
            logcatPreview={logcatPreview[b.id]}
            logcatExpanded={expandedLogcatIds.has(b.id)}
            nowMs={nowMs}
            onSelect={onSelect}
            onCheckedChange={toggleOne}
            onMutated={onMutated}
            allowExport={allowExport}
            shouldScrollIntoView={autoFocusLatest && b.id === selectedBugId}
            tester={tester}
            severities={severities}
            visibleSeverities={visibleSeverityList}
            mentionOptions={mentionOptions}
            slackAliases={slackAliases}
            onToggleLogcat={() => setExpandedLogcatIds(prev => {
              const next = new Set(prev)
              if (next.has(b.id)) next.delete(b.id)
              else next.add(b.id)
              return next
            })}
            onExportRequest={(bug) => beginExport({ bugs: [bug], bugIds: [bug.id] })}
          />
        ))}
      </ul>
      {exportRequest && (
        <ExportConfirmDialog
          count={exportRequest.bugIds.length}
          outputRoot={exportRoot}
          reportTitle={exportReportTitle}
          buildVersion={exportBuildVersion}
          tester={exportTester}
          testNote={exportTestNote}
          includeLogcat={exportIncludeLogcat}
          includeMicTrack={exportIncludeMicTrack}
          includeOriginalFiles={exportIncludeOriginalFiles}
          mergeOriginalAudio={exportMergeOriginalAudio}
          hasSessionMicTrack={hasSessionMicTrack}
          hasMarkerAudioNotes={exportRequest.bugs.some(b => Boolean(b.audioRel))}
          slackConnected={isSlackConnected(slackSettings)}
          slackConnecting={slackConnecting}
          publishSlack={publishSlack}
          publishGitLab={publishGitLab}
          publishGoogleDrive={publishGoogleDrive}
          slackThreadMode={slackThreadMode}
          slackChannels={slackChannels}
          slackChannelId={slackChannelId}
          slackUsers={slackUsers}
          slackMentionIds={slackMentionIds}
          slackMentionAliases={slackAliases}
          slackManualMentionInput={slackManualMentionInput}
          slackDirectoryRefreshing={slackDirectoryRefreshing}
          slackDirectoryError={slackDirectoryError}
          gitlabMode={gitlabMode}
          busy={exporting}
          error={exportError}
          canceling={cancelingExport}
          progress={exportProgress}
          hasMissingNotes={exportRequest.bugs.some(b => !b.note.trim())}
          onOutputRootChange={setExportRoot}
          onReportTitleChange={setExportReportTitle}
          onBuildVersionChange={setExportBuildVersion}
          onTesterChange={setExportTester}
          onTestNoteChange={setExportTestNote}
          onIncludeLogcatChange={setExportIncludeLogcat}
          onIncludeMicTrackChange={setExportIncludeMicTrack}
          onIncludeOriginalFilesChange={setExportIncludeOriginalFiles}
          onMergeOriginalAudioChange={setExportMergeOriginalAudio}
          onConnectSlack={() => { void connectSlackForExport() }}
          onPublishSlackChange={setPublishSlack}
          onPublishGitLabChange={setPublishGitLab}
          onPublishGoogleDriveChange={setPublishGoogleDrive}
          onSlackThreadModeChange={setSlackThreadMode}
          onSlackChannelIdChange={setSlackChannelId}
          onSlackMentionIdsChange={setSlackMentionIds}
          onSlackManualMentionInputChange={setSlackManualMentionInput}
          onRefreshSlackDirectory={() => { void refreshSlackDirectoryForExport() }}
          onGitLabModeChange={setGitLabMode}
          onBrowseOutputRoot={browseExportRoot}
          onCancel={cancelExport}
          onConfirm={confirmExport}
        />
      )}
      {showOriginalFilesWarning && (
        <OriginalFilesWarningDialog
          remember={rememberOriginalFilesWarning}
          onRememberChange={setRememberOriginalFilesWarning}
          onCancel={() => setShowOriginalFilesWarning(false)}
          onConfirm={confirmOriginalFilesWarning}
        />
      )}
    </div>
  )
}

interface RowProps {
  bug: Bug
  api: DesktopApi
  sessionId: string
  isSelected: boolean
  isChecked: boolean
  thumbnailUrl?: string
  logcatPreview?: string
  logcatExpanded: boolean
  nowMs: number
  onSelect(bug: Bug): void
  onCheckedChange(id: string): void
  onMutated(): void
  allowExport: boolean
  shouldScrollIntoView: boolean
  tester: string
  severities: SeveritySettings
  visibleSeverities: BugSeverity[]
  mentionOptions: MentionOption[]
  slackAliases: Record<string, string>
  onToggleLogcat(): void
  onExportRequest(bug: Bug): void
}

function BugRow({ bug, api, sessionId, isSelected, isChecked, thumbnailUrl, logcatPreview, logcatExpanded, nowMs, onSelect, onCheckedChange, onMutated, allowExport, shouldScrollIntoView, severities, visibleSeverities, mentionOptions, slackAliases, onToggleLogcat, onExportRequest }: RowProps) {
  const { t } = useI18n()
  const [note, setNote] = useState(bug.note)
  const [pre, setPre] = useState(bug.preSec)
  const [post, setPost] = useState(bug.postSec)
  const [mentionUserIds, setMentionUserIds] = useState(bug.mentionUserIds ?? [])
  const rowRef = useRef<HTMLLIElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordStartedAtRef = useRef(0)
  const [recording, setRecording] = useState(false)

  useEffect(() => { setNote(bug.note) }, [bug.note])
  useEffect(() => { setPre(bug.preSec) }, [bug.preSec])
  useEffect(() => { setPost(bug.postSec) }, [bug.postSec])
  useEffect(() => { setMentionUserIds(bug.mentionUserIds ?? []) }, [bug.mentionUserIds])
  useEffect(() => {
    if (!shouldScrollIntoView) return
    rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [shouldScrollIntoView, bug.id])
  useEffect(() => {
    const el = noteRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [note])

  async function save(patch: Partial<Pick<Bug, 'note' | 'severity' | 'preSec' | 'postSec' | 'mentionUserIds'>>) {
    await api.bug.update(bug.id, {
      note: bug.note,
      severity: bug.severity,
      preSec: bug.preSec,
      postSec: bug.postSec,
      mentionUserIds: bug.mentionUserIds ?? [],
      ...patch,
    })
    onMutated()
  }

  async function commitNote() {
    if (note === bug.note) return
    await save({ note: note.trim() })
  }

  async function changePre(n: number) {
    const v = Math.max(CLIP_MIN_SEC, Math.min(CLIP_MAX_SEC, n))
    setPre(v)
    await save({ preSec: v })
  }

  async function changePost(n: number) {
    const v = Math.max(CLIP_MIN_SEC, Math.min(CLIP_MAX_SEC, n))
    setPost(v)
    await save({ postSec: v })
  }

  async function changeMentions(ids: string[]) {
    setMentionUserIds(ids)
    await save({ mentionUserIds: ids })
  }

  async function del() {
    if (!confirm(t('bug.deleteConfirm'))) return
    await api.bug.delete(bug.id)
    onMutated()
  }

  async function exportClip() {
    onExportRequest(bug)
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop()
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recordStartedAtRef.current = Date.now()
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop())
      setRecording(false)
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      if (blob.size === 0) return
      const durationMs = Date.now() - recordStartedAtRef.current
      const base64 = await blobToBase64(blob)
      await api.bug.saveAudio({ sessionId, bugId: bug.id, base64, durationMs, mimeType: blob.type })
      onMutated()
    }
    recorderRef.current = recorder
    setRecording(true)
    recorder.start()
  }

  function shouldIgnoreRowClick(event: MouseEvent<HTMLElement>): boolean {
    const target = event.target as HTMLElement | null
    return Boolean(target?.closest('button,input,textarea,select,a,[data-row-click-ignore="true"]'))
  }

  return (
    <li
      ref={rowRef}
      data-testid={`bug-row-${bug.id}`}
      onClick={(event) => {
        if (shouldIgnoreRowClick(event)) return
        onSelect(bug)
      }}
      className={`cursor-pointer rounded border p-2 transition-colors ${
        isSelected
          ? 'border-blue-700 bg-zinc-900'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
      }`}
    >
      <div className="flex gap-2">
        {allowExport && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onCheckedChange(bug.id)}
            className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
            aria-label={t('bug.selectMarker', { time: fmt(bug.offsetMs) })}
          />
        )}

        <div className="flex shrink-0 flex-col gap-2">
          <SeveritySelect
            bugId={bug.id}
            value={bug.severity}
            severities={severities}
            visibleSeverities={visibleSeverities}
            onChange={(severity) => { if (severity !== bug.severity) save({ severity }) }}
          />
          <button onClick={() => onSelect(bug)} className="shrink-0" title={t('bug.screenshotTitle')}>
            {thumbnailUrl
              ? (
                <img
                  src={thumbnailUrl}
                  alt=""
                  data-testid={`thumb-${bug.id}`}
                  className="h-24 w-28 rounded border border-zinc-800 bg-black object-contain"
                />
              )
              : nowMs - bug.createdAt < THUMB_PENDING_MS
                ? <ThumbnailWaiting label={t('bug.waitingScreenshot')} />
                : <div className="h-24 w-28 rounded border border-zinc-800 bg-zinc-950" />
            }
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <button onClick={() => onSelect(bug)} className="text-left">
              <div className="text-xs font-mono text-zinc-400">{fmt(bug.offsetMs)} - {severityLabel(severities, bug.severity)}</div>
            </button>
            <div className="ml-auto flex gap-1">
              {allowExport && (
                <button
                  onClick={exportClip}
                  data-testid={`export-${bug.id}`}
                  title={t('bug.exportClip')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded bg-zinc-800 text-zinc-200 hover:bg-blue-700 hover:text-white"
                >
                  <DownloadIcon />
                </button>
              )}
              <button
                onClick={toggleRecording}
                data-testid={`record-audio-${bug.id}`}
                title={recording ? t('bug.stopAudio') : bug.audioRel ? t('bug.replaceAudio') : t('bug.recordAudio')}
                className={`inline-flex h-8 w-8 items-center justify-center rounded text-zinc-200 hover:text-white ${
                  recording ? 'bg-red-700 hover:bg-red-600' : bug.audioRel ? 'bg-emerald-800 hover:bg-emerald-700' : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
              >
                <MicIcon />
              </button>
              <button
                onClick={del}
                data-testid={`delete-${bug.id}`}
                title={t('bug.deleteConfirm')}
                className="inline-flex h-8 w-8 items-center justify-center rounded bg-zinc-800 text-zinc-200 hover:bg-red-700 hover:text-white"
              >
                <DeleteIcon />
              </button>
            </div>
          </div>

          <textarea
            ref={noteRef}
            value={note}
            rows={1}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setNote(bug.note); (e.target as HTMLTextAreaElement).blur() }
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLTextAreaElement).blur()
              }
            }}
            maxLength={200}
            placeholder={t('bug.addNote')}
            data-testid={`note-${bug.id}`}
            className="min-h-8 w-full resize-none overflow-hidden break-words rounded bg-zinc-950/40 px-2 py-1 text-sm text-zinc-200 outline-none hover:bg-zinc-950 focus:bg-zinc-800 focus:ring-1 focus:ring-blue-600"
          />

          <MentionPicker
            options={mentionOptions}
            selectedIds={mentionUserIds}
            aliases={slackAliases}
            onChange={changeMentions}
          />

          {logcatPreview && (
            <div className="rounded bg-zinc-950/60 px-2 py-1 text-[11px] text-zinc-400" data-testid={`logcat-preview-${bug.id}`} data-row-click-ignore="true">
              <button
                type="button"
                onClick={onToggleLogcat}
                className="mb-1 flex w-full items-center justify-between gap-2 text-left text-zinc-500 hover:text-zinc-300"
              >
                <span>{t('bug.logcatPreview')}</span>
                <span>{logcatExpanded ? t('bug.collapseLogcat') : t('bug.expandLogcat')}</span>
              </button>
              <pre
                className={`overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-zinc-400 ${logcatExpanded ? 'overflow-y-auto' : 'overflow-y-hidden'}`}
                style={{ maxHeight: `${logcatExpanded ? LOGCAT_EXPANDED_LINES : LOGCAT_COLLAPSED_LINES}rem` }}
              >
                {logcatExpanded ? logcatPreview : latestLogcatLines(logcatPreview, LOGCAT_COLLAPSED_LINES)}
              </pre>
            </div>
          )}

          <ClipWindowControl
            id={bug.id}
            pre={pre}
            post={post}
            onPreChange={changePre}
            onPostChange={changePost}
          />
        </div>
      </div>
    </li>
  )
}
