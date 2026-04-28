import { useEffect, useState } from 'react'
import type { Bug, BugSeverity, DesktopApi } from '@shared/types'
import { localFileUrl } from '@/lib/api'

interface Props {
  api: DesktopApi
  sessionId: string
  bugs: Bug[]
  selectedBugId: string | null
  onSelect(bug: Bug): void
  onMutated(): void               // refetch parent
  /** Show "export clip" action (only meaningful after recording stops). Default true. */
  allowExport?: boolean
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function BugList({ api, sessionId, bugs, selectedBugId, onSelect, onMutated, allowExport = true }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftNote, setDraftNote] = useState('')
  const [draftSev, setDraftSev] = useState<BugSeverity>('normal')
  const [draftPre, setDraftPre] = useState(5)
  const [draftPost, setDraftPost] = useState(5)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  // Resolve screenshot URLs whenever the bug list changes. Uses the `api` prop
  // (not the singleton from @/lib/api) so component tests can supply a mock.
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

  function startEdit(b: Bug) {
    setEditingId(b.id); setDraftNote(b.note); setDraftSev(b.severity)
    setDraftPre(b.preSec); setDraftPost(b.postSec)
  }
  async function saveEdit(id: string) {
    await api.bug.update(id, {
      note: draftNote.trim() || '(empty)',
      severity: draftSev,
      preSec: Math.max(0, Math.round(draftPre)),
      postSec: Math.max(0, Math.round(draftPost)),
    })
    setEditingId(null); onMutated()
  }
  async function del(id: string) {
    if (!confirm('Delete this bug?')) return
    await api.bug.delete(id); onMutated()
  }
  async function exportClip(id: string) {
    const path = await api.bug.exportClip({ sessionId, bugId: id })
    if (path) alert(`Exported to:\n${path}`)
  }

  return (
    <ul className="divide-y divide-zinc-800" data-testid="bug-list">
      {bugs.length === 0 && <li className="p-4 text-sm text-zinc-500">No bugs marked.</li>}
      {bugs.map(b => {
        const isSel = b.id === selectedBugId
        const sevColor = b.severity === 'major' ? 'bg-red-500' : 'bg-amber-500'
        const isEditing = editingId === b.id
        return (
          <li
            key={b.id}
            data-testid={`bug-row-${b.id}`}
            className={`flex gap-3 p-3 ${isSel ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'}`}
          >
            <button onClick={() => onSelect(b)} className="flex-shrink-0 self-start">
              <div className={`h-2 w-2 rounded-full ${sevColor}`} />
            </button>
            {thumbs[b.id] && (
              <button
                onClick={() => onSelect(b)}
                className="flex-shrink-0"
                title="Screenshot at bug-mark moment"
              >
                <img
                  src={thumbs[b.id]}
                  alt=""
                  data-testid={`thumb-${b.id}`}
                  className="h-16 w-auto rounded border border-zinc-800 object-cover"
                />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <button onClick={() => onSelect(b)} className="text-left">
                <div className="text-xs font-mono text-zinc-400">{fmt(b.offsetMs)} · {b.severity} · clip {b.preSec}s/{b.postSec}s</div>
              </button>
              {isEditing ? (
                <div className="mt-1 space-y-2">
                  <input
                    value={draftNote} onChange={e => setDraftNote(e.target.value)}
                    className="w-full rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
                    data-testid={`edit-note-${b.id}`}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button onClick={() => setDraftSev('major')}  className={`rounded px-2 py-0.5 ${draftSev === 'major'  ? 'bg-red-700' : 'bg-zinc-800'}`}>Major</button>
                    <button onClick={() => setDraftSev('normal')} className={`rounded px-2 py-0.5 ${draftSev === 'normal' ? 'bg-amber-700' : 'bg-zinc-800'}`}>Normal</button>
                    <span className="ml-2 text-zinc-500">clip:</span>
                    <input
                      type="number" min={0} max={300} value={draftPre}
                      onChange={e => setDraftPre(Number(e.target.value))}
                      data-testid={`edit-pre-${b.id}`}
                      className="w-12 rounded bg-zinc-800 px-1 py-0.5 text-center text-zinc-100"
                    />
                    <span className="text-zinc-500">s before /</span>
                    <input
                      type="number" min={0} max={300} value={draftPost}
                      onChange={e => setDraftPost(Number(e.target.value))}
                      data-testid={`edit-post-${b.id}`}
                      className="w-12 rounded bg-zinc-800 px-1 py-0.5 text-center text-zinc-100"
                    />
                    <span className="text-zinc-500">s after</span>
                    <button onClick={() => saveEdit(b.id)} data-testid={`save-${b.id}`} className="ml-auto rounded bg-blue-700 px-2 py-0.5">Save</button>
                    <button onClick={() => setEditingId(null)} className="rounded bg-zinc-800 px-2 py-0.5">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={() => onSelect(b)} className="w-full text-left">
                    <div className="mt-0.5 truncate text-sm text-zinc-200">{b.note}</div>
                  </button>
                  <div className="mt-1 flex gap-3 text-xs text-zinc-500">
                    <button onClick={() => startEdit(b)} data-testid={`edit-${b.id}`} className="hover:text-zinc-300">edit</button>
                    <button onClick={() => del(b.id)} data-testid={`delete-${b.id}`} className="hover:text-red-400">delete</button>
                    {allowExport && (
                      <button onClick={() => exportClip(b.id)} data-testid={`export-${b.id}`} className="hover:text-blue-400">export clip</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
