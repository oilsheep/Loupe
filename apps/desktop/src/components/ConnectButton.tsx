import { useI18n } from '@/lib/i18n'

interface ConnectButtonProps {
  onConnect(): void
  connecting: boolean
  label: string
  disabled?: boolean
}

export function ConnectButton({ onConnect, connecting, label, disabled }: ConnectButtonProps) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); onConnect() }}
      disabled={disabled || connecting}
      className="rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
    >
      {connecting ? t('preferences.connecting') : label}
    </button>
  )
}
