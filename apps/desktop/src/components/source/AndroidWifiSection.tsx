import type { MdnsEntry } from '@shared/types'
import { useI18n } from '@/lib/i18n'

export function AndroidWifiSection({
  wifiIp,
  wifiBusy,
  mdnsEntries,
  mdnsScanning,
  pairCodes,
  pairingInFlight,
  manualPairIpPort,
  manualPairCode,
  manualPairBusy,
  onWifiIpChange,
  onAddWifi,
  onRunMdnsScan,
  onConnectMdnsEntry,
  onTogglePairForm,
  onPairCodeChange,
  onSubmitPair,
  onManualPairIpPortChange,
  onManualPairCodeChange,
  onSubmitManualPair,
}: {
  wifiIp: string
  wifiBusy: boolean
  mdnsEntries: MdnsEntry[] | null
  mdnsScanning: boolean
  pairCodes: Record<string, string>
  pairingInFlight: Set<string>
  manualPairIpPort: string
  manualPairCode: string
  manualPairBusy: boolean
  onWifiIpChange: (value: string) => void
  onAddWifi: () => void
  onRunMdnsScan: () => void
  onConnectMdnsEntry: (entry: MdnsEntry) => void
  onTogglePairForm: (ipPort: string) => void
  onPairCodeChange: (ipPort: string, code: string) => void
  onSubmitPair: (entry: MdnsEntry) => void
  onManualPairIpPortChange: (value: string) => void
  onManualPairCodeChange: (value: string) => void
  onSubmitManualPair: () => void
}) {
  const { t } = useI18n()

  return (
    <>
      <div className="space-y-2 border-t border-zinc-800 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">{t('device.wifiAuto')}</span>
          <button
            onClick={onRunMdnsScan}
            disabled={mdnsScanning}
            data-testid="mdns-scan-button"
            className="rounded bg-teal-700 px-3 py-1 text-xs text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {mdnsScanning ? t('device.scanning') : t('device.scanWifi')}
          </button>
        </div>

        {mdnsEntries !== null && mdnsEntries.length === 0 && (
          <div className="text-xs text-zinc-500">{t('device.noWifiDevices')}</div>
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
                      {entry.type === 'pair' ? t('device.needsPairing') : t('device.ready')}
                    </span>
                  </div>
                  {entry.type === 'connect' ? (
                    <button
                      onClick={() => onConnectMdnsEntry(entry)}
                      data-testid={`mdns-connect-button-${entry.ipPort}`}
                      className="rounded bg-teal-700 px-3 py-1 text-xs text-white hover:bg-teal-600"
                    >
                      {t('device.connectButton')}
                    </button>
                  ) : (
                    <button
                      onClick={() => onTogglePairForm(entry.ipPort)}
                      data-testid={`mdns-pair-button-${entry.ipPort}`}
                      className="rounded bg-amber-700 px-3 py-1 text-xs text-white hover:bg-amber-600"
                    >
                      {t('device.pair')}
                    </button>
                  )}
                </div>
                {entry.type === 'pair' && entry.ipPort in pairCodes && (
                  <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={pairCodes[entry.ipPort] ?? ''}
                      onChange={e => onPairCodeChange(entry.ipPort, e.target.value)}
                      placeholder={t('device.codePlaceholder')}
                      maxLength={6}
                      data-testid={`mdns-pair-code-${entry.ipPort}`}
                      className="min-w-0 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      onClick={() => onSubmitPair(entry)}
                      disabled={pairingInFlight.has(entry.ipPort)}
                      data-testid={`mdns-pair-submit-${entry.ipPort}`}
                      className="whitespace-nowrap rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                      {pairingInFlight.has(entry.ipPort) ? t('device.pairing') : t('device.submit')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <label className="text-xs text-zinc-400">Pair Android manually (use the pairing address and six-digit code)</label>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)_auto] gap-2">
          <input
            value={manualPairIpPort}
            onChange={e => onManualPairIpPortChange(e.target.value)}
            placeholder="ip:pairing-port"
            data-testid="manual-pair-ip-port"
            className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-600"
          />
          <input
            value={manualPairCode}
            onChange={e => onManualPairCodeChange(e.target.value)}
            placeholder="6-digit code"
            maxLength={6}
            data-testid="manual-pair-code"
            className="min-w-0 rounded bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-600"
          />
          <button
            onClick={onSubmitManualPair}
            disabled={manualPairBusy}
            data-testid="manual-pair-submit"
            className="whitespace-nowrap rounded bg-amber-700 px-3 py-1 text-sm text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {manualPairBusy ? 'pairing...' : 'pair'}
          </button>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          Use the address shown under Android Wireless debugging → Pair device with pairing code. After pairing, connect with the ready/connect address.
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <label className="text-xs text-zinc-400">Add Wi-Fi device manually (use the connect port, not the pairing port)</label>
        <div className="mt-1 flex gap-2">
          <input
            value={wifiIp}
            onChange={e => onWifiIpChange(e.target.value)}
            placeholder={t('device.wifiConnectPlaceholder')}
            data-testid="wifi-ip"
            className="flex-1 rounded bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
          />
          <button
            onClick={onAddWifi}
            disabled={wifiBusy}
            data-testid="wifi-connect"
            className="rounded bg-blue-700 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {wifiBusy ? t('device.connecting') : t('common.connect')}
          </button>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {t('device.wifiManualHelp')}
        </div>
      </div>
    </>
  )
}
