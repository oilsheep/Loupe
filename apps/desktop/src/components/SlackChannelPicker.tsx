import { useRef, useState } from 'react'
import type { SlackChannel } from '@shared/types'
import { useI18n } from '@/lib/i18n'
import { slackChannelLabel } from '@/lib/connection'
import { useClickOutside } from '@/lib/useClickOutside'

interface SlackChannelPickerProps {
  channels: SlackChannel[]
  value: string
  disabled?: boolean
  loading?: boolean
  onOpen?(): void
  onChange(id: string): void
}

export function SlackChannelPicker({ channels, value, disabled = false, loading = false, onOpen, onChange }: SlackChannelPickerProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = channels.find(channel => channel.id === value)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredChannels = normalizedQuery
    ? channels.filter(channel => [
        channel.name,
        channel.id,
        slackChannelLabel(channel),
      ].some(text => text.toLowerCase().includes(normalizedQuery)))
    : channels

  useClickOutside(rootRef, () => setOpen(false), open)

  function toggleOpen() {
    if (disabled) return
    setOpen(prev => {
      const next = !prev
      if (next) onOpen?.()
      return next
    })
  }

  return (
    <div ref={rootRef} className="relative mt-1" data-row-click-ignore="true">
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-2 rounded bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-200 outline-none hover:bg-zinc-800 focus:ring-1 focus:ring-blue-600 disabled:opacity-50"
      >
        <span className="min-w-0 truncate">{selected ? slackChannelLabel(selected) : (loading ? t('picker.loadingChannels') : t('picker.selectChannel'))}</span>
        <span className="shrink-0 text-zinc-500">v</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded border border-zinc-700 bg-zinc-950 shadow-xl">
          <div className="border-b border-zinc-800 p-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              placeholder={t('picker.searchChannels')}
              className="w-full rounded bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {loading && (
              <div className="px-3 py-2 text-sm text-zinc-500">{t('picker.loadingChannels')}</div>
            )}
            {!loading && filteredChannels.length === 0 && (
              <div className="px-3 py-2 text-sm text-zinc-500">{channels.length === 0 ? t('picker.noChannelsLoaded') : t('picker.noMatchingChannels')}</div>
            )}
            {filteredChannels.map(channel => (
              <button
                key={channel.id}
                type="button"
                onClick={() => {
                  onChange(channel.id)
                  setOpen(false)
                  setQuery('')
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-800 ${channel.id === value ? 'bg-blue-950/60 text-blue-100' : 'text-zinc-200'}`}
              >
                <span className="min-w-0 truncate">{slackChannelLabel(channel)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
