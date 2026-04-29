import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { Bug, BugSeverity, DesktopApi } from '@shared/types'
import { localFileUrl } from '@/lib/api'

interface Props {
  api: DesktopApi
  sessionId: string
  bugs: Bug[]
  selectedBugId: string | null
  onSelect(bug: Bug): void
  onMutated(): void
  allowExport?: boolean
  autoFocusLatest?: boolean
  tester?: string
  testNote?: string
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

const SEVERITIES: BugSeverity[] = ['note', 'major', 'normal', 'minor', 'improvement']
const CLIP_MIN_SEC = 2
const CLIP_MAX_SEC = 60
const THUMB_PENDING_MS = 45_000

function severityClass(severity: BugSeverity): string {
  switch (severity) {
    case 'note': return 'bg-zinc-200 text-zinc-950'
    case 'major': return 'bg-red-500 text-white'
    case 'normal': return 'bg-amber-500 text-zinc-950'
    case 'minor': return 'bg-sky-500 text-white'
    case 'improvement': return 'bg-emerald-500 text-zinc-950'
  }
}

function markerClass(severity: BugSeverity): string {
  switch (severity) {
    case 'note': return 'bg-zinc-300'
    case 'major': return 'bg-red-500'
    case 'normal': return 'bg-amber-500'
    case 'minor': return 'bg-sky-500'
    case 'improvement': return 'bg-emerald-500'
  }
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

function ThumbnailWaiting() {
  return (
    <div className="flex h-24 w-28 items-center justify-center rounded border border-zinc-800 bg-zinc-950">
      <div
        className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-400"
        aria-label="Waiting for screenshot"
        title="Waiting for screenshot"
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

function notifyExported(api: DesktopApi, firstPath: string, count: number): void {
  const message = count === 1
    ? `Export complete:\n${firstPath}\n\nOpen the output folder?`
    : `Export complete: ${count} clips exported.\n\nOpen the output folder?`
  if (askConfirm(message)) {
    void api.app.showItemInFolder(firstPath)
  }
}

function askConfirm(message: string): boolean {
  return typeof window.confirm === 'function' ? window.confirm(message) : true
}

interface ExportRequest {
  bugs: Bug[]
  bugIds: string[]
}

interface ExportConfirmDialogProps {
  count: number
  outputRoot: string
  tester: string
  testNote: string
  busy: boolean
  hasMissingNotes: boolean
  onOutputRootChange(value: string): void
  onTesterChange(value: string): void
  onTestNoteChange(value: string): void
  onBrowseOutputRoot(): void
  onCancel(): void
  onConfirm(): void
}

function ExportConfirmDialog({
  count,
  outputRoot,
  tester,
  testNote,
  busy,
  hasMissingNotes,
  onOutputRootChange,
  onTesterChange,
  onTestNoteChange,
  onBrowseOutputRoot,
  onCancel,
  onConfirm,
}: ExportConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-24" data-testid="export-dialog">
      <div className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        <div className="text-sm font-medium text-zinc-100">Export {count === 1 ? 'clip' : `${count} clips`}</div>
        <div className="mt-1 text-xs text-zinc-500">Confirm destination and metadata for the exported video caption.</div>

        <label className="mt-4 block text-xs text-zinc-500">
          Output folder
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
              Browse
            </button>
          </div>
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-500">
            Tester
            <input
              value={tester}
              onChange={(e) => onTesterChange(e.target.value)}
              placeholder="QA name"
              className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Test note
            <input
              value={testNote}
              onChange={(e) => onTestNoteChange(e.target.value)}
              placeholder="Scope"
              className="mt-1 w-full rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </label>
        </div>

        {hasMissingNotes && (
          <div className="mt-3 rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            Some selected markers do not have notes. They will still export if you continue.
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !outputRoot.trim()}
            className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? 'Exporting...' : 'Export'}
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
        <div className="absolute left-1/2 top-1/2 h-5 w-px -translate-y-1/2 bg-zinc-400" title="marker time" />
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
          aria-label="Seconds before marker"
          className="absolute left-0 top-0 h-8 w-1/2 cursor-ew-resize opacity-0"
        />
        <input
          type="range"
          min={CLIP_MIN_SEC}
          max={CLIP_MAX_SEC}
          value={post}
          onChange={(e) => onPostChange(Number(e.target.value))}
          data-testid={`post-${id}`}
          aria-label="Seconds after marker"
          className="absolute left-1/2 top-0 h-8 w-1/2 cursor-ew-resize opacity-0"
        />
      </div>
      <span className="tabular-nums">+{post}s</span>
    </div>
  )
}

export function BugList({ api, sessionId, bugs, selectedBugId, onSelect, onMutated, allowExport = true, autoFocusLatest = false, tester = '', testNote = '' }: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null)
  const [exportRoot, setExportRoot] = useState('')
  const [exportTester, setExportTester] = useState(tester)
  const [exportTestNote, setExportTestNote] = useState(testNote)
  const knownBugIdsRef = useRef<Set<string>>(new Set())

  const allChecked = bugs.length > 0 && bugs.every(b => checked.has(b.id))
  const checkedIds = useMemo(() => bugs.filter(b => checked.has(b.id)).map(b => b.id), [bugs, checked])

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
    setExportTester(tester)
    setExportTestNote(testNote)
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
    setExporting(true)
    try {
      await api.settings.setExportRoot(trimmedRoot)
      await api.session.updateMetadata(sessionId, {
        tester: exportTester.trim(),
        testNote: exportTestNote.trim(),
      })
      onMutated()
      const paths = exportRequest.bugIds.length === 1
        ? ([await api.bug.exportClip({ sessionId, bugId: exportRequest.bugIds[0] })].filter(Boolean) as string[])
        : await api.bug.exportClips({ sessionId, bugIds: exportRequest.bugIds })
      if (paths && paths.length > 0) notifyExported(api, paths[0], paths.length)
      setExportRequest(null)
    } finally {
      setExporting(false)
    }
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
            Select all
          </label>
          <button
            onClick={exportSelected}
            disabled={checkedIds.length === 0 || exporting}
            className="ml-auto rounded bg-blue-700 px-2.5 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : `Export ${checkedIds.length || ''}`}
          </button>
        </div>
      )}
      <ul className="space-y-1.5 p-2" data-testid="bug-list">
        {bugs.length === 0 && <li className="p-4 text-sm text-zinc-500">No markers yet.</li>}
        {bugs.map(b => (
          <BugRow
            key={b.id}
            bug={b}
            api={api}
            sessionId={sessionId}
            isSelected={b.id === selectedBugId}
            isChecked={checked.has(b.id)}
            thumbnailUrl={thumbs[b.id]}
            onSelect={onSelect}
            onCheckedChange={toggleOne}
            onMutated={onMutated}
            allowExport={allowExport}
            shouldScrollIntoView={autoFocusLatest && b.id === selectedBugId}
            tester={tester}
            onExportRequest={(bug) => beginExport({ bugs: [bug], bugIds: [bug.id] })}
          />
        ))}
      </ul>
      {exportRequest && (
        <ExportConfirmDialog
          count={exportRequest.bugIds.length}
          outputRoot={exportRoot}
          tester={exportTester}
          testNote={exportTestNote}
          busy={exporting}
          hasMissingNotes={exportRequest.bugs.some(b => !b.note.trim())}
          onOutputRootChange={setExportRoot}
          onTesterChange={setExportTester}
          onTestNoteChange={setExportTestNote}
          onBrowseOutputRoot={browseExportRoot}
          onCancel={() => { if (!exporting) setExportRequest(null) }}
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
  onSelect(bug: Bug): void
  onCheckedChange(id: string): void
  onMutated(): void
  allowExport: boolean
  shouldScrollIntoView: boolean
  tester: string
  onExportRequest(bug: Bug): void
}

function BugRow({ bug, api, sessionId, isSelected, isChecked, thumbnailUrl, onSelect, onCheckedChange, onMutated, allowExport, shouldScrollIntoView, onExportRequest }: RowProps) {
  const [note, setNote] = useState(bug.note)
  const [pre, setPre] = useState(bug.preSec)
  const [post, setPost] = useState(bug.postSec)
  const rowRef = useRef<HTMLLIElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordStartedAtRef = useRef(0)
  const [recording, setRecording] = useState(false)

  useEffect(() => { setNote(bug.note) }, [bug.note])
  useEffect(() => { setPre(bug.preSec) }, [bug.preSec])
  useEffect(() => { setPost(bug.postSec) }, [bug.postSec])
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

  async function save(patch: Partial<Pick<Bug, 'note' | 'severity' | 'preSec' | 'postSec'>>) {
    await api.bug.update(bug.id, {
      note: bug.note,
      severity: bug.severity,
      preSec: bug.preSec,
      postSec: bug.postSec,
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

  async function del() {
    if (!confirm('Delete this marker?')) return
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
            aria-label={`Select marker ${fmt(bug.offsetMs)}`}
          />
        )}

        <div title={`Type: ${bug.severity}`} data-testid={`severity-${bug.id}`} className="mt-1 shrink-0">
          <div className={`h-3 w-3 rounded-full ${markerClass(bug.severity)}`} />
        </div>

        <button onClick={() => onSelect(bug)} className="shrink-0" title="Screenshot at marker time">
          {thumbnailUrl
            ? (
              <img
                src={thumbnailUrl}
                alt=""
                data-testid={`thumb-${bug.id}`}
                className="h-24 w-28 rounded border border-zinc-800 bg-black object-contain"
              />
            )
            : Date.now() - bug.createdAt < THUMB_PENDING_MS
              ? <ThumbnailWaiting />
              : <div className="h-24 w-28 rounded border border-zinc-800 bg-zinc-950" />
          }
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <button onClick={() => onSelect(bug)} className="text-left">
              <div className="text-xs font-mono text-zinc-400">{fmt(bug.offsetMs)} - {bug.severity}</div>
            </button>
            <div className="ml-auto flex gap-1">
              {allowExport && (
                <button
                  onClick={exportClip}
                  data-testid={`export-${bug.id}`}
                  title="Export clip"
                  className="inline-flex h-8 w-8 items-center justify-center rounded bg-zinc-800 text-zinc-200 hover:bg-blue-700 hover:text-white"
                >
                  <DownloadIcon />
                </button>
              )}
              <button
                onClick={toggleRecording}
                data-testid={`record-audio-${bug.id}`}
                title={recording ? 'Stop recording note audio' : bug.audioRel ? 'Replace audio note' : 'Record audio note'}
                className={`inline-flex h-8 w-8 items-center justify-center rounded text-zinc-200 hover:text-white ${
                  recording ? 'bg-red-700 hover:bg-red-600' : bug.audioRel ? 'bg-emerald-800 hover:bg-emerald-700' : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
              >
                <MicIcon />
              </button>
              <button
                onClick={del}
                data-testid={`delete-${bug.id}`}
                title="Delete marker"
                className="inline-flex h-8 w-8 items-center justify-center rounded bg-zinc-800 text-zinc-200 hover:bg-red-700 hover:text-white"
              >
                <DeleteIcon />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {SEVERITIES.map(severity => {
              const active = severity === bug.severity
              return (
                <button
                  key={severity}
                  type="button"
                  onClick={() => { if (!active) save({ severity }) }}
                  data-testid={`severity-${severity}-${bug.id}`}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    active ? severityClass(severity) : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
                  }`}
                >
                  {severity}
                </button>
              )
            })}
          </div>

          <textarea
            ref={noteRef}
            value={note}
            rows={1}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setNote(bug.note); (e.target as HTMLTextAreaElement).blur() }
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') (e.target as HTMLTextAreaElement).blur()
            }}
            maxLength={200}
            placeholder="Add note"
            data-testid={`note-${bug.id}`}
            className="max-h-32 min-h-8 w-full resize-none overflow-hidden rounded bg-zinc-950/40 px-2 py-1 text-sm text-zinc-200 outline-none hover:bg-zinc-950 focus:bg-zinc-800 focus:ring-1 focus:ring-blue-600"
          />

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
