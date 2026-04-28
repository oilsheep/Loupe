import { useEffect, useState } from 'react'
import type { Bug, BugSeverity, DesktopApi } from '@shared/types'
import { localFileUrl } from '@/lib/api'

interface Props {
  api: DesktopApi
  sessionId: string
  bugs: Bug[]
  selectedBugId: string | null
  onSelect(bug: Bug): void
  onMutated(): void
  /** Show "export clip" action (only meaningful after recording stops). Default true. */
  allowExport?: boolean
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function BugList({ api, sessionId, bugs, selectedBugId, onSelect, onMutated, allowExport = true }: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

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

  return (
    <ul className="divide-y divide-zinc-800" data-testid="bug-list">
      {bugs.length === 0 && <li className="p-4 text-sm text-zinc-500">No bugs marked.</li>}
      {bugs.map(b => (
        <BugRow
          key={b.id}
          bug={b}
          api={api}
          sessionId={sessionId}
          isSelected={b.id === selectedBugId}
          thumbnailUrl={thumbs[b.id]}
          onSelect={onSelect}
          onMutated={onMutated}
          allowExport={allowExport}
        />
      ))}
    </ul>
  )
}

interface RowProps {
  bug: Bug
  api: DesktopApi
  sessionId: string
  isSelected: boolean
  thumbnailUrl?: string
  onSelect(bug: Bug): void
  onMutated(): void
  allowExport: boolean
}

function BugRow({ bug, api, sessionId, isSelected, thumbnailUrl, onSelect, onMutated, allowExport }: RowProps) {
  const [note, setNote] = useState(bug.note)
  const [pre, setPre] = useState(bug.preSec)
  const [post, setPost] = useState(bug.postSec)

  // Re-sync when the prop changes from outside (e.g. another bug edited, refetch).
  useEffect(() => { setNote(bug.note) }, [bug.note])
  useEffect(() => { setPre(bug.preSec) }, [bug.preSec])
  useEffect(() => { setPost(bug.postSec) }, [bug.postSec])

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
    await save({ note: note.trim() || '(empty)' })
  }

  async function toggleSeverity() {
    await save({ severity: bug.severity === 'major' ? 'normal' : 'major' })
  }

  async function changePre(n: number)  { setPre(n);  await save({ preSec: n }) }
  async function changePost(n: number) { setPost(n); await save({ postSec: n }) }

  async function del() {
    if (!confirm('Delete this bug?')) return
    await api.bug.delete(bug.id); onMutated()
  }

  async function exportClip() {
    const path = await api.bug.exportClip({ sessionId, bugId: bug.id })
    if (path) alert(`Exported to:\n${path}`)
  }

  const sevColor = bug.severity === 'major' ? 'bg-red-500' : 'bg-amber-500'

  return (
    <li
      data-testid={`bug-row-${bug.id}`}
      className={`flex gap-3 p-3 ${isSelected ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'}`}
    >
      <button
        onClick={toggleSeverity}
        title={`Severity: ${bug.severity}. Click to toggle.`}
        data-testid={`severity-${bug.id}`}
        className="flex-shrink-0 self-start pt-1"
      >
        <div className={`h-3 w-3 rounded-full ${sevColor} hover:ring-2 hover:ring-zinc-500`} />
      </button>

      {thumbnailUrl && (
        <button
          onClick={() => onSelect(bug)}
          className="flex-shrink-0"
          title="Screenshot at bug-mark moment — click to seek"
        >
          <img
            src={thumbnailUrl}
            alt=""
            data-testid={`thumb-${bug.id}`}
            className="h-16 w-auto rounded border border-zinc-800 object-cover"
          />
        </button>
      )}

      <div className="min-w-0 flex-1 space-y-1">
        <button onClick={() => onSelect(bug)} className="text-left">
          <div className="text-xs font-mono text-zinc-400">
            {fmt(bug.offsetMs)} · {bug.severity}
          </div>
        </button>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') { setNote(bug.note); (e.target as HTMLInputElement).blur() }
          }}
          maxLength={200}
          data-testid={`note-${bug.id}`}
          className="w-full rounded bg-transparent px-1 py-0.5 text-sm text-zinc-200 outline-none hover:bg-zinc-900 focus:bg-zinc-800 focus:ring-1 focus:ring-blue-600"
        />

        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="w-12 shrink-0">pre {pre}s</span>
          <input
            type="range" min={0} max={60} value={pre}
            onChange={(e) => changePre(Number(e.target.value))}
            data-testid={`pre-${bug.id}`}
            className="flex-1 accent-blue-600"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="w-12 shrink-0">post {post}s</span>
          <input
            type="range" min={0} max={60} value={post}
            onChange={(e) => changePost(Number(e.target.value))}
            data-testid={`post-${bug.id}`}
            className="flex-1 accent-blue-600"
          />
        </div>

        <div className="flex gap-3 pt-1 text-xs text-zinc-500">
          {allowExport && (
            <button onClick={exportClip} data-testid={`export-${bug.id}`} className="hover:text-blue-400">
              export clip
            </button>
          )}
          <button onClick={del} data-testid={`delete-${bug.id}`} className="ml-auto hover:text-red-400">
            delete
          </button>
        </div>
      </div>
    </li>
  )
}
