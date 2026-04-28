import { useEffect, useState } from 'react'
import type { Device, DesktopApi, MdnsEntry } from '@shared/types'

interface Props {
  api: DesktopApi
  selectedId: string | null
  onSelect(id: string, mode: 'usb' | 'wifi'): void
}

export function DevicePicker({ api, selectedId, onSelect }: Props) {
  const [devices, setDevices] = useState<Device[]>([])
  const [error, setError] = useState<string | null>(null)
  const [wifiIp, setWifiIp] = useState('')
  const [wifiBusy, setWifiBusy] = useState(false)

  // mDNS scan state
  const [mdnsEntries, setMdnsEntries] = useState<MdnsEntry[] | null>(null)
  const [mdnsScanning, setMdnsScanning] = useState(false)
  // Map of ipPort → pair code being entered
  const [pairCodes, setPairCodes] = useState<Record<string, string>>({})
  // Set of ipPorts currently submitting pair
  const [pairingInFlight, setPairingInFlight] = useState<Set<string>>(new Set())

  async function refresh() {
    try { setDevices(await api.device.list()); setError(null) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [])

  async function addWifi() {
    if (!wifiIp.trim()) return
    setWifiBusy(true)
    try {
      const [ip, rawPort] = wifiIp.trim().split(':')
      const port = rawPort ? Number(rawPort) : undefined
      const r = await api.device.connect(ip, port)
      if (!r.ok) setError(r.message)
      await refresh()
    } finally { setWifiBusy(false) }
  }

  async function runMdnsScan() {
    setMdnsScanning(true)
    try {
      const entries = await api.device.mdnsScan()
      setMdnsEntries(entries)
    } finally {
      setMdnsScanning(false)
    }
  }

  async function connectMdnsEntry(entry: MdnsEntry) {
    const [ip, portStr] = entry.ipPort.split(':')
    const port = portStr ? Number(portStr) : undefined
    const r = await api.device.connect(ip, port)
    if (!r.ok) setError(r.message)
    await refresh()
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
        // Clear the code input and re-run scan so the connect entry appears
        setPairCodes(prev => { const next = { ...prev }; delete next[entry.ipPort]; return next })
        await runMdnsScan()
      }
    } finally {
      setPairingInFlight(prev => { const next = new Set(prev); next.delete(entry.ipPort); return next })
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300">Devices</h2>
        <button onClick={refresh} className="text-xs text-zinc-400 hover:text-zinc-200">refresh</button>
      </div>

      {error && <div className="rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>}

      <div className="space-y-1">
        {devices.length === 0 && <div className="text-xs text-zinc-500">no devices — connect via USB or add a Wi-Fi device below</div>}
        {devices.map(d => (
          <button
            key={d.id}
            onClick={() => onSelect(d.id, d.type)}
            disabled={d.state !== 'device'}
            className={`w-full text-left rounded px-3 py-2 text-sm
              ${selectedId === d.id ? 'bg-blue-700 text-white' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200'}
              ${d.state !== 'device' ? 'opacity-50' : ''}`}
            data-testid={`device-${d.id}`}
          >
            <div className="font-mono text-xs">{d.id}</div>
            <div className="text-xs text-zinc-400">
              {d.type.toUpperCase()} · {d.state}{d.model ? ` · ${d.model}` : ''}
            </div>
          </button>
        ))}
      </div>

      {/* mDNS Wi-Fi auto-discovery */}
      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Wi-Fi auto-discovery (Android 11+)</span>
          <button
            onClick={runMdnsScan}
            disabled={mdnsScanning}
            data-testid="mdns-scan-button"
            className="rounded bg-teal-700 px-3 py-1 text-xs text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {mdnsScanning ? 'scanning…' : 'Scan Wi-Fi devices'}
          </button>
        </div>

        {mdnsEntries !== null && mdnsEntries.length === 0 && (
          <div className="text-xs text-zinc-500">no devices found — make sure Wireless debugging is on</div>
        )}

        {mdnsEntries !== null && mdnsEntries.length > 0 && (
          <div className="space-y-1">
            {mdnsEntries.map(entry => (
              <div
                key={entry.ipPort}
                data-testid={`mdns-entry-${entry.ipPort}`}
                className="rounded bg-zinc-900 px-3 py-2 space-y-1"
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
                  <div className="flex gap-2 mt-1">
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
                      {pairingInFlight.has(entry.ipPort) ? 'pairing…' : 'Submit'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Wi-Fi IP entry */}
      <div className="border-t border-zinc-800 pt-3">
        <label className="text-xs text-zinc-400">Add Wi-Fi device (e.g. 192.168.1.42)</label>
        <div className="mt-1 flex gap-2">
          <input
            value={wifiIp} onChange={e => setWifiIp(e.target.value)}
            placeholder="ip[:port]" data-testid="wifi-ip"
            className="flex-1 rounded bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
          />
          <button
            onClick={addWifi} disabled={wifiBusy} data-testid="wifi-connect"
            className="rounded bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {wifiBusy ? 'connecting…' : 'connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
