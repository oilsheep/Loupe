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
  const { t, resolvedLocale } = useI18n()
  const zh = resolvedLocale.startsWith('zh')
  const scanLabel = zh ? '\u6383\u63cf' : t('device.scanWifi')
  const pairTitle = zh ? '\u914d\u5c0d\u65b0 Android \u88dd\u7f6e' : 'Pair new Android device'
  const pairHelp = zh
    ? '\u4f7f\u7528 Android \u7121\u7dda\u9664\u932f\u4e2d\u7684\u300c\u4f7f\u7528\u914d\u5c0d\u78bc\u914d\u5c0d\u88dd\u7f6e\u300d\u5730\u5740\u3002\u914d\u5c0d\u5f8c\uff0c\u518d\u7528 Ready / Connect \u5730\u5740\u9023\u7dda\u3002'
    : 'Use the pairing address shown in Android Wireless debugging. After pairing, connect with the ready/connect address.'
  const connectTitle = zh ? '\u52a0\u5165 Wi-Fi \u88dd\u7f6e' : 'Add Wi-Fi device'
  const connectHelp = zh
    ? '\u8acb\u4f7f\u7528 Ready / Connect \u9023\u7dda\u57e0\uff0c\u4e0d\u662f pairing port\u3002'
    : t('device.wifiManualHelp')

  return (
    <>
      <div className="space-y-3 border-t border-zinc-800 pt-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 text-xs font-medium leading-5 text-zinc-300">{t('device.wifiAuto')}</span>
          <button
            onClick={onRunMdnsScan}
            disabled={mdnsScanning}
            data-testid="mdns-scan-button"
            className="shrink-0 whitespace-nowrap rounded bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {mdnsScanning ? t('device.scanning') : scanLabel}
          </button>
        </div>

        {mdnsEntries !== null && mdnsEntries.length === 0 && (
          <div className="text-xs leading-5 text-zinc-500">{t('device.noWifiDevices')}</div>
        )}

        {mdnsEntries !== null && mdnsEntries.length > 0 && (
          <div className="space-y-2">
            {mdnsEntries.map(entry => (
              <div
                key={`${entry.type}-${entry.ipPort}`}
                data-testid={`mdns-entry-${entry.ipPort}`}
                className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2"
              >
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block truncate font-mono text-xs text-zinc-100">{entry.ipPort}</span>
                    <span className={`text-xs ${entry.type === 'pair' ? 'text-amber-400' : 'text-teal-400'}`}>
                      {entry.type === 'pair' ? t('device.needsPairing') : t('device.ready')}
                    </span>
                  </div>
                  {entry.type === 'connect' ? (
                    <button
                      onClick={() => onConnectMdnsEntry(entry)}
                      data-testid={`mdns-connect-button-${entry.ipPort}`}
                      className="shrink-0 whitespace-nowrap rounded bg-teal-700 px-3 py-1 text-xs text-white hover:bg-teal-600"
                    >
                      {t('device.connectButton')}
                    </button>
                  ) : (
                    <button
                      onClick={() => onTogglePairForm(entry.ipPort)}
                      data-testid={`mdns-pair-button-${entry.ipPort}`}
                      className="shrink-0 whitespace-nowrap rounded bg-amber-700 px-3 py-1 text-xs text-white hover:bg-amber-600"
                    >
                      {t('device.pair')}
                    </button>
                  )}
                </div>
                {entry.type === 'pair' && entry.ipPort in pairCodes && (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
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
                      className="shrink-0 whitespace-nowrap rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-500 disabled:opacity-50"
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

      <div className="border-t border-zinc-800 pt-4">
        <label className="text-xs font-medium text-zinc-300">{pairTitle}</label>
        <div className="mt-2 space-y-2">
          <input
            value={manualPairIpPort}
            onChange={e => onManualPairIpPortChange(e.target.value)}
            placeholder="ip:pairing-port"
            data-testid="manual-pair-ip-port"
            className="w-full min-w-0 rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-600"
          />
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              value={manualPairCode}
              onChange={e => onManualPairCodeChange(e.target.value)}
              placeholder={t('device.codePlaceholder')}
              maxLength={6}
              data-testid="manual-pair-code"
              className="min-w-0 rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-amber-600"
            />
            <button
              onClick={onSubmitManualPair}
              disabled={manualPairBusy}
              data-testid="manual-pair-submit"
              className="shrink-0 whitespace-nowrap rounded bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {manualPairBusy ? t('device.pairing') : t('device.pair')}
            </button>
          </div>
        </div>
        <div className="mt-2 text-[11px] leading-5 text-zinc-500">
          {pairHelp}
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-4">
        <label className="text-xs font-medium text-zinc-300">{connectTitle}</label>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            value={wifiIp}
            onChange={e => onWifiIpChange(e.target.value)}
            placeholder={t('device.wifiConnectPlaceholder')}
            data-testid="wifi-ip"
            className="min-w-0 rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-blue-600"
          />
          <button
            onClick={onAddWifi}
            disabled={wifiBusy}
            data-testid="wifi-connect"
            className="shrink-0 whitespace-nowrap rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {wifiBusy ? t('device.connecting') : t('common.connect')}
          </button>
        </div>
        <div className="mt-2 text-[11px] leading-5 text-zinc-500">
          {connectHelp}
        </div>
      </div>
    </>
  )
}
