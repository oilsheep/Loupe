import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { DevicePicker } from '@/components/DevicePicker'
import { NewSessionForm } from '@/components/NewSessionForm'
import type { SlackPublishSettings, ToolCheck } from '@shared/types'
import { useApp } from '@/lib/store'

export function Home() {
  const goDraft = useApp(s => s.goDraft)
  const [selected, setSelected] = useState<{ id: string; mode: 'usb' | 'wifi' | 'pc'; label?: string } | null>(null)
  const [checks, setChecks] = useState<ToolCheck[]>([])
  const [opening, setOpening] = useState(false)
  const [exportRoot, setExportRoot] = useState('')
  const [slack, setSlack] = useState<SlackPublishSettings>({ botToken: '', channelId: '' })
  const [savingSlack, setSavingSlack] = useState(false)
  const [slackSaved, setSlackSaved] = useState(false)

  useEffect(() => { api.doctor().then(setChecks) }, [])
  useEffect(() => {
    api.settings.get().then(s => {
      setExportRoot(s.exportRoot)
      setSlack(s.slack)
    })
  }, [])

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

  async function saveSlackSettings() {
    setSavingSlack(true)
    setSlackSaved(false)
    try {
      const settings = await api.settings.setSlack({
        botToken: slack.botToken.trim(),
        channelId: slack.channelId.trim(),
      })
      setSlack(settings.slack)
      setSlackSaved(true)
    } finally {
      setSavingSlack(false)
    }
  }

  return (
    <div className="grid h-screen grid-cols-[360px_1fr] bg-zinc-950 text-zinc-100">
      <aside className="border-r border-zinc-800 p-4">
        <h1 className="mb-4 text-lg font-semibold">Loupe</h1>
        <DevicePicker
          api={api}
          selectedId={selected?.id ?? null}
          onSelect={(id, mode, label) => setSelected({ id, mode, label })}
        />
      </aside>
      <main className="overflow-auto p-8">
        {missing.length > 0 && (
          <div className="mb-6 rounded border border-yellow-700 bg-yellow-950/40 p-4 text-sm text-yellow-200">
            <div className="font-medium">Missing tools:</div>
            <ul className="mt-1 list-disc pl-5">
              {missing.map(c => <li key={c.name}><code>{c.name}</code> - {c.error}</li>)}
            </ul>
            <p className="mt-2 text-xs text-yellow-300/80">
              See README for setup details. The app cannot record until required tools are available.
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
              <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Choose PC screen or an Android device to start recording QA sessions.</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Loupe records the selected screen, lets you drop markers with configurable hotkeys, then exports clipped evidence videos and review sheets.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <div className="border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="text-lg font-semibold text-blue-300">1</div>
                <div className="mt-2 font-medium text-zinc-200">Pick a source</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">Choose PC screen, USB Android, or Wi-Fi Android from the left panel.</div>
              </div>
              <div className="border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="text-lg font-semibold text-blue-300">2</div>
                <div className="mt-2 font-medium text-zinc-200">Fill session info</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">Add build version and optional test note before starting.</div>
              </div>
              <div className="border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="text-lg font-semibold text-blue-300">3</div>
                <div className="mt-2 font-medium text-zinc-200">Record and mark</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">F6 improvement, F7 minor, F8 normal, F9 major by default while recording.</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div className="border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-xs uppercase tracking-wider text-zinc-500">Android setup</div>
                <h3 className="mt-2 font-medium text-zinc-100">Enable Developer options</h3>
                <ol className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                  <li>1. Open Android Settings.</li>
                  <li>2. Go to About phone.</li>
                  <li>3. Tap Build number seven times.</li>
                  <li>4. Return to Settings and open System / Developer options.</li>
                </ol>
                <a
                  href="https://developer.android.com/studio/debug/dev-options"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs text-blue-300 hover:text-blue-200"
                >
                  Official Android developer options guide
                </a>
              </div>

              <div className="border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-xs uppercase tracking-wider text-zinc-500">Connection choices</div>
                <h3 className="mt-2 font-medium text-zinc-100">USB or Wi-Fi debugging</h3>
                <div className="mt-3 space-y-3 text-xs leading-5 text-zinc-400">
                  <p>USB: turn on USB debugging, connect a data cable, then allow the debugging prompt on the phone.</p>
                  <p>Wi-Fi: turn on Wireless debugging, choose Pair device with pairing code, scan in Loupe, enter the six-digit code, then connect the ready entry.</p>
                </div>
                <a
                  href="https://developer.android.com/studio/run/device#wireless"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs text-blue-300 hover:text-blue-200"
                >
                  Official Wi-Fi pairing guide with screenshots
                </a>
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

        <div className="mb-6 border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="mb-2 text-xs font-medium text-zinc-300">Publish</div>
          <div className="grid grid-cols-[1fr_180px] gap-2">
            <label className="text-xs text-zinc-500">
              Slack bot token
              <input
                value={slack.botToken}
                onChange={(e) => { setSlack({ ...slack, botToken: e.target.value }); setSlackSaved(false) }}
                type="password"
                placeholder="xoxb-..."
                className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>
            <label className="text-xs text-zinc-500">
              Slack channel ID
              <input
                value={slack.channelId}
                onChange={(e) => { setSlack({ ...slack, channelId: e.target.value }); setSlackSaved(false) }}
                placeholder="C..."
                className="mt-1 w-full rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            {slackSaved && <span className="text-xs text-emerald-300">Saved</span>}
            <button
              onClick={saveSlackSettings}
              disabled={savingSlack}
              className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {savingSlack ? 'Saving...' : 'Save publish settings'}
            </button>
          </div>
        </div>

        <h3 className="mb-4 text-sm font-medium text-zinc-300">New session</h3>
        {selected
          ? <NewSessionForm api={api} deviceId={selected.id} connectionMode={selected.mode} sourceName={selected.label} />
          : (
            <div className="border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
              Select a PC screen or Android device on the left to begin. If Android does not appear, check USB debugging authorization on the phone or use Wi-Fi pairing.
            </div>
          )
        }
      </main>
    </div>
  )
}
