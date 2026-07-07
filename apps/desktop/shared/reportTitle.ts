// Single source of truth for the export report title default + normalization,
// shared by the renderer (export modal seed) and main process (db, manifest,
// dirty check). Keeps the 'Loupe QA Report' literal in exactly one place.
export const DEFAULT_REPORT_TITLE = 'Loupe QA Report'

export function normalizeReportTitle(title?: string | null): string {
  return title?.trim() || DEFAULT_REPORT_TITLE
}
