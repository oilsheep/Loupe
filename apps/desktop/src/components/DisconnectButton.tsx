import { useI18n } from '@/lib/i18n'

interface DisconnectButtonProps {
  onDisconnect(): void
  disconnecting: boolean
  disabled?: boolean
}

export function DisconnectButton({ onDisconnect, disconnecting, disabled }: DisconnectButtonProps) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onDisconnect}
      disabled={disabled || disconnecting}
      className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
    >
      {disconnecting ? t('preferences.disconnecting') : t('preferences.disconnect')}
    </button>
  )
}
