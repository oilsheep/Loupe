import { useRef, useState } from 'react'
import { useClickOutside } from '@/lib/useClickOutside'
import { ChevronDownIcon } from './ChevronDownIcon'

interface SuggestInputProps {
  value: string
  suggestions: string[]
  placeholder?: string
  ariaLabel?: string
  onChange(value: string): void
  /** Called when the field loses focus or a suggestion is committed. */
  onCommit?(): void
}

// Free-text input with a styled suggestion dropdown. Replaces native
// `<input list=datalist>`, which renders a light-themed popup and picks up
// Chromium's white autofill styling — both of which clash with the dark
// custom pickers used elsewhere in the modal.
export function SuggestInput({ value, suggestions, placeholder, ariaLabel, onChange, onCommit }: SuggestInputProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const normalized = value.trim().toLowerCase()
  const filtered = normalized
    ? suggestions.filter(item => item.toLowerCase().includes(normalized) && item.toLowerCase() !== normalized)
    : suggestions

  useClickOutside(rootRef, () => setOpen(false), open)

  return (
    <div ref={rootRef} className="relative mt-1 font-normal" data-row-click-ignore="true">
      <div className="flex items-center gap-1 rounded bg-zinc-950 pr-2 focus-within:ring-1 focus-within:ring-blue-600">
        <input
          value={value}
          aria-label={ariaLabel}
          placeholder={placeholder}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => onCommit?.()}
          className="min-w-0 flex-1 rounded bg-transparent px-3 py-2 text-sm text-zinc-200 outline-none"
        />
        {suggestions.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Show suggestions"
            onMouseDown={(e) => { e.preventDefault(); setOpen(prev => !prev) }}
            className="shrink-0 text-zinc-500 hover:text-zinc-300"
          >
            <ChevronDownIcon />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border border-zinc-700 bg-zinc-950 py-1 shadow-xl">
          {filtered.map(item => (
            <button
              key={item}
              type="button"
              // preventDefault on mousedown keeps focus on the input so its onBlur
              // doesn't fire before the click commits; onClick then handles both
              // mouse and keyboard (Enter/Space) selection.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(item); onCommit?.(); setOpen(false) }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              <span className="min-w-0 truncate">{item}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
