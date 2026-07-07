// Shared control styles for the export / publish surfaces (the export modal and
// the side publish panel). Keeps buttons, field labels and segmented toggles
// consistent instead of each call site inventing its own variant.
//
// Tuned for the zinc-800 panel background: neutral fills use zinc-700 so they
// stand out against the panel, inset inputs stay on zinc-950, and the single
// accent is blue-600 (no parallel sky-700 accent).

/** Primary action button — the one thing the surface exists to do. */
export const BTN_PRIMARY =
  'rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50'

/** Secondary / neutral button — cancel, back, browse. Outlined, not filled. */
export const BTN_SECONDARY =
  'rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50'

/** The one field-label style: every caption sitting above an input. */
export const FIELD_LABEL = 'text-xs font-medium text-zinc-300'

/** Secondary help / hint line under a control. */
export const HELP_TEXT = 'text-[11px] text-zinc-500'

/** Segmented-toggle option colors. Compose with your own sizing (px/py). */
export const SEG_ACTIVE = 'bg-blue-600 text-white'
export const SEG_IDLE = 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
