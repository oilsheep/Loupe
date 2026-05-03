import { useEffect, useState } from 'react'
import type { Device, DesktopApi, MdnsEntry, PcCaptureSource } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import type { SelectRecordingSource } from '@/lib/recordingSource'
import { PcCaptureSourceSection } from '@/components/source/PcCaptureSourceSection'
import { AndroidDeviceList } from '@/components/source/AndroidDeviceList'
import { AndroidWifiSection } from '@/components/source/AndroidWifiSection'
import { IosSourceSection } from '@/components/source/IosSourceSection'

interface Props {
  api: DesktopApi
  selectedId: string | null
  onSelect: SelectRecordingSource
}

const LABEL_KEY = 'loupe.deviceLabels'
type SourceTab = 'pc' | 'android' | 'ios'

function readLabels(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LABEL_KEY) ?? '{}') } catch { return {} }
}

function writeLabels(map: Record<string, string>) {
  localStorage.setItem(LABEL_KEY, JSON.stringify(map))
}

export function DevicePicker({ api, selectedId, onSelect }: Props) {
  const { t } = useI18n()
  const [devices, setDevices] = useState<Device[]>([])
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null)
  const [wifiIp, setWifiIp] = useState('')
  const [wifiBusy, setWifiBusy] = useState(false)
  const [manualPairIpPort, setManualPairIpPort] = useState('')
  const [manualPairCode, setManualPairCode] = useState('')
  const [manualPairBusy, setManualPairBusy] = useState(false)

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
  const [pcSourceTab, setPcSourceTab] = useState<'screen' | 'window'>('screen')
  const [sourceTab, setSourceTab] = useState<SourceTab>('pc')
  const [platform, setPlatform] = useState<string | null>(null)

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
    api.app.getPlatform().then(setPlatform).catch(() => setPlatform(null))
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [])

  async function refreshPcSources() {
    setPcSourcesLoading(true)
    try {
      const sources = await api.app.listPcCaptureSources()
      setPcSources(sources)
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
    setConnectionStatus(t('device.connected', { name: userNames[id] || labels[id] || id }))
    setSourceTab('android')
    onSelect(id, mode)
    api.device.getUserName(id).then(name => {
      if (!name) return
      setUserNames(prev => ({ ...prev, [id]: name }))
      setConnectionStatus(t('device.connected', { name }))
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

  async function submitManualPair() {
    const ipPort = manualPairIpPort.trim()
    const code = manualPairCode.trim()
    if (!ipPort || !code) return
    setManualPairBusy(true)
    setError(null)
    try {
      const r = await api.device.pair({ ipPort, code })
      if (!r.ok) {
        setConnectionStatus(null)
        setError(r.message)
        return
      }
      setManualPairIpPort('')
      setManualPairCode('')
      setConnectionStatus(`Paired: ${ipPort}. Scan Wi-Fi devices for the ready/connect address.`)
      await runMdnsScan()
    } finally {
      setManualPairBusy(false)
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

  const selectPcSource: SelectRecordingSource = (id, mode, label) => {
    if (mode === 'pc') setSourceTab('pc')
    if (mode === 'ios') setSourceTab('ios')
    onSelect(id, mode, label)
  }

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="min-w-0 text-sm font-medium text-zinc-300">{t('device.source')}</h2>
        <button onClick={refresh} className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200">{t('common.refresh')}</button>
      </div>

      {error && <div className="rounded bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>}
      {connectionStatus && (
        <div className="rounded border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
          {connectionStatus}
        </div>
      )}

      <div className="grid min-w-0 grid-cols-3 rounded-md border border-zinc-800 bg-zinc-950 p-0.5 text-xs">
        {([
          ['pc', t('device.pcRecording')],
          ['android', t('device.androidDevices')],
          ['ios', t('device.iosRecording')],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setSourceTab(tab)}
            className={`min-w-0 truncate rounded px-2 py-2 text-center leading-tight ${sourceTab === tab ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {sourceTab === 'pc' ? (
        <PcCaptureSourceSection
          api={api}
          selectedId={selectedId}
          sources={pcSources}
          loading={pcSourcesLoading}
          activeTab={pcSourceTab}
          onTabChange={setPcSourceTab}
          onRefresh={refreshPcSources}
          onSelect={selectPcSource}
        />
      ) : sourceTab === 'ios' ? (
        <IosSourceSection
          api={api}
          selectedId={selectedId}
          sources={pcSources}
          loading={pcSourcesLoading}
          platform={platform}
          onRefresh={refreshPcSources}
          onSelect={selectPcSource}
        />
      ) : (
        <>
          <AndroidDeviceList
            devices={devices}
            selectedId={selectedId}
            userNames={userNames}
            labels={labels}
            editingLabel={editingLabel}
            labelDraft={labelDraft}
            onSelectDevice={device => markConnected(device.id, device.type)}
            onStartEditLabel={startEditLabel}
            onCommitLabel={commitLabel}
            onLabelDraftChange={setLabelDraft}
            onCancelEditLabel={() => setEditingLabel(null)}
          />

          <AndroidWifiSection
            wifiIp={wifiIp}
            wifiBusy={wifiBusy}
            mdnsEntries={mdnsEntries}
            mdnsScanning={mdnsScanning}
            pairCodes={pairCodes}
            pairingInFlight={pairingInFlight}
            manualPairIpPort={manualPairIpPort}
            manualPairCode={manualPairCode}
            manualPairBusy={manualPairBusy}
            onWifiIpChange={setWifiIp}
            onAddWifi={addWifi}
            onRunMdnsScan={runMdnsScan}
            onConnectMdnsEntry={connectMdnsEntry}
            onTogglePairForm={togglePairForm}
            onPairCodeChange={setPairCode}
            onSubmitPair={submitPair}
            onManualPairIpPortChange={setManualPairIpPort}
            onManualPairCodeChange={setManualPairCode}
            onSubmitManualPair={submitManualPair}
          />
        </>
      )}
    </div>
  )
}
