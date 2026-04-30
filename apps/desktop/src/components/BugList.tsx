import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { Bug, BugSeverity, DesktopApi, ExportProgress, PublishTarget, SeveritySettings, SlackMentionUser, SlackThreadMode } from '@shared/types'
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
  publishTarget: PublishTarget
  slackThreadMode: SlackThreadMode
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
  onPublishTargetChange(value: PublishTarget): void
  onSlackThreadModeChange(value: SlackThreadMode): void
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
  publishTarget,
  slackThreadMode,
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
  onPublishTargetChange,
  onSlackThreadModeChange,
  onBrowseOutputRoot,
  onCancel,
  onConfirm,
}: ExportConfirmDialogProps) {
  const isSlack = publishTarget === 'slack'
  const { t } = useI18n()
  const progressPct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-24" data-testid="export-dialog">
      <div className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        <div className="text-sm font-medium text-zinc-100">{count === 1 ? t('export.title.one') : t('export.title.many', { count })}</div>
        <div className="mt-1 text-xs text-zinc-500">{t('export.body')}</div>

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

        <div className="mt-4 rounded border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="text-xs font-medium text-zinc-300">Publish target</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onPublishTargetChange('local')}
              className={`rounded px-3 py-2 text-sm ${publishTarget === 'local' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            >
              Local only
            </button>
            <button
              type="button"
              onClick={() => onPublishTargetChange('slack')}
              className={`rounded px-3 py-2 text-sm ${isSlack ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            >
              Slack
            </button>
          </div>

          {isSlack && (
            <div className="mt-3">
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
                Loupe writes a Slack publish plan next to the manifest.
              </div>
            </div>
          )}
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

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={canceling}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            {canceling ? t('export.canceling') : t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !outputRoot.trim()}
            className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? t('common.exporting') : t('common.export')}
          </button>
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

interface MentionPickerProps {
  users: SlackMentionUser[]
  selectedIds: string[]
  aliases: Record<string, string>
  onChange(ids: string[]): void
}

function MentionPicker({ users, selectedIds, aliases, onChange }: MentionPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = new Set(selectedIds)
  const labels = selectedIds.map(id => aliases[id] || users.find(user => user.id === id)?.displayName || users.find(user => user.id === id)?.realName || users.find(user => user.id === id)?.name || id)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredUsers = normalizedQuery
    ? users.filter(user => [
        slackUserLabel(user),
        user.name,
        user.realName,
        user.displayName,
        user.id,
      ].some(value => value.toLowerCase().includes(normalizedQuery)))
    : users

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
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
        <div className="absolute z-20 mt-1 max-h-56 w-72 overflow-auto rounded border border-zinc-700 bg-zinc-950 p-1 shadow-xl">
          {users.length > 0 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people"
              className="mb-1 w-full rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
              autoFocus
            />
          )}
          {users.length === 0 ? (
            <div className="px-2 py-2 text-xs text-zinc-500">Refresh Slack users in Publish settings.</div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-2 py-2 text-xs text-zinc-500">No matching people.</div>
          ) : filteredUsers.map(user => (
            <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900">
              <input
                type="checkbox"
                checked={selected.has(user.id)}
                onChange={() => toggle(user.id)}
                className="h-4 w-4 accent-blue-600"
              />
              <span className="min-w-0 flex-1 truncate">{slackUserLabel(user)}</span>
              <span className="shrink-0 text-[10px] text-zinc-600">{user.id}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function BugList({ api, sessionId, bugs, selectedBugId, onSelect, onMutated, allowExport = true, autoFocusLatest = false, buildVersion = '', tester = '', testNote = '' }: Props) {
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
  const [publishTarget, setPublishTarget] = useState<PublishTarget>('local')
  const [slackThreadMode, setSlackThreadMode] = useState<SlackThreadMode>('single-thread')
  const [exportError, setExportError] = useState('')
  const [exportId, setExportId] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [severities, setSeverities] = useState<SeveritySettings>(DEFAULT_SEVERITIES)
  const [slackUsers, setSlackUsers] = useState<SlackMentionUser[]>([])
  const [slackAliases, setSlackAliases] = useState<Record<string, string>>({})
  const visibleSeverityList = useMemo(() => visibleSeverities(severities), [severities])
  const knownBugIdsRef = useRef<Set<string>>(new Set())

  const allChecked = bugs.length > 0 && bugs.every(b => checked.has(b.id))
  const checkedIds = useMemo(() => bugs.filter(b => checked.has(b.id)).map(b => b.id), [bugs, checked])

  useEffect(() => {
    api.settings.get().then(settings => {
      setSeverities(settings.severities)
      const fetchedUsers = (settings.slack.mentionUsers ?? []).filter(user => !user.deleted && !user.isBot)
      const fetchedIds = new Set(fetchedUsers.map(user => user.id))
      const fallbackUsers = (settings.slack.mentionUserIds ?? [])
        .filter(id => !fetchedIds.has(id))
        .map(id => ({ id, name: '', displayName: settings.slack.mentionAliases?.[id] ?? id, realName: '' }))
      setSlackUsers([...fetchedUsers, ...fallbackUsers])
      setSlackAliases(settings.slack.mentionAliases ?? {})
    }).catch(() => {})
  }, [api])

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

  async function beginExport(request: ExportRequest) {
    const settings = await api.settings.get()
    setExportRoot(settings.exportRoot)
    setExportReportTitle('Loupe QA Report')
    setExportBuildVersion(buildVersion)
    setExportTester(tester)
    setExportTestNote(testNote)
    setExportIncludeLogcat(request.bugs.some(b => Boolean(b.logcatRel)))
    setPublishTarget('local')
    setSlackThreadMode('single-thread')
    setExportError('')
    setExportProgress(null)
    setExportId(null)
    setCancelingExport(false)
    setExportRequest(request)
  }

  async function exportSelected() {
    if (checkedIds.length === 0) return
    const selectedBugs = bugs.filter(b => checked.has(b.id))
    await beginExport({ bugs: selectedBugs, bugIds: checkedIds })
  }

  async function confirmExport() {
    if (!exportRequest) return
    const trimmedRoot = exportRoot.trim()
    if (!trimmedRoot) return
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
      onMutated()
      const publish = { target: publishTarget, slackThreadMode }
      const paths = exportRequest.bugIds.length === 1
        ? ([await api.bug.exportClip({ sessionId, bugId: exportRequest.bugIds[0], exportId: nextExportId, reportTitle: exportReportTitle.trim() || 'Loupe QA Report', includeLogcat: exportIncludeLogcat, publish })].filter(Boolean) as string[])
        : await api.bug.exportClips({ sessionId, bugIds: exportRequest.bugIds, exportId: nextExportId, reportTitle: exportReportTitle.trim() || 'Loupe QA Report', includeLogcat: exportIncludeLogcat, publish })
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
            slackUsers={slackUsers}
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
          publishTarget={publishTarget}
          slackThreadMode={slackThreadMode}
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
          onPublishTargetChange={setPublishTarget}
          onSlackThreadModeChange={setSlackThreadMode}
          onBrowseOutputRoot={browseExportRoot}
          onCancel={cancelExport}
          onConfirm={confirmExport}
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
  slackUsers: SlackMentionUser[]
  slackAliases: Record<string, string>
  onToggleLogcat(): void
  onExportRequest(bug: Bug): void
}

function BugRow({ bug, api, sessionId, isSelected, isChecked, thumbnailUrl, logcatPreview, logcatExpanded, nowMs, onSelect, onCheckedChange, onMutated, allowExport, shouldScrollIntoView, severities, visibleSeverities, slackUsers, slackAliases, onToggleLogcat, onExportRequest }: RowProps) {
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
            users={slackUsers}
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
