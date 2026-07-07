// Shared top-right close button (icon X). Use in dialog/screen headers so every
// top-right close looks and behaves the same.
export function CloseButton({ onClick, label, disabled, className = '' }: {
  onClick(): void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`shrink-0 rounded bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  )
}
