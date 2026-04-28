import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import type { ToolCheck } from '@shared/types'

export function Home() {
  const [selected, setSelected] = useState<{ id: string; mode: 'usb' | 'wifi' } | null>(null)
  const [checks, setChecks] = useState<ToolCheck[]>([])

  useEffect(() => { api.doctor().then(setChecks) }, [])

  const missing = checks.filter(c => !c.ok)

  return (
    <div className="grid h-screen grid-cols-[360px_1fr] bg-zinc-950 text-zinc-100">
      <aside className="border-r border-zinc-800 p-4">
        <h1 className="mb-4 text-lg font-semibold">Loupe</h1>
        <DevicePicker
          api={api}
          selectedId={selected?.id ?? null}
          onSelect={(id, mode) => setSelected({ id, mode })}
        />
      </aside>
      <main className="p-8">
        {missing.length > 0 && (
          <div className="mb-6 rounded border border-yellow-700 bg-yellow-950/40 p-4 text-sm text-yellow-200">
            <div className="font-medium">Missing tools:</div>
            <ul className="mt-1 list-disc pl-5">
              {missing.map(c => <li key={c.name}><code>{c.name}</code> — {c.error}</li>)}
            </ul>
            <p className="mt-2 text-xs text-yellow-300/80">
              See README → Pre-flight for installation links. The app cannot record until both tools are on PATH.
            </p>
          </div>
        )}

        <h2 className="mb-4 text-sm font-medium text-zinc-300">New session</h2>
        {selected
          ? <NewSessionForm api={api} deviceId={selected.id} connectionMode={selected.mode} />
          : <div className="text-sm text-zinc-500">Select a device on the left to begin.</div>
        }
      </main>
    </div>
  )
}
