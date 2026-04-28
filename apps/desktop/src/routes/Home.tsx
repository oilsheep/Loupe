import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import type { ToolCheck } from '@shared/types'
import { useApp } from '@/lib/store'

export function Home() {
  const goDraft = useApp(s => s.goDraft)
  const [selected, setSelected] = useState<{ id: string; mode: 'usb' | 'wifi' } | null>(null)
  const [checks, setChecks] = useState<ToolCheck[]>([])
  const [opening, setOpening] = useState(false)
  const [exportRoot, setExportRoot] = useState('')

  useEffect(() => { api.doctor().then(setChecks) }, [])
  useEffect(() => { api.settings.get().then(s => setExportRoot(s.exportRoot)) }, [])

  const missing = checks.filter(c => !c.ok)

  async function openSavedSession() {
    setOpening(true)
    try {
      const session = await api.session.openProject()
      if (session) goDraft(session.id)
    } finally {
      setOpening(false)
    }
  }

  async function chooseExportRoot() {
    const settings = await api.settings.chooseExportRoot()
    if (settings) setExportRoot(settings.exportRoot)
  }

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

        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-300">Session</h2>
          <button
            onClick={openSavedSession}
            disabled={opening}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            {opening ? 'Opening...' : 'Open saved session'}
          </button>
        </div>

        {!selected && (
          <section className="mb-6 border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="max-w-2xl">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Get started</div>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Connect an Android device to start recording QA sessions.</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Loupe records the device screen, lets you drop markers with configurable hotkeys, then exports clipped evidence videos and review sheets.
              </p>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <div className="border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="text-lg font-semibold text-blue-300">1</div>
                <div className="mt-2 font-medium text-zinc-200">Plug in or pair</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">Use USB debugging or Wi-Fi pairing from the left panel.</div>
              </div>
              <div className="border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="text-lg font-semibold text-blue-300">2</div>
                <div className="mt-2 font-medium text-zinc-200">Pick the device</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">Once a device appears, select it to reveal the session form.</div>
              </div>
              <div className="border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="text-lg font-semibold text-blue-300">3</div>
                <div className="mt-2 font-medium text-zinc-200">Record and mark</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">F6 improvement, F7 minor, F8 normal, F9 major by default while recording.</div>
              </div>
            </div>
          </section>
        )}

        <div className="mb-6 border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-2 text-xs font-medium text-zinc-300">Export folder</div>
          <div className="flex items-center gap-2">
            <input
              value={exportRoot}
              onChange={(e) => setExportRoot(e.target.value)}
              onBlur={() => { if (exportRoot.trim()) api.settings.setExportRoot(exportRoot.trim()).then(s => setExportRoot(s.exportRoot)) }}
              className="min-w-0 flex-1 rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
            />
            <button
              onClick={chooseExportRoot}
              className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Browse
            </button>
          </div>
        </div>

        <h3 className="mb-4 text-sm font-medium text-zinc-300">New session</h3>
        {selected
          ? <NewSessionForm api={api} deviceId={selected.id} connectionMode={selected.mode} />
          : (
            <div className="border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
              Select a device on the left to begin. If nothing appears, check USB debugging authorization on the phone or use Wi-Fi pairing.
            </div>
          )
        }
      </main>
    </div>
  )
}
