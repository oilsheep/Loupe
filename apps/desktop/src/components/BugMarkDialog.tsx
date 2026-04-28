import { useEffect, useRef, useState } from 'react'
import type { BugSeverity, DesktopApi } from '@shared/types'

interface Props {
  open: boolean
  api: DesktopApi
  onSubmitted(): void
  onCancel(): void
}

export function BugMarkDialog({ open, api, onSubmitted, onCancel }: Props) {
  const [severity, setSeverity] = useState<BugSeverity>('normal')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setNote(''); setSeverity('normal')
      // Focus shortly after render so the modal is mounted.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  if (!open) return null

  async function submit() {
    if (!note.trim()) return
    setBusy(true)
    try {
      await api.session.markBug({ severity, note: note.trim() })
      onSubmitted()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32" data-testid="bug-dialog">
      <div className="w-[420px] rounded-lg bg-zinc-900 p-4 shadow-2xl">
        <div className="mb-2 text-xs text-zinc-400">F8 — Mark bug</div>
        <div className="flex gap-2">
          <button
            onClick={() => setSeverity('major')}
            className={`flex-1 rounded px-3 py-1 text-sm ${severity === 'major' ? 'bg-red-700 text-white' : 'bg-zinc-800 text-zinc-200'}`}
            data-testid="severity-major"
          >Major</button>
          <button
            onClick={() => setSeverity('normal')}
            className={`flex-1 rounded px-3 py-1 text-sm ${severity === 'normal' ? 'bg-amber-700 text-white' : 'bg-zinc-800 text-zinc-200'}`}
            data-testid="severity-normal"
          >Normal</button>
        </div>
        <input
          ref={inputRef} value={note} onChange={e => setNote(e.target.value)} maxLength={200}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit() }
            if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          }}
          placeholder="What happened?  (Enter to save · Esc to cancel)" data-testid="bug-note"
          className="mt-3 w-full rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
        />
        <div className="mt-2 text-right text-xs text-zinc-500">{note.length}/200{busy ? ' · saving…' : ''}</div>
      </div>
    </div>
  )
}
