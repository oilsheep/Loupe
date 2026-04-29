import { useEffect, useState } from 'react'
import type { Device, DesktopApi, MdnsEntry, PcCaptureSource } from '@shared/types'

interface Props {
  api: DesktopApi
  selectedId: string | null
  onSelect(id: string, mode: 'usb' | 'wifi' | 'pc', label?: string): void
}

const LABEL_KEY = 'loupe.deviceLabels'

function readLabels(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LABEL_KEY) ?? '{}') } catch { return {} }
}

function writeLabels(map: Record<string, string>) {
  localStorage.setItem(LABEL_KEY, JSON.stringify(map))
}

export function DevicePicker({ api, selectedId, onSelect }: Props) {
  const [devices, setDevices] = useState<Device[]>([])
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null)
  const [wifiIp, setWifiIp] = useState('')
  const [wifiBusy, setWifiBusy] = useState(false)

  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [labels, setLabels] = useState<Record<string, string>>(readLabels)
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  const [labelDraft, setLabelDraft] = useState('')

  const [mdnsEntries, setMdnsEntries] = useState<MdnsEntry[] | null>(null)
  const [mdnsScanning, setMdnsScanning] = useState(false)
  const [pairCodes, setPairCodes] = useState<Record<string, string>>({})
  const [pairingInFlight, setPairingInFlight] = useState<Set<string>>(new Set())
  const [pcSources, setPcSources] = useState<PcCaptureSource[]>([])
  const [pcSourcesLoading, setPcSourcesLoading] = useState(false)

  async function refresh() {
    try {
      setDevices(await api.device.list())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    refresh()
    refreshPcSources()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [])

  async function refreshPcSources() {
    setPcSourcesLoading(true)
    try {
      const sources = await api.app.listPcCaptureSources()
      setPcSources(sources.filter(source => source.type === 'screen'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPcSourcesLoading(false)
    }
  }

  useEffect(() => {
    for (const d of devices) {
      if (d.state !== 'device' || d.id in userNames) continue
      api.device.getUserName(d.id).then(name => {
        if (name) setUserNames(prev => ({ ...prev, [d.id]: name }))
      }).catch(() => {})
    }
  }, [devices, api, userNames])

  function displayName(d: Device): string {
    return labels[d.id] || userNames[d.id] || d.model || d.id
  }

  function upsertConnectedDevice(id: string, mode: 'usb' | 'wifi', label?: string) {
    setDevices(prev => {
      const next = prev.some(d => d.id === id)
        ? prev.map(d => d.id === id ? { ...d, type: mode, state: 'device' as const, model: d.model ?? label } : d)
        : [{ id, type: mode, state: 'device' as const, model: label }, ...prev]
      return next
    })
  }

  async function markConnected(id: string, mode: 'usb' | 'wifi') {
    void api.app.hidePcCaptureFrame()
    upsertConnectedDevice(id, mode)
    setError(null)
    setConnectionStatus(`Connected: ${userNames[id] || labels[id] || id}`)
    onSelect(id, mode)
    api.device.getUserName(id).then(name => {
      if (!name) return
      setUserNames(prev => ({ ...prev, [id]: name }))
      setConnectionStatus(`Connected: ${name}`)
    }).catch(() => {})
  }

  function startEditLabel(id: string) {
    setEditingLabel(id)
    setLabelDraft(labels[id] ?? '')
  }

  function commitLabel(id: string) {
    const v = labelDraft.trim()
    setLabels(prev => {
      const next = { ...prev }
      if (v) next[id] = v
      else delete next[id]
      writeLabels(next)
      return next
    })
    setEditingLabel(null)
  }

  async function addWifi() {
    if (!wifiIp.trim()) return
    setWifiBusy(true)
    try {
      const [ip, rawPort] = wifiIp.trim().split(':')
      const port = rawPort ? Number(rawPort) : undefined
      const r = await api.device.connect(ip, port)
      const id = `${ip}:${port ?? 5555}`
      if (r.ok) {
        await refresh()
        await markConnected(id, 'wifi')
        setWifiIp('')
      } else {
        setError(r.message)
        setConnectionStatus(null)
      }
    } finally {
      setWifiBusy(false)
    }
  }

  async function runMdnsScan() {
    setMdnsScanning(true)
    setError(null)
    try {
      const entries = await api.device.mdnsScan()
      setMdnsEntries(entries)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setMdnsScanning(false)
    }
  }

  async function connectMdnsEntry(entry: MdnsEntry) {
    const [ip, portStr] = entry.ipPort.split(':')
    const port = portStr ? Number(portStr) : undefined
    const r = await api.device.connect(ip, port)
    if (r.ok) {
      await refresh()
      await markConnected(entry.ipPort, 'wifi')
    } else {
      setError(r.message)
      setConnectionStatus(null)
    }
  }

  async function submitPair(entry: MdnsEntry) {
    const code = pairCodes[entry.ipPort] ?? ''
    if (!code.trim()) return
    setPairingInFlight(prev => new Set(prev).add(entry.ipPort))
    try {
      const r = await api.device.pair({ ipPort: entry.ipPort, code: code.trim() })
      if (!r.ok) {
        setError(r.message)
      } else {
        setPairCodes(prev => {
          const next = { ...prev }
          delete next[entry.ipPort]
          return next
        })
        await runMdnsScan()
      }
    } finally {
      setPairingInFlight(prev => {
        const next = new Set(prev)
        next.delete(entry.ipPort)
        return next
      })
    }
  }

  function setPairCode(ipPort: string, code: string) {
    setPairCodes(prev => ({ ...prev, [ipPort]: code }))
  }

  function togglePairForm(ipPort: string) {
    setPairCodes(prev => {
      if (ipPort in prev) {
        const next = { ...prev }
        delete next[ipPort]
        return next
      }
      return { ...prev, [ipPort]: '' }
    })
  }

  function selectPcSource(source: PcCaptureSource) {
    onSelect(source.id, 'pc', source.name)
    void api.app.showPcCaptureFrame(source.id, 'green', source.displayId)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300">Recording source</h2>
        <button onClick={refresh} className="text-xs text-zinc-400 hover:text-zinc-200">refresh</button>
      </div>

      {error && <div className="rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>}
      {connectionStatus && (
        <div className="rounded border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
          {connectionStatus}
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">PC recording</div>
            <div className="mt-0.5 text-xs text-zinc-500">Choose which screen to record.</div>
          </div>
          <button
            type="button"
            onClick={refreshPcSources}
            disabled={pcSourcesLoading}
            className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
          >
            {pcSourcesLoading ? 'loading...' : 'refresh'}
          </button>
        </div>
        <div className="mt-2 max-h-40 space-y-1 overflow-auto pr-1">
          {pcSources.length === 0 && <div className="text-xs text-zinc-500">No screens found.</div>}
          {pcSources.map(source => {
            const isSel = selectedId === source.id
            return (
              <button
                key={source.id}
                type="button"
                data-testid={`source-pc-${source.id}`}
                onClick={() => selectPcSource(source)}
                className={`w-full rounded px-2 py-2 text-left text-xs
                  ${isSel ? 'bg-blue-700 text-white' : 'bg-zinc-950 text-zinc-300 hover:bg-zinc-800'}`}
              >
                <span className={`mr-2 rounded px-1.5 py-0.5 ${source.type === 'screen' ? 'bg-red-950 text-red-200' : 'bg-zinc-800 text-zinc-300'}`}>
                  screen
                </span>
                <span className="align-middle">{source.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-zinc-500">Android devices</div>
        {devices.length === 0 && <div className="text-xs text-zinc-500">No devices yet. Connect with USB or add a Wi-Fi device below.</div>}
        {devices.map(d => {
          const isSel = selectedId === d.id
          const isEditing = editingLabel === d.id
          const subtitle = [
            d.type.toUpperCase(),
            d.state,
            userNames[d.id],
            d.model,
            d.id,
          ].filter(Boolean).join(' / ')
          return (
            <div
              key={d.id}
              data-testid={`device-${d.id}`}
              onClick={() => d.state === 'device' && markConnected(d.id, d.type)}
              className={`rounded px-3 py-2 text-sm
                ${isSel ? 'bg-blue-700 text-white' : 'bg-zinc-900 text-zinc-200'}
                ${d.state !== 'device' ? 'opacity-50' : 'cursor-pointer hover:bg-zinc-800'}`}
            >
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <input
                    autoFocus
                    value={labelDraft}
                    onChange={e => setLabelDraft(e.target.value)}
                    onBlur={() => commitLabel(d.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingLabel(null)
                    }}
                    placeholder="custom label (e.g. Pixel-7-A)"
                    data-testid={`label-input-${d.id}`}
                    className="flex-1 rounded bg-zinc-800 px-2 py-0.5 text-zinc-100 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      d.state === 'device' && markConnected(d.id, d.type)
                    }}
                    disabled={d.state !== 'device'}
                    className="flex-1 truncate text-left font-medium"
                    data-testid={`device-select-${d.id}`}
                  >
                    {displayName(d)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    isEditing ? commitLabel(d.id) : startEditLabel(d.id)
                  }}
                  data-testid={`label-edit-${d.id}`}
                  title="Edit custom label"
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  {isEditing ? 'save' : labels[d.id] ? 'rename' : 'label'}
                </button>
              </div>
              <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-zinc-400">
                {isSel && <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-emerald-200">connected</span>}
                <span className="truncate">{subtitle}</span>
              </div>
              {isSel && (
                <div className="mt-1 text-[11px] text-blue-200">
                  Selected. Set build details and optional PC screen recording on the right.
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="space-y-2 border-t border-zinc-800 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Wi-Fi auto-discovery (Android 11+)</span>
          <button
            onClick={runMdnsScan}
            disabled={mdnsScanning}
            data-testid="mdns-scan-button"
            className="rounded bg-teal-700 px-3 py-1 text-xs text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {mdnsScanning ? 'scanning...' : 'Scan Wi-Fi devices'}
          </button>
        </div>

        {mdnsEntries !== null && mdnsEntries.length === 0 && (
          <div className="text-xs text-zinc-500">No devices found. Make sure Wireless debugging is on, or use the connected Wi-Fi device above.</div>
        )}

        {mdnsEntries !== null && mdnsEntries.length > 0 && (
          <div className="space-y-1">
            {mdnsEntries.map(entry => (
              <div
                key={`${entry.type}-${entry.ipPort}`}
                data-testid={`mdns-entry-${entry.ipPort}`}
                className="space-y-1 rounded bg-zinc-900 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs text-zinc-100">{entry.ipPort}</span>
                    <span className={`ml-2 text-xs ${entry.type === 'pair' ? 'text-amber-400' : 'text-teal-400'}`}>
                      {entry.type === 'pair' ? 'needs pairing' : 'ready'}
                    </span>
                  </div>
                  {entry.type === 'connect' ? (
                    <button
                      onClick={() => connectMdnsEntry(entry)}
                      data-testid={`mdns-connect-button-${entry.ipPort}`}
                      className="rounded bg-teal-700 px-3 py-1 text-xs text-white hover:bg-teal-600"
                    >
                      Connect
                    </button>
                  ) : (
                    <button
                      onClick={() => togglePairForm(entry.ipPort)}
                      data-testid={`mdns-pair-button-${entry.ipPort}`}
                      className="rounded bg-amber-700 px-3 py-1 text-xs text-white hover:bg-amber-600"
                    >
                      Pair
                    </button>
                  )}
                </div>
                {entry.type === 'pair' && entry.ipPort in pairCodes && (
                  <div className="mt-1 flex gap-2">
                    <input
                      value={pairCodes[entry.ipPort] ?? ''}
                      onChange={e => setPairCode(entry.ipPort, e.target.value)}
                      placeholder="6-digit code"
                      maxLength={6}
                      data-testid={`mdns-pair-code-${entry.ipPort}`}
                      className="flex-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      onClick={() => submitPair(entry)}
                      disabled={pairingInFlight.has(entry.ipPort)}
                      data-testid={`mdns-pair-submit-${entry.ipPort}`}
                      className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                      {pairingInFlight.has(entry.ipPort) ? 'pairing...' : 'Submit'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <label className="text-xs text-zinc-400">Add Wi-Fi device manually (use the connect port, not the pairing port)</label>
        <div className="mt-1 flex gap-2">
          <input
            value={wifiIp}
            onChange={e => setWifiIp(e.target.value)}
            placeholder="ip[:connect-port]"
            data-testid="wifi-ip"
            className="flex-1 rounded bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
          />
          <button
            onClick={addWifi}
            disabled={wifiBusy}
            data-testid="wifi-connect"
            className="rounded bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {wifiBusy ? 'connecting...' : 'connect'}
          </button>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          Example: use the Ready or Connect address from Android Wireless debugging, or run Scan Wi-Fi devices above after pairing.
        </div>
      </div>
    </div>
  )
}
