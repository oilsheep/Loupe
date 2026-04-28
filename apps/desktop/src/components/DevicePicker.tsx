import { useEffect, useState } from 'react'
import type { Device, DesktopApi } from '@shared/types'

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
