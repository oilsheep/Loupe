// Shared chevron-down icon. Use for dropdown/expander affordances so every
// down-arrow looks the same (matches the app's stroke-icon set, not a text glyph).
export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
