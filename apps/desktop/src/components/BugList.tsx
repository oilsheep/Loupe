import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, MouseEvent, ReactNode, RefObject } from 'react'
import type { AppSettings, Bug, BugAnnotation, BugSeverity, CommonSessionSettings, DesktopApi, ExportProgress, GitLabProject, GitLabPublishMode, GitLabPublishSettings, GooglePublishSettings, MarkerCustomField, MarkerFieldPreset, MentionIdentity, ProfileSettings, PublishTarget, RepublishOverrides, SessionExportInfo, SeveritySettings, SlackChannel, SlackMentionUser, SlackPublishSettings, SlackThreadMode } from '@shared/types'
import { DEFAULT_EXPORT_QUALITY, normalizeExportQuality, type ExportQuality } from '@shared/exportQuality'
import { DEFAULT_REPORT_TITLE, normalizeReportTitle } from '@shared/reportTitle'
import { localFileUrl } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { canPublishToGoogleDrive, friendlySlackRefreshMessage, hasGoogleOAuthToken, isGitLabConnected, isGoogleDriveConnected, isSlackConnected, slackConnectionLabel, slackPublishToken } from '@/lib/connection'
import { showAlert, showConfirm } from '@/lib/nativeDialog'
import { useClickOutside } from '@/lib/useClickOutside'
import { ChevronDownIcon } from './ChevronDownIcon'
import { ExportConfirmDialog, MentionOption, MentionPicker, formatManualSlackMentions } from './export/ExportConfirmDialog'
import { PublishTargetsForm } from './export/PublishTargetsForm'

// Resolve the profile to read from. Prefer the per-session override (e.g. when
// Draft opens an old session whose profile differs from the global active),
// otherwise fall back to the global active profile.
function activeProfileFrom(settings: AppSettings, override?: ProfileSettings): ProfileSettings {
  if (override) return settings.profiles.find(p => p.id === override.id) ?? override
  return settings.profiles.find(p => p.id === settings.activeProfileId) ?? settings.profiles[0]
}

// Resolve the profile id to write back to via setSlack/setGitLab/etc. Routes
// per-session writes (e.g. refreshing channels from an old session's Draft) to
// that session's profile, not the currently-active one.
function targetProfileId(settings: AppSettings, override?: ProfileSettings): string {
  return override?.id ?? settings.activeProfileId
}

interface Props {
  api: DesktopApi
  sessionId: string
  bugs: Bug[]
  selectedBugId: string | null
  selectedAnnotationId?: string | null
  onSelect(bug: Bug): void
  onMutated(): void
  onAnnotationSelect?(bug: Bug, annotation: BugAnnotation): void
  onAnnotationUpdate?(id: string, patch: Partial<Pick<BugAnnotation, 'startMs' | 'endMs'>>): void
  onAnnotationDelete?(id: string): void
  allowExport?: boolean
  autoFocusLatest?: boolean
  buildVersion?: string
  platform?: string
  project?: string
  tester?: string
  testNote?: string
  reportTitle?: string
  // Session metadata is owned by the parent (Draft); the export modal edits it
  // through these setters and persists via onCommitMetadata — no local copy here.
  onBuildVersionChange?(value: string): void
  onPlatformChange?(value: string): void
  onProjectChange?(value: string): void
  onTesterChange?(value: string): void
  onTestNoteChange?(value: string): void
  onReportTitleChange?(value: string): void
  onCommitMetadata?(): Promise<void> | void
  /** Bumped by the parent after session metadata is persisted, so the export
   *  dirty check re-runs once per save instead of on every keystroke. */
  metadataVersion?: number
  hasSessionMicTrack?: boolean
  markerToolbar?: ReactNode
  durationMs?: number
  // The 輸出/發布 buttons live in the Draft header; publish-panel open state is
  // lifted there and passed back down, and the panel's dirty status is reported
  // up so the header 發布 button can show its dot.
  publishPanelOpen?: boolean
  onExportsDirtyChange?(dirty: boolean): void
  onExportsAvailableChange?(available: boolean): void
  // The publish panel renders as a fixed overlay anchored under the header's
  // 發布 button; Draft passes that button's ref and a close callback.
  publishAnchorRef?: RefObject<HTMLElement | null>
  onClosePublishPanel?(): void
  // Per-session profile override. Read sites prefer this over
  // activeProfileFrom(settings); write sites (setSlack/setGitLab/etc.) route to
  // this profile's id when present, so refreshing Slack channels for an old
  // session correctly updates that session's profile.
  overrideProfile?: ProfileSettings
}

export interface BugListHandle {
  exportAll(): void
  exporting: boolean
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

const BASE_SEVERITIES: BugSeverity[] = ['note', 'major', 'normal', 'minor', 'improvement']
const CLIP_MIN_SEC = 0

export function clampClipSec(value: number, maxSec: number, minSec: number = CLIP_MIN_SEC): number {
  const clamped = Math.max(minSec, Math.min(maxSec, value))
  return Math.round(clamped * 10) / 10
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function RevertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}

export function formatOffset(ms: number): string {
  const totalSec = ms / 1000
  const m = Math.floor(totalSec / 60)
  const s = (totalSec - m * 60)
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

export function parseOffset(text: string): number | null {
  const m = text.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/)
  if (!m) return null
  const mins = m[1] ? Number(m[1]) : 0
  const secs = Number(m[2])
  return Math.round((mins * 60 + secs) * 1000)
}
const THUMB_PENDING_MS = 45_000
const LOGCAT_COLLAPSED_LINES = 2
const LOGCAT_EXPANDED_LINES = 10
const ORIGINAL_FILES_WARNING_KEY = 'loupe.skipOriginalFilesWarning'

const DEFAULT_SEVERITIES: SeveritySettings = {
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
const DEFAULT_COMMON_SESSION: CommonSessionSettings = {
  platforms: ['ios', 'android', 'windows', 'macOS', 'linux'],
  testers: [],
  lastPlatform: '',
  lastTester: '',
}

function fieldValueText(value: MarkerCustomField['value'] | undefined): string {
  return Array.isArray(value) ? value.join(', ') : value ?? ''
}

function normalizeCustomFields(fields: MarkerCustomField[]): MarkerCustomField[] {
  const byKey = new Map<string, MarkerCustomField>()
  for (const field of fields) {
    const key = field.key.trim()
    if (!key) continue
    const value = Array.isArray(field.value)
      ? Array.from(new Set(field.value.map(item => item.trim()).filter(Boolean)))
      : field.value.trim()
    if (Array.isArray(value) ? value.length > 0 : value) byKey.set(key, { key, value })
  }
  return [...byKey.values()]
}

function effectiveCustomFields(fields: MarkerCustomField[] | undefined, presets: MarkerFieldPreset[]): MarkerCustomField[] {
  const byKey = new Map<string, MarkerCustomField>()
  for (const preset of presets) {
    const key = preset.key.trim()
    if (!key) continue
    const value = preset.defaultValue ?? (preset.multi ? [] : '')
    byKey.set(key, { key, value: Array.isArray(value) ? value : String(value) })
  }
  for (const field of fields ?? []) {
    const key = field.key.trim()
    if (!key) continue
    byKey.set(key, field)
  }
  return [...byKey.values()]
}

const AUDIO_TRIGGER_WORDS = [
  '記錄一下', '记录一下', '紀錄一下', '註記一下', '注记一下',
  '幫我記錄', '帮我记录', '幫我紀錄', '幫我註記', '帮我注记',
  'mark this', 'record this', 'note this', 'add marker',
  '記錄', '记录', '紀錄', '註記', '注记', '標記', '标记',
  'mark', 'record', 'note',
].sort((a, b) => b.length - a.length)

function visibleSeverities(severities: SeveritySettings, bugs: Bug[] = []): BugSeverity[] {
  const usedSeverities = new Set(bugs.map(bug => bug.severity).filter(severity => !BASE_SEVERITIES.includes(severity)))
  const customSeverities = Array.from(new Set([...Object.keys(severities), ...usedSeverities]))
    .filter(severity => !BASE_SEVERITIES.includes(severity) && (usedSeverities.has(severity) || severities[severity]?.label?.trim()))
    .sort((a, b) => {
      const aNum = Number(a.match(/^custom(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
      const bNum = Number(b.match(/^custom(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
      return aNum === bNum ? a.localeCompare(b) : aNum - bNum
    })
  return [
    ...BASE_SEVERITIES,
    ...customSeverities,
  ]
}

function severityLabel(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.label?.trim() || DEFAULT_SEVERITIES[severity]?.label || severity
}

function severityColor(severities: SeveritySettings, severity: BugSeverity): string {
  return severities[severity]?.color || DEFAULT_SEVERITIES[severity]?.color || '#a1a1aa'
}

function markerSourceHint(bug: Bug): string {
  return bug.source === 'audio-auto'
    ? 'Generated by audio analysis. It will be replaced when audio is re-analyzed, even if edited.'
    : 'Created manually. Audio re-analysis keeps this marker.'
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightAudioTriggers(text: string): Array<string | JSX.Element> {
  if (!text) return []
  const pattern = new RegExp(`(${AUDIO_TRIGGER_WORDS.map(escapeRegExp).join('|')})`, 'gi')
  const parts = text.split(pattern)
  return parts.map((part, index) => {
    if (!part) return part
    const isTrigger = AUDIO_TRIGGER_WORDS.some(word => word.toLowerCase() === part.toLowerCase())
    return isTrigger
      ? <span key={index} className="rounded bg-red-500/20 px-0.5 font-semibold text-red-300">{part}</span>
      : part
  })
}

function slackUserLabel(user: SlackMentionUser): string {
  return user.displayName || user.realName || user.name || user.id
}

function mentionIdentityLabel(identity: MentionIdentity): string {
  return identity.displayName || identity.email || identity.googleEmail || identity.gitlabUsername || identity.slackUserId || identity.id
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

// The published Slack mention set: structured picks (minus the '!'-prefixed
// broadcast tokens) merged with the manually-typed broadcast mentions, deduped.
// Shared by the export modal (confirmExport) and the republish panel so the two
// never diverge.
// Fallback for optional metadata setters when BugList is used without the export
// modal (e.g. Recording, allowExport=false) — the modal never mounts there.
const noop = () => {}

function mergeSlackMentionIds(mentionIds: string[], manualInput: string): string[] {
  return Array.from(new Set([
    ...mentionIds.filter(id => !id.startsWith('!')),
    ...normalizeManualSlackMentions(manualInput),
  ]))
}

function channelIdFromSettings(slack: SlackPublishSettings): string {
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
  if (showConfirm(message)) {
    void api.app.openPath(exportRootFromOutputPath(firstPath))
  }
}

function notifyFullRecordingExported(api: DesktopApi, firstPath: string, t: (key: string, params?: Record<string, string | number>) => string): void {
  const recordsPath = containingFolderFromOutputPath(firstPath)
  if (showConfirm(t('export.done.noMarkers', { path: recordsPath }))) {
    void api.app.openPath(recordsPath)
  }
}

function containingFolderFromOutputPath(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts.slice(0, -1).join(filePath.includes('\\') ? '\\' : '/') || filePath
}

function exportRootFromOutputPath(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  const parent = parts.at(-2)?.toLowerCase()
  if ((parent === 'records' || parent === 'report') && parts.length > 2) {
    return parts.slice(0, -2).join(filePath.includes('\\') ? '\\' : '/')
  }
  return parts.slice(0, -1).join(filePath.includes('\\') ? '\\' : '/') || filePath
}

function appendCommonValue(values: string[], value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return values
  return Array.from(new Set([...values, trimmed]))
}

interface ExportRequest {
  bugs: Bug[]
  bugIds: string[]
}


interface ClipWindowControlProps {
  id: string
  pre: number
  post: number
  maxPreSec: number
  maxPostSec: number
  onPreChange(n: number): void
  onPostChange(n: number): void
}

function ClipWindowControl({ id, pre, post, maxPreSec, maxPostSec, onPreChange, onPostChange }: ClipWindowControlProps) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <label className="flex items-center gap-1">
        <span>-</span>
        <input
          type="number" min={-maxPreSec} max={maxPreSec} step={0.1} value={pre}
          onChange={(e) => onPreChange(Number(e.target.value))}
          data-testid={`pre-${id}`} aria-label={t('bug.preAria')}
          className="w-16 rounded bg-zinc-800 px-1 py-0.5 tabular-nums text-zinc-200"
        />
        <span>s</span>
      </label>
      <span className="text-zinc-600" title={t('bug.markerTime')}>◆</span>
      <label className="flex items-center gap-1">
        <span>+</span>
        <input
          type="number" min={-maxPostSec} max={maxPostSec} step={0.1} value={post}
          onChange={(e) => onPostChange(Number(e.target.value))}
          data-testid={`post-${id}`} aria-label={t('bug.postAria')}
          className="w-16 rounded bg-zinc-800 px-1 py-0.5 tabular-nums text-zinc-200"
        />
        <span>s</span>
      </label>
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
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const color = severityColor(severities, value)
  useClickOutside(rootRef, () => setOpen(false), open)
  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as BugSeverity)}
        data-testid={`severity-select-${bugId}`}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
      >
        {visibleSeverities.map(severity => (
          <option key={severity} value={severity}>{severityLabel(severities, severity)}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        data-testid={`severity-button-${bugId}`}
        aria-label="Marker severity"
        className="inline-flex max-w-40 items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold text-black outline-none focus:ring-2 focus:ring-blue-600"
        style={{ backgroundColor: color }}
      >
        <span className="truncate">{severityLabel(severities, value)}</span>
        <ChevronDownIcon className="shrink-0 text-black/70" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 min-w-40 overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-xl">
          {visibleSeverities.map(severity => (
            <button
              key={severity}
              type="button"
              onClick={() => {
                setOpen(false)
                onChange(severity)
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-black hover:brightness-110"
              style={{ backgroundColor: severityColor(severities, severity) }}
            >
              <span className="truncate">{severityLabel(severities, severity)}</span>
              {severity === value && <span aria-hidden="true">✓</span>}
            </button>
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
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" data-testid="original-files-warning">
      <div className="w-full max-w-md rounded-lg border border-amber-700 bg-zinc-900 p-4 shadow-2xl">
        <div className="text-sm font-semibold text-amber-200">{t('export.originalFilesWarningTitle')}</div>
        <div className="mt-2 text-xs leading-5 text-zinc-400">
          {t('export.originalFilesWarningBody')}
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => onRememberChange(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          {t('export.originalFilesWarningRemember')}
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-500"
          >
            {t('export.originalFilesWarningConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export const BugList = forwardRef<BugListHandle, Props>(function BugList({ api, sessionId, bugs, selectedBugId, selectedAnnotationId, onSelect, onMutated, onAnnotationSelect, onAnnotationUpdate, onAnnotationDelete, allowExport = true, autoFocusLatest = false, buildVersion = '', platform = '', project = '', tester = '', testNote = '', reportTitle = DEFAULT_REPORT_TITLE, onBuildVersionChange, onPlatformChange, onProjectChange, onTesterChange, onTestNoteChange, onReportTitleChange, onCommitMetadata, metadataVersion = 0, hasSessionMicTrack = false, markerToolbar, durationMs = Infinity, publishPanelOpen = false, onExportsDirtyChange, onExportsAvailableChange, publishAnchorRef, onClosePublishPanel, overrideProfile: propOverrideProfile }: Props, ref) {
  const { t } = useI18n()
  // Per-publish profile override controlled by the Export dialog's Profile
  // dropdown. Defaults to the prop (which Draft computes via
  // findProfileForSession), but the user can switch to any other profile here
  // for THIS publish only — we never call api.settings.setActiveProfile, so
  // this never leaks to the global active profile (same scoping principle as
  // the per-session draftProfile from Draft). Read sites use `overrideProfile`
  // (the merged value) below.
  const [localOverrideProfile, setLocalOverrideProfile] = useState<ProfileSettings | undefined>(propOverrideProfile)
  // If the prop changes (Draft re-resolves the session to a DIFFERENT profile),
  // reset the local dropdown override so the prop wins again. We compare by id
  // against the previous prop (tracked in a ref) — not by object reference —
  // because Draft computes propOverrideProfile via useMemo, which returns a
  // NEW reference on every settings reload (e.g. reloadSettings or
  // onAppSettingsUpdated) even when the resolved profile id is unchanged.
  // Without the id-vs-previous-prop check, the user's manually-chosen dropdown
  // choice would silently revert whenever settings update while the export
  // dialog is open. (Comparing prop.id against localOverrideProfile.id is
  // wrong: once the user has switched to pB, that compare always yields
  // "different" and clobbers the user's choice on every prop reference change.)
  const prevPropProfileIdRef = useRef<string | undefined>(propOverrideProfile?.id)
  useEffect(() => {
    if (propOverrideProfile?.id !== prevPropProfileIdRef.current) {
      prevPropProfileIdRef.current = propOverrideProfile?.id
      setLocalOverrideProfile(propOverrideProfile)
    }
  }, [propOverrideProfile])
  const overrideProfile = localOverrideProfile ?? propOverrideProfile
  const [allProfiles, setAllProfiles] = useState<ProfileSettings[]>([])
  const [globalActiveProfileId, setGlobalActiveProfileId] = useState<string>('')
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [nowMs, setNowMs] = useState(Date.now())
  const [logcatPreview, setLogcatPreview] = useState<Record<string, string>>({})
  const [expandedLogcatIds, setExpandedLogcatIds] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [cancelingExport, setCancelingExport] = useState(false)
  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null)
  const [exportRoot, setExportRoot] = useState('')
  const [exportIncludeLogcat, setExportIncludeLogcat] = useState(false)
  const [exportIncludeMicTrack, setExportIncludeMicTrack] = useState(false)
  const [exportIncludeOriginalFiles, setExportIncludeOriginalFiles] = useState(false)
  const [exportMergeOriginalAudio, setExportMergeOriginalAudio] = useState(false)
  const [exportQuality, setExportQuality] = useState<ExportQuality>(DEFAULT_EXPORT_QUALITY)
  const [showOriginalFilesWarning, setShowOriginalFilesWarning] = useState(false)
  const [rememberOriginalFilesWarning, setRememberOriginalFilesWarning] = useState(false)
  const [publishSlack, setPublishSlack] = useState(false)
  const [publishGitLab, setPublishGitLab] = useState(false)
  const [publishGoogleDrive, setPublishGoogleDrive] = useState(false)
  const [slackSettings, setSlackSettings] = useState<SlackPublishSettings | null>(null)
  const [slackConnecting, setSlackConnecting] = useState(false)
  const [gitlabConnecting, setGitLabConnecting] = useState(false)
  const [googleConnecting, setGoogleConnecting] = useState(false)
  const [slackThreadMode, setSlackThreadMode] = useState<SlackThreadMode>('per-marker-thread')
  const [slackChannelId, setSlackChannelId] = useState('')
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([])
  const [slackMentionIds, setSlackMentionIds] = useState<string[]>([])
  const [slackManualMentionInput, setSlackManualMentionInput] = useState('')
  const [slackDirectoryRefreshing, setSlackDirectoryRefreshing] = useState(false)
  const [slackDirectoryError, setSlackDirectoryError] = useState('')
  const slackDirectoryRefreshPromiseRef = useRef<Promise<Awaited<ReturnType<DesktopApi['settings']['get']> | null>> | null>(null)
  const [gitlabSettings, setGitLabSettings] = useState<GitLabPublishSettings | null>(null)
  const [gitlabMode, setGitLabMode] = useState<GitLabPublishMode>('single-issue')
  const [gitlabProjectId, setGitLabProjectId] = useState('')
  const [gitlabProjects, setGitLabProjects] = useState<GitLabProject[]>([])
  const [gitlabProjectsRefreshing, setGitLabProjectsRefreshing] = useState(false)
  const [gitlabProjectsError, setGitLabProjectsError] = useState('')
  const [googleSettings, setGoogleSettings] = useState<GooglePublishSettings | null>(null)
  const [exportError, setExportError] = useState('')
  const [exportId, setExportId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [severities, setSeverities] = useState<SeveritySettings>(DEFAULT_SEVERITIES)
  const [commonSession, setCommonSession] = useState<CommonSessionSettings>(DEFAULT_COMMON_SESSION)
  const [exportFolders, setExportFolders] = useState<SessionExportInfo[]>([])
  const [republishingFolder, setRepublishingFolder] = useState<string | null>(null)
  const [republishStatus, setRepublishStatus] = useState('')
  const [slackUsers, setSlackUsers] = useState<SlackMentionUser[]>([])
  const [slackAliases, setSlackAliases] = useState<Record<string, string>>({})
  const [mentionIdentities, setMentionIdentities] = useState<MentionIdentity[]>([])
  const [markerFieldPresets, setMarkerFieldPresets] = useState<MarkerFieldPreset[]>([])
  const visibleSeverityList = useMemo(() => visibleSeverities(severities, bugs), [severities, bugs])
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

  useEffect(() => {
    // Seed the editable publish selections (thread mode, GitLab project + mode)
    // only on the first snapshot for this profile. Later settings-updated events
    // (token validation, or our own on-change persistence of these prefs) must
    // refresh connection state without clobbering an in-progress selection the
    // user is editing. Profile switches re-run this effect, resetting the flag;
    // explicit reseeds go through applyProfileToExportDialog.
    let seededSelections = false
    const apply = (settings: AppSettings) => {
      const active = activeProfileFrom(settings, overrideProfile)
      setAllProfiles(settings.profiles)
      setGlobalActiveProfileId(settings.activeProfileId)
      setSeverities(settings.severities)
      setSlackSettings(active.slack)
      const fetchedUsers = (active.slack.mentionUsers ?? []).filter(user => !user.deleted && !user.isBot)
      const fetchedIds = new Set(fetchedUsers.map(user => user.id))
      const fallbackUsers = (active.slack.mentionUserIds ?? [])
        .filter(id => !fetchedIds.has(id))
        .map(id => ({ id, name: '', displayName: active.slack.mentionAliases?.[id] ?? id, realName: '' }))
      setSlackUsers([...fetchedUsers, ...fallbackUsers])
      setSlackAliases(active.slack.mentionAliases ?? {})
      setSlackChannels((active.slack.channels ?? []).filter(channel => !channel.isArchived))
      setGitLabSettings(active.gitlab)
      setGoogleSettings(active.google)
      setMentionIdentities(settings.mentionIdentities ?? [])
      setMarkerFieldPresets(active.markerFieldPresets ?? [])
      setCommonSession(settings.commonSession ?? DEFAULT_COMMON_SESSION)
      if (!seededSelections) {
        setSlackThreadMode(active.slack.threadMode ?? 'per-marker-thread')
        setGitLabProjectId(active.gitlab.projectId)
        setGitLabMode(active.gitlab.mode)
        seededSelections = true
      }
    }
    api.settings.get().then(apply).catch(() => {})
    return api.onAppSettingsUpdated(apply)
  }, [api, overrideProfile])

  // Validate Slack / GitLab token aliveness when BugList first sees a real
  // profile id. Failed probes route through maybeClearExpired*Token in the
  // IPC handler, which emits a settings update — the apply() subscription
  // above then re-renders the publish-area chip without the user having to
  // expand the section first.
  const hasValidatedConnectionsRef = useRef(false)
  useEffect(() => {
    if (hasValidatedConnectionsRef.current) return
    const profileId = overrideProfile?.id ?? globalActiveProfileId
    if (!profileId) return
    hasValidatedConnectionsRef.current = true
    void api.settings.validateConnections(profileId).catch(() => {})
  }, [api, globalActiveProfileId, overrideProfile?.id])

  useEffect(() => api.onSlackOAuthCompleted((result) => {
    setSlackConnecting(false)
    if (result.ok && result.settings) {
      const active = activeProfileFrom(result.settings, overrideProfile)
      setSlackSettings(active.slack)
      applySlackDirectory(result.settings)
      setSlackChannelId(channelIdFromSettings(active.slack))
      setSlackMentionIds(active.slack.mentionUserIds ?? [])
      setSlackManualMentionInput(formatManualSlackMentions(active.slack.mentionUserIds ?? []))
      setPublishSlack(isSlackConnected(active.slack))
      setSlackDirectoryError('')
    } else {
      setSlackDirectoryError(result.error || 'Slack connection failed.')
    }
  }), [api, overrideProfile])

  // Auto-refresh the Slack channel list whenever the user opens the Slack
  // publish toggle. Cached channels can be stale or the OAuth token may have
  // expired since the last refresh; running this here surfaces the
  // expired-token state proactively (the IPC handler clears the token on
  // token_expired so the inline Reconnect button replaces Refresh).
  useEffect(() => {
    if (!publishSlack) return
    if (!isSlackConnected(slackSettings)) return
    if (slackDirectoryRefreshing) return
    void refreshSlackDirectoryForExport()
    // intentionally only depends on publishSlack — re-firing on every
    // settings or refreshing-state change would cause refresh loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishSlack])

  // Same idea as Slack auto-refresh above: when the user toggles the GitLab
  // publish flow on, run a fresh project fetch so an expired/revoked token
  // surfaces before the user picks a project, and the IPC clear-expired-
  // token path can swap the inline button to Reconnect.
  useEffect(() => {
    if (!publishGitLab) return
    if (!isGitLabConnected(gitlabSettings)) return
    if (gitlabProjectsRefreshing) return
    void refreshGitLabProjectsForExport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishGitLab])

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

  // Per-target publish status ("Publishing to Slack…") for the republish panel.
  // The publish phase fires for both export and republish; the panel only shows
  // it while a republish is in flight.
  useEffect(() => api.onBugExportProgress((progress) => {
    if (progress.phase === 'publish') setRepublishStatus(progress.message)
  }), [api])

  // Signature of the bug set that affects whether an export is up-to-date.
  // Mirrors the old Draft.tsx `exportsChangeKey` — it belongs here with the
  // list it invalidates. When any of these fields change, the newest export
  // may become stale, so we reload the export list to refresh the dirty flag.
  const exportsChangeKey = useMemo(
    () => JSON.stringify([
      bugs.map(b => [
        b.id, b.offsetMs, b.preSec, b.postSec, b.severity, b.note,
        b.screenshotRel, b.mentionUserIds ?? [], b.customFields ?? [], b.annotations ?? [],
      ]),
      // Session metadata is part of the dirty fingerprint, but the check reads the
      // PERSISTED session on the main side — so key off metadataVersion (bumped after
      // a save) rather than the live per-keystroke fields to avoid a disk scan per key.
      metadataVersion,
    ]),
    [bugs, metadataVersion],
  )
  const reloadExports = useCallback(() => {
    void api.export.listForSession(sessionId).then(setExportFolders).catch(() => setExportFolders([]))
  }, [api, sessionId])
  useEffect(() => { reloadExports() }, [reloadExports, exportsChangeKey])
  useEffect(() => api.onBugExportProgress((p) => { if (p.phase === 'complete') reloadExports() }), [api, reloadExports])

  // The output you'd republish = newest folder (list is createdAt-desc from main).
  const newestExport = exportFolders[0] ?? null
  const exportsDirty = newestExport?.status.status === 'stale'
  useEffect(() => { onExportsDirtyChange?.(exportsDirty) }, [exportsDirty, onExportsDirtyChange])
  useEffect(() => { onExportsAvailableChange?.(exportFolders.length > 0) }, [exportFolders.length, onExportsAvailableChange])

  // Position the publish panel as a fixed overlay right-aligned under the
  // header's 發布 button, and close it on outside-click / Escape.
  const publishPanelRef = useRef<HTMLDivElement>(null)
  const [publishPanelStyle, setPublishPanelStyle] = useState<CSSProperties | undefined>(undefined)
  // useLayoutEffect so the panel is positioned before the browser paints —
  // otherwise the first open flashes at an unpositioned spot then jumps.
  useLayoutEffect(() => {
    if (!publishPanelOpen) return
    function reposition() {
      const rect = publishAnchorRef?.current?.getBoundingClientRect()
      if (!rect) return
      const margin = 16
      const width = Math.min(440, window.innerWidth - margin * 2)
      const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin))
      const top = rect.bottom + 6
      setPublishPanelStyle({ position: 'fixed', top, left, width, maxHeight: window.innerHeight - top - margin })
    }
    reposition()
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (publishPanelRef.current?.contains(target)) return
      if (publishAnchorRef?.current?.contains(target)) return
      onClosePublishPanel?.()
    }
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClosePublishPanel?.() }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [publishPanelOpen, publishAnchorRef, onClosePublishPanel])

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

  function applySlackDirectory(settings: Awaited<ReturnType<DesktopApi['settings']['get']>>): void {
    const active = activeProfileFrom(settings, overrideProfile)
    const fetchedUsers = (active.slack.mentionUsers ?? []).filter(user => !user.deleted && !user.isBot)
    const fetchedIds = new Set(fetchedUsers.map(user => user.id))
    const fallbackUsers = (active.slack.mentionUserIds ?? [])
      .filter(id => !fetchedIds.has(id) && !id.startsWith('!'))
      .map(id => ({ id, name: '', displayName: active.slack.mentionAliases?.[id] ?? id, realName: '' }))
    setSlackUsers([...fetchedUsers, ...fallbackUsers])
    setSlackAliases(active.slack.mentionAliases ?? {})
    setSlackChannels((active.slack.channels ?? []).filter(channel => !channel.isArchived))
    setMentionIdentities(settings.mentionIdentities ?? [])
  }

  async function refreshSlackDirectoryForExport(): Promise<Awaited<ReturnType<DesktopApi['settings']['get']>> | null> {
    if (slackDirectoryRefreshPromiseRef.current) return slackDirectoryRefreshPromiseRef.current
    setSlackDirectoryRefreshing(true)
    setSlackDirectoryError('')
    const refreshPromise = (async () => {
      const current = await api.settings.get()
      const settings = await withTimeout(
        api.settings.refreshSlackChannels(targetProfileId(current, overrideProfile)),
        15000,
        'Slack channel loading timed out. Try Refresh again in a minute.',
      )
      const active = activeProfileFrom(settings, overrideProfile)
      setSlackSettings(active.slack)
      applySlackDirectory(settings)
      setSlackChannelId(channelIdFromSettings(active.slack))
      if ((active.slack.channels ?? []).length === 0) {
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
        : friendlySlackRefreshMessage(message, t))
      return null
    } finally {
      slackDirectoryRefreshPromiseRef.current = null
      setSlackDirectoryRefreshing(false)
    }
  }

  function applyProfileToExportDialog(settings: AppSettings, profile: ProfileSettings | undefined) {
    const active = activeProfileFrom(settings, profile)
    setSlackSettings(active.slack)
    setSlackChannelId(channelIdFromSettings(active.slack))
    setSlackMentionIds(active.slack.mentionUserIds ?? [])
    setSlackManualMentionInput(formatManualSlackMentions(active.slack.mentionUserIds ?? []))
    applySlackDirectory(settings)
    setSlackThreadMode(active.slack.threadMode ?? 'per-marker-thread')
    setGitLabSettings(active.gitlab)
    setGitLabProjectId(active.gitlab.projectId)
    setGitLabMode(active.gitlab.mode)
    setGoogleSettings(active.google)
  }

  async function handleProfileDropdownChange(nextProfileId: string) {
    const next = allProfiles.find(p => p.id === nextProfileId)
    if (!next) return
    setLocalOverrideProfile(next)
    // Reset publish toggles since the new profile may have different
    // connectivity. The user can re-toggle whatever they want.
    setPublishSlack(false)
    setPublishGitLab(false)
    setPublishGoogleDrive(false)
    setSlackDirectoryError('')
    setGitLabProjectsError('')
    setGitLabProjects([])
    try {
      const settings = await api.settings.get()
      applyProfileToExportDialog(settings, next)
    } catch {
      // ignore — the apply effect will reload eventually
    }
  }

  async function beginExport(request: ExportRequest) {
    let settings: Awaited<ReturnType<DesktopApi['settings']['get']>>
    try {
      settings = await api.settings.get()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setExportError(message || 'Could not open export dialog')
      showAlert(message)
      return
    }
    setSlackDirectoryError('')
    setGitLabProjectsError('')
    setExportRoot(settings.exportRoot)
    setExportIncludeLogcat(request.bugs.some(b => Boolean(b.logcatRel)))
    setExportIncludeMicTrack(false)
    setExportIncludeOriginalFiles(false)
    setExportMergeOriginalAudio(false)
    setExportQuality(normalizeExportQuality(settings.exportQuality))
    setShowOriginalFilesWarning(false)
    setRememberOriginalFilesWarning(false)
    setPublishSlack(false)
    setPublishGitLab(false)
    setPublishGoogleDrive(false)
    setSlackThreadMode('per-marker-thread')
    applyProfileToExportDialog(settings, overrideProfile)
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
      const active = activeProfileFrom(settings, overrideProfile)
      const oauthSlack = { ...active.slack, publishIdentity: 'user' as const }
      setSlackSettings(oauthSlack)
      const nextSettings = await api.settings.startSlackUserOAuth(targetProfileId(settings, overrideProfile), oauthSlack)
      const nextActive = activeProfileFrom(nextSettings, overrideProfile)
      setSlackSettings(nextActive.slack)
      applySlackDirectory(nextSettings)
      setSlackChannelId(channelIdFromSettings(nextActive.slack))
      setSlackMentionIds(nextActive.slack.mentionUserIds ?? [])
      setSlackManualMentionInput(formatManualSlackMentions(nextActive.slack.mentionUserIds ?? []))
      if (isSlackConnected(nextActive.slack)) {
        setPublishSlack(true)
        setSlackConnecting(false)
      }
    } catch (err) {
      setSlackConnecting(false)
      setSlackDirectoryError(err instanceof Error ? err.message : String(err))
    }
  }

  async function connectGitLabForExport() {
    setGitLabConnecting(true)
    setGitLabProjectsError('')
    setExportError('')
    try {
      const settings = await api.settings.get()
      const active = activeProfileFrom(settings, overrideProfile)
      const seed: GitLabPublishSettings = {
        ...active.gitlab,
        authType: 'oauth',
        oauthRedirectUri: 'loupe://gitlab-oauth',
      }
      setGitLabSettings(seed)
      const nextSettings = await api.settings.connectGitLabOAuth(targetProfileId(settings, overrideProfile), seed)
      const nextActive = activeProfileFrom(nextSettings, overrideProfile)
      setGitLabSettings(nextActive.gitlab)
      setGitLabProjectId(nextActive.gitlab.projectId)
      setGitLabMode(nextActive.gitlab.mode)
      if (isGitLabConnected(nextActive.gitlab)) {
        setPublishGitLab(true)
        void refreshGitLabProjectsForExport()
      }
    } catch (err) {
      setGitLabProjectsError(err instanceof Error ? err.message : String(err))
    } finally {
      setGitLabConnecting(false)
    }
  }

  async function connectGoogleForExport() {
    setGoogleConnecting(true)
    setExportError('')
    try {
      const settings = await api.settings.get()
      const active = activeProfileFrom(settings, overrideProfile)
      const nextSettings = await api.settings.connectGoogleOAuth(targetProfileId(settings, overrideProfile), active.google)
      const nextActive = activeProfileFrom(nextSettings, overrideProfile)
      setGoogleSettings(nextActive.google)
      if (canPublishToGoogleDrive(nextActive.google)) {
        setPublishGoogleDrive(true)
      } else if (hasGoogleOAuthToken(nextActive.google)) {
        setExportError(t('publish.googleNeedsDriveFolder'))
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    } finally {
      setGoogleConnecting(false)
    }
  }

  async function exportAll() {
    const bugIds = bugs.map(b => b.id)
    await beginExport({ bugs, bugIds })
  }

  async function refreshGitLabProjectsForExport() {
    const current = await api.settings.get()
    // Always use the fresh store snapshot for token / refreshToken / baseUrl
    // / oauthClientId — local gitlabSettings React state can lag behind by
    // one render after connectGitLabForExport completes OAuth (the
    // setGitLabSettings call there hasn't flushed when this fn fires),
    // which used to cause listGitLabProjects to be invoked with an empty
    // token and 'refresh token is missing' surfaced to the user.
    const sourceSettings = activeProfileFrom(current, overrideProfile).gitlab
    const nextGitLab = {
      ...sourceSettings,
      projectId: gitlabProjectId.trim() || sourceSettings.projectId,
      mode: gitlabMode,
    }
    setGitLabProjectsRefreshing(true)
    setGitLabProjectsError('')
    try {
      const projects = await withTimeout(
        api.settings.listGitLabProjects(targetProfileId(current, overrideProfile), nextGitLab),
        15000,
        'GitLab project loading timed out. Try Refresh again in a minute.',
      )
      setGitLabSettings(nextGitLab)
      setGitLabProjects([...projects].sort((a, b) => a.nameWithNamespace.localeCompare(b.nameWithNamespace)))
      if (projects.length === 0) setGitLabProjectsError('GitLab connected, but no projects were returned.')
    } catch (err) {
      setGitLabProjectsError(err instanceof Error ? err.message : String(err))
    } finally {
      setGitLabProjectsRefreshing(false)
    }
  }

  // Build republish overrides from the same publish state the modal uses, so
  // the inline panel and confirmExport never diverge. Structured mention IDs
  // have their `!`-prefixed tokens (special mentions such as @here/@channel)
  // stripped, and manual Slack mentions from slackManualMentionInput are merged
  // in — exactly as confirmExport does — so that @here/@channel pings entered
  // manually are preserved on republish.
  function buildRepublishOverrides(): RepublishOverrides {
    const overrides: RepublishOverrides = {}
    if (publishSlack && slackChannelId.trim()) {
      overrides.slack = {
        channelId: slackChannelId.trim(),
        threadMode: slackThreadMode,
        mentionUserIds: mergeSlackMentionIds(slackMentionIds, slackManualMentionInput),
      }
    }
    if (publishGitLab && gitlabProjectId.trim()) {
      overrides.gitlab = { projectId: gitlabProjectId.trim(), mode: gitlabMode }
    }
    return overrides
  }

  async function republish(folder: SessionExportInfo) {
    const targets: Array<'slack' | 'gitlab' | 'google-drive'> = [
      ...(publishSlack ? ['slack' as const] : []),
      ...(publishGitLab ? ['gitlab' as const] : []),
      ...(publishGoogleDrive ? ['google-drive' as const] : []),
    ]
    if (targets.length === 0) return
    if (folder.status.status === 'stale' && !showConfirm(t('exports.staleConfirm', { count: folder.status.reasons.length }))) return
    setRepublishStatus('')
    setRepublishingFolder(folder.folderPath)
    try {
      const r = await api.export.republish({ folderPath: folder.folderPath, targets, overrides: buildRepublishOverrides() })
      if (!r.ok) showAlert(t('exports.publishFailed', { error: r.error ?? '' }))
    } finally {
      setRepublishingFolder(null)
      setRepublishStatus('')
      reloadExports()
    }
  }

  // Slack thread mode and GitLab issue mode are per-profile preferences, so
  // persist them the instant they change (parity with the metadata fields'
  // "save as you edit") rather than only when an export runs. We merge into a
  // fresh profile snapshot so only the mode field changes. Local state is set
  // optimistically up front; the seed-once guard in the settings effect then
  // keeps the ensuing settings-updated event from reseeding (reverting) it.
  //
  // KNOWN LIMITATION — read-modify-write race (low probability, accepted): these
  // read a snapshot then write the WHOLE slack/gitlab block, so a concurrent
  // writer of a sibling field (an export mid-flight, or a rapid second toggle)
  // landing inside the get()->set() window can clobber that field. confirmExport
  // has the same read-modify-write shape. If you extend publish-settings
  // persistence, fix it at the root: add a targeted main-process merge that sets
  // only the changed field atomically, and convert confirmExport to use it too —
  // don't paper over it with more whole-block writers here.
  async function persistSlackThreadMode(mode: SlackThreadMode) {
    setSlackThreadMode(mode)
    try {
      const current = await api.settings.get()
      const active = activeProfileFrom(current, overrideProfile)
      await api.settings.setSlack(targetProfileId(current, overrideProfile), { ...active.slack, threadMode: mode })
    } catch { /* non-fatal: the choice stays in local state for this session */ }
  }
  async function persistGitLabMode(mode: GitLabPublishMode) {
    setGitLabMode(mode)
    try {
      const current = await api.settings.get()
      const active = activeProfileFrom(current, overrideProfile)
      await api.settings.setGitLab(targetProfileId(current, overrideProfile), { ...active.gitlab, mode })
    } catch { /* non-fatal: the choice stays in local state for this session */ }
  }

  useImperativeHandle(ref, () => ({
    exportAll: () => { void exportAll() },
    exporting,
  }))

  async function confirmExport(skipOriginalFilesWarning = false) {
    if (!exportRequest) return
    const trimmedRoot = exportRoot.trim()
    if (!trimmedRoot) return
    if (publishSlack && !isSlackConnected(slackSettings)) {
      setExportError(slackConnectionLabel(slackSettings, t))
      return
    }
    if (publishSlack && !slackChannelId.trim()) {
      setExportError('Select a Slack channel before exporting.')
      return
    }
    if (publishGitLab && !isGitLabConnected(gitlabSettings)) {
      setExportError('Connect GitLab before exporting to GitLab.')
      return
    }
    if (publishGitLab && !gitlabProjectId.trim()) {
      setExportError('Select a GitLab project before exporting.')
      return
    }
    if (publishGoogleDrive && !canPublishToGoogleDrive(googleSettings)) {
      setExportError(hasGoogleOAuthToken(googleSettings)
        ? t('publish.googleNeedsDriveFolder')
        : 'Connect Google before exporting to Google Drive.')
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
      // Metadata is owned by Draft and already blur-saved; ensure the latest is
      // persisted before the export IPC reads the session for the manifest.
      await onCommitMetadata?.()
      let currentSettings = await api.settings.get()
      await api.settings.setCommonSession({
        platforms: appendCommonValue(currentSettings.commonSession?.platforms ?? DEFAULT_COMMON_SESSION.platforms, platform),
        testers: appendCommonValue(currentSettings.commonSession?.testers ?? DEFAULT_COMMON_SESSION.testers, tester),
        lastPlatform: platform.trim(),
        lastTester: tester.trim(),
      }).then(settings => {
        currentSettings = settings
        setCommonSession(settings.commonSession ?? DEFAULT_COMMON_SESSION)
      }).catch(() => {})
      if (publishSlack && slackChannelId.trim()) {
        const nextMentionIds = mergeSlackMentionIds(slackMentionIds, slackManualMentionInput)
        const nextSlack: SlackPublishSettings = {
          ...activeProfileFrom(currentSettings, overrideProfile).slack,
          channelId: slackChannelId.trim(),
          threadMode: slackThreadMode,
          mentionUserIds: nextMentionIds,
          mentionAliases: slackAliases,
        }
        currentSettings = await api.settings.setSlack(targetProfileId(currentSettings, overrideProfile), nextSlack)
        const nextActive = activeProfileFrom(currentSettings, overrideProfile)
        setSlackMentionIds(nextActive.slack.mentionUserIds ?? [])
        setSlackManualMentionInput(formatManualSlackMentions(nextActive.slack.mentionUserIds ?? []))
      }
      if (publishGitLab && gitlabProjectId.trim()) {
        const nextGitLab: GitLabPublishSettings = {
          ...activeProfileFrom(currentSettings, overrideProfile).gitlab,
          projectId: gitlabProjectId.trim(),
          mode: gitlabMode,
        }
        currentSettings = await api.settings.setGitLab(targetProfileId(currentSettings, overrideProfile), nextGitLab)
        const nextActive = activeProfileFrom(currentSettings, overrideProfile)
        setGitLabSettings(nextActive.gitlab)
        setGitLabProjectId(nextActive.gitlab.projectId)
        setGitLabMode(nextActive.gitlab.mode)
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
        ? ([await api.bug.exportClip({ sessionId, bugId: exportRequest.bugIds[0], exportId: nextExportId, reportTitle: normalizeReportTitle(reportTitle), includeLogcat: exportIncludeLogcat, includeMicTrack: exportIncludeMicTrack, includeOriginalFiles: exportIncludeOriginalFiles, mergeOriginalAudio: exportIncludeOriginalFiles && exportMergeOriginalAudio, exportQuality, publish })].filter(Boolean) as string[])
        : await api.bug.exportClips({ sessionId, bugIds: exportRequest.bugIds, exportId: nextExportId, reportTitle: normalizeReportTitle(reportTitle), includeLogcat: exportIncludeLogcat, includeMicTrack: exportIncludeMicTrack, includeOriginalFiles: exportIncludeOriginalFiles, mergeOriginalAudio: exportIncludeOriginalFiles && exportMergeOriginalAudio, exportQuality, publish })
      if (paths && paths.length > 0) {
        if (exportRequest.bugIds.length === 0) notifyFullRecordingExported(api, paths[0], t)
        else notifyExported(api, paths[0], paths.length, t)
      }
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
      showAlert(message)
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

  const handleExportQualityChange = useCallback((value: ExportQuality) => {
    const next = normalizeExportQuality(value)
    setExportQuality(next)
    // Quality is part of the dirty fingerprint, so changing it can flip a saved
    // export stale/clean. Re-check after the new quality persists (listForSession
    // reads it from settings on the main side).
    void api.settings.setExportQuality(next).then(() => reloadExports())
  }, [api, reloadExports])

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


  // Shared publish-target props — spread into BOTH the export modal and the inline
  // republish panel so the two surfaces can never drift apart. Only `busy` differs
  // (export vs republish), so it's passed per-caller.
  const publishFormProps = {
    profiles: allProfiles,
    selectedProfileId: overrideProfile?.id ?? allProfiles.find(p => p.id === globalActiveProfileId)?.id ?? allProfiles[0]?.id ?? '',
    onSelectedProfileIdChange: (id: string) => { void handleProfileDropdownChange(id) },
    slackSettings,
    slackConnected: isSlackConnected(slackSettings),
    gitlabConnected: isGitLabConnected(gitlabSettings),
    googleDriveConnected: isGoogleDriveConnected(googleSettings),
    canPublishGoogleDrive: canPublishToGoogleDrive(googleSettings),
    slackConnecting, gitlabConnecting, googleConnecting,
    publishSlack, publishGitLab, publishGoogleDrive,
    slackThreadMode, slackChannels, slackChannelId,
    mentionOptions, slackMentionIds,
    slackMentionAliases: slackAliases,
    slackDirectoryRefreshing, slackDirectoryError,
    gitlabMode, gitlabProjectId, gitlabProjects,
    gitlabProjectsRefreshing, gitlabProjectsError,
    onConnectSlack: () => { void connectSlackForExport() },
    onConnectGoogle: () => { void connectGoogleForExport() },
    onConnectGitLab: () => { void connectGitLabForExport() },
    onPublishSlackChange: setPublishSlack,
    onPublishGitLabChange: (value: boolean) => { if (value && !isGitLabConnected(gitlabSettings)) return; setPublishGitLab(value) },
    onPublishGoogleDriveChange: (value: boolean) => { if (value && !canPublishToGoogleDrive(googleSettings)) return; setPublishGoogleDrive(value) },
    onSlackThreadModeChange: (mode: SlackThreadMode) => { void persistSlackThreadMode(mode) },
    onSlackChannelIdChange: setSlackChannelId,
    onSlackMentionIdsChange: setSlackMentionIds,
    onSlackManualMentionInputChange: setSlackManualMentionInput,
    onRefreshSlackDirectory: () => { void refreshSlackDirectoryForExport() },
    onGitLabModeChange: (mode: GitLabPublishMode) => { void persistGitLabMode(mode) },
    onGitLabProjectIdChange: setGitLabProjectId,
    onRefreshGitLabProjects: () => { void refreshGitLabProjectsForExport() },
  }

  return (
    <div className="min-h-full">
      {markerToolbar && (
        <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-3 py-2 backdrop-blur">
          {markerToolbar}
        </div>
      )}
      {allowExport && publishPanelOpen && createPortal(
        <div
          ref={publishPanelRef}
          data-testid="publish-panel"
          style={publishPanelStyle}
          className="z-[60] flex flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-2xl"
        >
          {exportFolders.length === 0 ? (
            <p className="p-3 text-xs text-zinc-500">{t('exports.none')}</p>
          ) : (
            <>
              <div className="shrink-0 border-b border-zinc-700 px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-300">{newestExport?.createdAt.replace('T', ' ').slice(0, 16)}</span>
                  <span className="text-zinc-500">{t('exports.markers', { count: newestExport?.markerCount ?? 0 })}</span>
                </div>
                <p className="mt-1.5 text-[11px] text-zinc-500">{t('exports.publishesSaved')}</p>
                {exportsDirty && (
                  <p className="mt-1.5 rounded border border-amber-800/60 bg-amber-950/30 px-2 py-1 text-[11px] leading-snug text-amber-200">{t('exports.staleWarn')}</p>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <PublishTargetsForm {...publishFormProps} busy={republishingFolder !== null} />
              </div>
              <div className="shrink-0 border-t border-zinc-700 px-3 py-2.5">
                  {republishingFolder !== null && (
                    <div className="mb-2.5" data-testid="republish-progress">
                      <div className="text-xs text-zinc-400">{republishStatus || t('exports.publishing')}</div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-950">
                        <div className="loupe-indeterminate-bar h-full w-1/3 rounded-full bg-blue-500" />
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      data-testid="republish-button"
                      disabled={republishingFolder !== null || !newestExport}
                      onClick={() => { if (newestExport) void republish(newestExport) }}
                      className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {republishingFolder ? t('exports.publishing') : t('exports.republish')}
                    </button>
                  </div>
              </div>
                </>
              )}
        </div>,
        document.body,
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
            thumbnailUrl={thumbs[b.id]}
            logcatPreview={logcatPreview[b.id]}
            logcatExpanded={expandedLogcatIds.has(b.id)}
            nowMs={nowMs}
            onSelect={onSelect}
            onMutated={onMutated}
            allowExport={allowExport}
            shouldScrollIntoView={b.id === selectedBugId}
            tester={tester}
            severities={severities}
            visibleSeverities={visibleSeverityList}
            selectedAnnotationId={selectedAnnotationId}
            mentionOptions={mentionOptions}
            slackAliases={slackAliases}
            markerFieldPresets={markerFieldPresets}
            onAnnotationSelect={onAnnotationSelect}
            onAnnotationUpdate={onAnnotationUpdate}
            onAnnotationDelete={onAnnotationDelete}
            onToggleLogcat={() => setExpandedLogcatIds(prev => {
              const next = new Set(prev)
              if (next.has(b.id)) next.delete(b.id)
              else next.add(b.id)
              return next
            })}
            durationMs={durationMs}
            onExportRequest={(bug) => beginExport({ bugs: [bug], bugIds: [bug.id] })}
          />
        ))}
      </ul>
      {exportRequest && (
        <ExportConfirmDialog
          {...publishFormProps}
          busy={exporting}
          count={exportRequest.bugIds.length}
          outputRoot={exportRoot}
          reportTitle={reportTitle}
          buildVersion={buildVersion}
          platform={platform}
          project={project}
          tester={tester}
          testNote={testNote}
          commonSession={commonSession}
          includeLogcat={exportIncludeLogcat}
          includeMicTrack={exportIncludeMicTrack}
          includeOriginalFiles={exportIncludeOriginalFiles}
          mergeOriginalAudio={exportMergeOriginalAudio}
          hasSessionMicTrack={hasSessionMicTrack}
          hasMarkerAudioNotes={exportRequest.bugs.some(b => Boolean(b.audioRel))}
          error={exportError}
          canceling={cancelingExport}
          progress={exportProgress}
          hasMissingNotes={exportRequest.bugs.some(b => !b.note.trim())}
          hasChangesSinceExport={exportsDirty}
          onOutputRootChange={setExportRoot}
          onReportTitleChange={onReportTitleChange ?? noop}
          onBuildVersionChange={onBuildVersionChange ?? noop}
          onPlatformChange={onPlatformChange ?? noop}
          onProjectChange={onProjectChange ?? noop}
          onTesterChange={onTesterChange ?? noop}
          onTestNoteChange={onTestNoteChange ?? noop}
          onCommitMetadata={onCommitMetadata}
          exportQuality={exportQuality}
          onExportQualityChange={handleExportQualityChange}
          onIncludeLogcatChange={setExportIncludeLogcat}
          onIncludeMicTrackChange={setExportIncludeMicTrack}
          onIncludeOriginalFilesChange={setExportIncludeOriginalFiles}
          onMergeOriginalAudioChange={setExportMergeOriginalAudio}
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
})

function formatRelativeSeconds(ms: number): string {
  const value = Math.round((ms / 1000) * 10) / 10
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}s`
}

function annotationRelativeValue(bug: Bug, annotationMs: number): string {
  return String(Math.round(((annotationMs - bug.offsetMs) / 1000) * 10) / 10)
}

function AnnotationBoxList({
  bug,
  selectedAnnotationId,
  onSelect,
  onUpdate,
  onDelete,
}: {
  bug: Bug
  selectedAnnotationId?: string | null
  onSelect?(bug: Bug, annotation: BugAnnotation): void
  onUpdate?(id: string, patch: Partial<Pick<BugAnnotation, 'startMs' | 'endMs'>>): void
  onDelete?(id: string): void
}) {
  const annotations = bug.annotations ?? []
  const clipStartMs = Math.max(0, bug.offsetMs - bug.preSec * 1000)
  const clipEndMs = bug.offsetMs + bug.postSec * 1000
  const updateStart = (annotation: BugAnnotation, value: string) => {
    const startMs = Math.max(clipStartMs, Math.min(clipEndMs - 100, bug.offsetMs + (Number(value) || 0) * 1000))
    const endMs = Math.min(clipEndMs, Math.max(startMs + 100, annotation.endMs))
    onUpdate?.(annotation.id, { startMs, endMs })
  }
  const updateEnd = (annotation: BugAnnotation, value: string) => {
    const endMs = Math.max(annotation.startMs + 100, Math.min(clipEndMs, bug.offsetMs + (Number(value) || 0) * 1000))
    const startMs = Math.max(clipStartMs, Math.min(annotation.startMs, endMs - 100))
    onUpdate?.(annotation.id, { startMs, endMs })
  }
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/30 p-2 text-[11px] text-zinc-400">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-zinc-300">{annotations.length} {annotations.length === 1 ? 'box' : 'boxes'}</span>
        <span className="text-zinc-600">annotation</span>
      </div>
      {annotations.length === 0 ? (
        <div className="rounded bg-zinc-900/70 px-2 py-1 text-zinc-500">Drag on the video to add a box.</div>
      ) : (
        <div className="space-y-1">
          {annotations.map(annotation => {
            const active = annotation.id === selectedAnnotationId
            return (
              <div
                key={annotation.id}
                className={`grid grid-cols-[auto_1fr_1fr_auto] items-center gap-1 rounded px-1 py-1 ${active ? 'bg-blue-500/20 ring-1 ring-blue-500' : 'bg-zinc-900/80'}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect?.(bug, annotation)}
                  className="rounded px-1 text-left font-mono text-zinc-200 hover:bg-zinc-800"
                  title="Seek to annotation"
                >
                  {formatRelativeSeconds(annotation.startMs - bug.offsetMs)} → {formatRelativeSeconds(annotation.endMs - bug.offsetMs)}
                </button>
                <label className="flex items-center gap-1">
                  <span className="text-zinc-600">in</span>
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={annotationRelativeValue(bug, annotation.startMs)}
                    onBlur={(e) => updateStart(annotation, e.currentTarget.value)}
                    className="w-full rounded bg-zinc-900 px-1 py-0.5 font-mono text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-zinc-600">out</span>
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={annotationRelativeValue(bug, annotation.endMs)}
                    onBlur={(e) => updateEnd(annotation, e.currentTarget.value)}
                    className="w-full rounded bg-zinc-900 px-1 py-0.5 font-mono text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onDelete?.(annotation.id)}
                  className="rounded px-1 text-zinc-500 hover:bg-red-900/60 hover:text-red-100"
                  title="Delete annotation"
                >
                  x
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface RowProps {
  bug: Bug
  api: DesktopApi
  sessionId: string
  isSelected: boolean
  thumbnailUrl?: string
  logcatPreview?: string
  logcatExpanded: boolean
  nowMs: number
  onSelect(bug: Bug): void
  onMutated(): void
  allowExport: boolean
  shouldScrollIntoView: boolean
  tester: string
  severities: SeveritySettings
  visibleSeverities: BugSeverity[]
  selectedAnnotationId?: string | null
  mentionOptions: MentionOption[]
  slackAliases: Record<string, string>
  markerFieldPresets: MarkerFieldPreset[]
  onAnnotationSelect?(bug: Bug, annotation: BugAnnotation): void
  onAnnotationUpdate?(id: string, patch: Partial<Pick<BugAnnotation, 'startMs' | 'endMs'>>): void
  onAnnotationDelete?(id: string): void
  onToggleLogcat(): void
  onExportRequest(bug: Bug): void
  durationMs: number
}

function MarkerCustomFieldsEditor({
  fields,
  presets,
  onChange,
}: {
  fields: MarkerCustomField[]
  presets: MarkerFieldPreset[]
  onChange(fields: MarkerCustomField[]): void
}) {
  const [draft, setDraft] = useState(fields)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  useEffect(() => setDraft(fields), [fields])

  function commit(next = draft) {
    const normalized = normalizeCustomFields(next)
    setDraft(normalized)
    onChange(normalized)
  }

  function persistDraft(next: MarkerCustomField[]) {
    setDraft(next)
    onChange(normalizeCustomFields(next))
  }

  function presetFor(key: string): MarkerFieldPreset | undefined {
    return presets.find(preset => preset.key.trim() === key.trim())
  }

  function presetDefaultText(preset: MarkerFieldPreset | undefined): string {
    if (!preset?.defaultValue || Array.isArray(preset.defaultValue)) return ''
    return preset.defaultValue
  }

  function updateNewKey(value: string) {
    setNewKey(value)
    const preset = presetFor(value)
    if (!preset) return
    setNewValue(presetDefaultText(preset))
  }

  function addField() {
    const key = newKey.trim()
    if (!key) return
    const preset = presetFor(key)
    const value = preset?.multi
      ? newValue.split(/[,;\n]+/).map(item => item.trim()).filter(Boolean)
      : newValue.trim()
    const next = [...draft, { key, value }]
    setNewKey('')
    setNewValue('')
    commit(next)
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/30 p-2 text-[11px] text-zinc-400" data-row-click-ignore="true">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-zinc-300">Custom fields</span>
        <span className="text-zinc-600">key / value</span>
      </div>
      <div className="space-y-1">
        {draft.map((field, index) => {
          const preset = presetFor(field.key)
          const fieldText = fieldValueText(field.value)
          const valueOptions = preset?.options ?? []
          const hasValueOptions = !preset?.multi && valueOptions.length > 0
          return (
            <div key={`${field.key}-${index}`} className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)_auto] gap-1">
              <input
                value={field.key}
                list="marker-custom-field-keys"
                onChange={(e) => persistDraft(draft.map((item, i) => i === index ? { ...item, key: e.target.value } : item))}
                onBlur={() => commit()}
                placeholder="key"
                className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
              />
              <div className="min-w-0">
                {preset?.multi ? (
                  <MultiValueInput
                    value={Array.isArray(field.value) ? field.value : fieldValueText(field.value).split(/[,;\n]+/).map(item => item.trim()).filter(Boolean)}
                    options={preset.options ?? []}
                    onChange={(value) => {
                      const next = draft.map((item, i) => i === index ? { ...item, value } : item)
                      setDraft(next)
                      onChange(normalizeCustomFields(next))
                    }}
                  />
                ) : (
                  <>
                    {hasValueOptions ? (
                      <select
                        value={fieldText}
                        onChange={(e) => persistDraft(draft.map((item, i) => i === index ? { ...item, value: e.target.value } : item))}
                        onBlur={() => commit()}
                        className="w-full rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                      >
                        {fieldText && !valueOptions.includes(fieldText) ? <option value={fieldText}>{fieldText}</option> : null}
                        {valueOptions.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input
                        value={fieldText}
                        onChange={(e) => persistDraft(draft.map((item, i) => i === index ? { ...item, value: e.target.value } : item))}
                        onBlur={() => commit()}
                        placeholder="value"
                        className="w-full rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    )}
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => commit(draft.filter((_, i) => i !== index))}
                className="rounded bg-zinc-900 px-2 text-zinc-500 hover:bg-red-900/60 hover:text-red-100"
                title="Remove custom field"
              >
                x
              </button>
            </div>
          )
        })}
        <div className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)_auto] gap-1">
          <input
            value={newKey}
            list="marker-custom-field-keys"
            onChange={(e) => updateNewKey(e.target.value)}
            placeholder="key"
            className="min-w-0 rounded bg-zinc-950 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
          />
          {(() => {
            const preset = presetFor(newKey)
            const valueOptions = !preset?.multi ? preset?.options ?? [] : []
            return valueOptions.length > 0 ? (
              <select
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="min-w-0 rounded bg-zinc-950 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="">value</option>
                {newValue && !valueOptions.includes(newValue) ? <option value={newValue}>{newValue}</option> : null}
                {valueOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addField()
                  }
                }}
                placeholder="value"
                className="min-w-0 rounded bg-zinc-950 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
              />
            )
          })()}
          <button type="button" onClick={addField} className="rounded bg-zinc-800 px-2 text-zinc-200 hover:bg-zinc-700" title="Add custom field">
            +
          </button>
        </div>
      </div>
      <datalist id="marker-custom-field-keys">
        {presets.map(preset => <option key={preset.key} value={preset.key} />)}
      </datalist>
    </div>
  )
}

function MultiValueInput({ value, options, onChange }: { value: string[]; options: string[]; onChange(value: string[]): void }) {
  const [input, setInput] = useState('')
  const remainingOptions = options.filter(option => !value.includes(option))
  function add(nextValue = input) {
    const trimmed = nextValue.trim()
    if (!trimmed) return
    onChange(Array.from(new Set([...value, trimmed])))
    setInput('')
  }
  return (
    <div className="rounded bg-zinc-900 px-1 py-1">
      <div className="flex flex-wrap gap-1">
        {value.map(item => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(value.filter(current => current !== item))}
            className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 hover:bg-red-900/60"
            title="Remove value"
          >
            {item} x
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="add value"
          className="min-w-0 flex-1 rounded bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
        />
        {remainingOptions.length > 0 && (
          <select
            value=""
            onChange={(e) => add(e.target.value)}
            className="w-24 rounded bg-zinc-950 px-1 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="">Select</option>
            {remainingOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        )}
        <button type="button" onClick={() => add()} className="rounded bg-zinc-800 px-2 text-zinc-200 hover:bg-zinc-700" title="Add value">
          +
        </button>
      </div>
    </div>
  )
}

function BugRow({ bug, api, sessionId, isSelected, thumbnailUrl, logcatPreview, logcatExpanded, nowMs, onSelect, onMutated, allowExport, shouldScrollIntoView, severities, visibleSeverities, selectedAnnotationId, mentionOptions, slackAliases, markerFieldPresets, onAnnotationSelect, onAnnotationUpdate, onAnnotationDelete, onToggleLogcat, onExportRequest, durationMs }: RowProps) {
  const { t } = useI18n()
  const [note, setNote] = useState(bug.note)
  const [pre, setPre] = useState(bug.preSec)
  const [post, setPost] = useState(bug.postSec)
  const [mentionUserIds, setMentionUserIds] = useState(bug.mentionUserIds ?? [])
  const [customFields, setCustomFields] = useState<MarkerCustomField[]>(() => effectiveCustomFields(bug.customFields, markerFieldPresets))
  const [editingNote, setEditingNote] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordStartedAtRef = useRef(0)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)

  useEffect(() => { setNote(bug.note) }, [bug.note])
  useEffect(() => { setPre(bug.preSec) }, [bug.preSec])
  useEffect(() => { setPost(bug.postSec) }, [bug.postSec])
  useEffect(() => { setMentionUserIds(bug.mentionUserIds ?? []) }, [bug.mentionUserIds])
  useEffect(() => { setCustomFields(effectiveCustomFields(bug.customFields, markerFieldPresets)) }, [bug.customFields, markerFieldPresets])
  useEffect(() => {
    if (!shouldScrollIntoView) return
    rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [shouldScrollIntoView, bug.id])
  useEffect(() => {
    const el = noteRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [note])

  async function save(patch: Partial<Pick<Bug, 'note' | 'severity' | 'offsetMs' | 'preSec' | 'postSec' | 'mentionUserIds' | 'customFields'>>) {
    await api.bug.update(bug.id, {
      note: bug.note,
      severity: bug.severity,
      offsetMs: bug.offsetMs,
      preSec: bug.preSec,
      postSec: bug.postSec,
      mentionUserIds: bug.mentionUserIds ?? [],
      customFields: bug.customFields ?? [],
      ...patch,
    })
    onMutated()
  }

  async function commitNote() {
    if (note === bug.note) return
    await save({ note: note.trim() })
  }

  // Clip window is bounded by the whole video length, not the marker's position —
  // export (clampClipWindow) clamps the actual cut to [0, durationMs].
  const maxClipSec = durationMs > 0 ? durationMs / 1000 : Infinity
  const maxPreSec = maxClipSec
  const maxPostSec = maxClipSec

  async function changePre(n: number) {
    const v = clampClipSec(n, maxPreSec, -maxPreSec)
    setPre(v)
    await save({ preSec: v })
  }

  async function changePost(n: number) {
    const v = clampClipSec(n, maxPostSec, -maxPostSec)
    setPost(v)
    await save({ postSec: v })
  }

  async function changeMentions(ids: string[]) {
    setMentionUserIds(ids)
    await save({ mentionUserIds: ids })
  }

  async function changeCustomFields(next: MarkerCustomField[]) {
    setCustomFields(next)
    await save({ customFields: normalizeCustomFields(next) })
  }

  async function del() {
    if (!showConfirm(t('bug.deleteConfirm'))) return
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
      setTranscribing(true)
      try {
        const result = await api.bug.transcribeAudio({ sessionId, bugId: bug.id, base64, durationMs, mimeType: blob.type })
        const text = result.text.trim()
        if (text) {
          const nextNote = [note.trim(), text].filter(Boolean).join('\n')
          setNote(nextNote)
          await save({ note: nextNote })
        }
      } finally {
        setTranscribing(false)
      }
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
      className={`scroll-my-24 cursor-pointer rounded border p-2 transition-colors ${
        isSelected
          ? 'border-blue-700 bg-zinc-900'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
      }`}
    >
      <div className="flex gap-2">
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
          <div className="flex w-28 gap-1">
            <button
              type="button"
              title={t('bug.recaptureScreenshot')}
              aria-label={t('bug.recaptureScreenshot')}
              onClick={async () => { await api.bug.recaptureScreenshot(bug.id); onMutated() }}
              className="inline-flex h-7 w-7 items-center justify-center rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            ><CameraIcon /></button>
            {bug.screenshotRel !== bug.originalScreenshotRel && (
              <button
                type="button"
                title={t('bug.resetScreenshot')}
                aria-label={t('bug.resetScreenshot')}
                onClick={async () => { await api.bug.resetScreenshot(bug.id); onMutated() }}
                className="inline-flex h-7 w-7 items-center justify-center rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              ><RevertIcon /></button>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-start gap-2">
            <button onClick={() => onSelect(bug)} className="min-w-0 text-left">
              <div className="truncate text-xs font-mono text-zinc-400">{fmt(bug.offsetMs)} - {severityLabel(severities, bug.severity)}</div>
            </button>
            {bug.source === 'audio-auto' && (
              <span
                className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium leading-4 bg-sky-950 text-sky-200 ring-1 ring-sky-800"
                title={markerSourceHint(bug)}
              >
                Audio auto
              </span>
            )}
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
                disabled={transcribing}
                title={transcribing ? 'Transcribing speech to note' : recording ? t('bug.stopAudio') : 'Record speech and transcribe into note'}
                className={`inline-flex h-8 w-8 items-center justify-center rounded text-zinc-200 hover:text-white ${
                  recording ? 'bg-red-700 hover:bg-red-600' : transcribing ? 'bg-sky-800 opacity-80' : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
              >
                {transcribing
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
                  : <MicIcon />
                }
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

          <div className="relative">
            <textarea
              ref={noteRef}
              value={note}
              rows={1}
              onChange={(e) => setNote(e.target.value)}
              onFocus={() => setEditingNote(true)}
              onBlur={() => {
                setEditingNote(false)
                void commitNote()
              }}
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
              className="relative min-h-8 w-full resize-none overflow-hidden break-words rounded bg-zinc-950/40 px-2 py-1 text-sm text-zinc-200 outline-none hover:bg-zinc-950 focus:bg-zinc-800 focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <MentionPicker
            options={mentionOptions}
            selectedIds={mentionUserIds}
            aliases={slackAliases}
            dropdownMode="fixed"
            onChange={changeMentions}
          />

          <MarkerCustomFieldsEditor
            fields={customFields}
            presets={markerFieldPresets}
            onChange={(next) => { void changeCustomFields(next) }}
          />

          {(isSelected || (bug.annotations?.length ?? 0) > 0) && (
            <AnnotationBoxList
              bug={bug}
              selectedAnnotationId={selectedAnnotationId}
              onSelect={onAnnotationSelect}
              onUpdate={onAnnotationUpdate}
              onDelete={onAnnotationDelete}
            />
          )}

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

          <label className="flex items-center gap-1 text-xs text-zinc-500">
            <span>{t('bug.markerTime')}</span>
            <input
              key={bug.offsetMs}
              type="text" defaultValue={formatOffset(bug.offsetMs)}
              onBlur={(e) => {
                const parsed = parseOffset(e.target.value)
                if (parsed === null) { e.target.value = formatOffset(bug.offsetMs); return }
                const next = Math.max(0, Math.min(durationMs, parsed))
                e.target.value = formatOffset(next)
                if (next !== bug.offsetMs) void save({ offsetMs: next })
              }}
              data-testid={`offset-${bug.id}`}
              className="w-20 rounded bg-zinc-800 px-1 py-0.5 font-mono tabular-nums text-zinc-200"
            />
            {bug.offsetMs !== bug.originalOffsetMs && (
              <button
                type="button"
                title={t('bug.resetPosition')}
                aria-label={t('bug.resetPosition')}
                onClick={() => void save({ offsetMs: bug.originalOffsetMs })}
                data-testid={`reset-offset-${bug.id}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              ><RevertIcon /></button>
            )}
          </label>
          <ClipWindowControl
            id={bug.id}
            pre={pre}
            post={post}
            maxPreSec={maxPreSec}
            maxPostSec={maxPostSec}
            onPreChange={changePre}
            onPostChange={changePost}
          />
        </div>
      </div>
    </li>
  )
}
