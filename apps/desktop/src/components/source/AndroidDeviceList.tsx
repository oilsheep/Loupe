import type { Device } from '@shared/types'
import { useI18n } from '@/lib/i18n'

export function AndroidDeviceList({
  devices,
  selectedId,
  userNames,
  labels,
  editingLabel,
  labelDraft,
  onSelectDevice,
  onStartEditLabel,
  onCommitLabel,
  onLabelDraftChange,
  onCancelEditLabel,
}: {
  devices: Device[]
  selectedId: string | null
  userNames: Record<string, string>
  labels: Record<string, string>
  editingLabel: string | null
  labelDraft: string
  onSelectDevice: (device: Device) => void
  onStartEditLabel: (id: string) => void
  onCommitLabel: (id: string) => void
  onLabelDraftChange: (value: string) => void
  onCancelEditLabel: () => void
}) {
  const { t } = useI18n()

  function displayName(d: Device): string {
    return labels[d.id] || userNames[d.id] || d.model || d.id
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-500">{t('device.androidDevices')}</div>
      {devices.length === 0 && <div className="text-xs text-zinc-500">{t('device.noDevices')}</div>}
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
            onClick={() => d.state === 'device' && onSelectDevice(d)}
            className={`rounded px-3 py-2 text-sm
              ${isSel ? 'bg-blue-700 text-white' : 'bg-zinc-900 text-zinc-200'}
              ${d.state !== 'device' ? 'opacity-50' : 'cursor-pointer hover:bg-zinc-800'}`}
          >
            <div className="flex items-center gap-2">
              {isEditing ? (
                <input
                  autoFocus
                  value={labelDraft}
                  onChange={e => onLabelDraftChange(e.target.value)}
                  onBlur={() => onCommitLabel(d.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') onCancelEditLabel()
                  }}
                  placeholder={t('device.labelPlaceholder')}
                  data-testid={`label-input-${d.id}`}
                  className="flex-1 rounded bg-zinc-800 px-2 py-0.5 text-zinc-100 outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    d.state === 'device' && onSelectDevice(d)
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
                  isEditing ? onCommitLabel(d.id) : onStartEditLabel(d.id)
                }}
                data-testid={`label-edit-${d.id}`}
                title={t('device.editLabel')}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                {isEditing ? t('device.save') : labels[d.id] ? t('device.rename') : t('device.label')}
              </button>
            </div>
            <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-zinc-400">
              {isSel && <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-emerald-200">{t('common.connected')}</span>}
              <span className="truncate">{subtitle}</span>
            </div>
            {isSel && (
              <div className="mt-1 text-[11px] text-blue-200">
                {t('device.selectedHelp')}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
