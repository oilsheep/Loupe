interface PublishTargetRowProps {
  icon: React.ReactNode
  name: string
  connected: boolean
  connecting: boolean
  connectionLabel: string
  connectLabel: string
  enabled: boolean
  disabledReason?: string
  onToggle(next: boolean): void
  onConnect(): void
  children?: React.ReactNode
}

export function PublishTargetRow({
  icon, name, connected, connecting, connectionLabel, connectLabel,
  enabled, disabledReason, onToggle, onConnect, children,
}: PublishTargetRowProps) {
  const expanded = connected && enabled
  const canToggle = connected && !disabledReason
  return (
    <div className={`mb-2 overflow-hidden rounded-lg border ${expanded ? 'border-blue-900/70 bg-blue-950/20' : 'border-zinc-700 bg-zinc-900/40'}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-white">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-100">{name}</div>
          <div className={`text-[11px] ${connected ? 'text-emerald-300' : 'text-amber-300'}`}>{connectionLabel}</div>
          {disabledReason && <div className="text-[11px] text-amber-300">{disabledReason}</div>}
        </div>
        {connected ? (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={name}
            disabled={!canToggle}
            onClick={() => canToggle && onToggle(!enabled)}
            className={`relative h-5 w-9 flex-none rounded-full transition ${enabled ? 'bg-blue-600' : 'bg-zinc-600'} ${canToggle ? '' : 'opacity-40'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className="flex-none rounded-md border border-blue-900/60 bg-blue-950/40 px-3 py-1.5 text-xs font-medium text-blue-200 disabled:opacity-50"
          >{connectLabel}</button>
        )}
      </div>
      {expanded && children && (
        <div className="border-t border-zinc-800 px-3 pb-3 pt-1">{children}</div>
      )}
    </div>
  )
}
