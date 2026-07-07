export type ExportQualityTier = 'quick' | 'balanced' | 'high' | 'max' | 'custom'

export interface ExportQuality {
  tier: ExportQualityTier
  preset: string
  crf: number
}

export const EXPORT_QUALITY_TIERS = ['quick', 'balanced', 'high', 'max'] as const

// Single source of truth for tier → libx264 params.
// balanced === the legacy hard-coded values (veryfast / crf 20).
export const EXPORT_QUALITY_PRESETS: Record<(typeof EXPORT_QUALITY_TIERS)[number], { preset: string; crf: number }> = {
  quick: { preset: 'ultrafast', crf: 26 },
  balanced: { preset: 'veryfast', crf: 20 },
  high: { preset: 'fast', crf: 18 },
  max: { preset: 'slow', crf: 16 },
}

export const DEFAULT_EXPORT_QUALITY: ExportQuality = { tier: 'balanced', ...EXPORT_QUALITY_PRESETS.balanced }

const VALID_PRESETS = new Set([
  'ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow',
])

export function normalizeExportQuality(raw: unknown): ExportQuality {
  if (raw == null || typeof raw !== 'object') return { ...DEFAULT_EXPORT_QUALITY }
  const value = raw as Partial<ExportQuality>
  const tier = value.tier
  if (tier === 'quick' || tier === 'balanced' || tier === 'high' || tier === 'max') {
    return { tier, ...EXPORT_QUALITY_PRESETS[tier] }
  }
  if (tier === 'custom') {
    const preset = typeof value.preset === 'string' && VALID_PRESETS.has(value.preset)
      ? value.preset
      : DEFAULT_EXPORT_QUALITY.preset
    const crf = typeof value.crf === 'number' && Number.isFinite(value.crf)
      ? Math.min(51, Math.max(0, Math.round(value.crf)))
      : DEFAULT_EXPORT_QUALITY.crf
    return { tier: 'custom', preset, crf }
  }
  return { ...DEFAULT_EXPORT_QUALITY }
}

export function qualityEncodeParams(quality: ExportQuality | null | undefined): { preset: string; crf: number } {
  const q = normalizeExportQuality(quality)
  return { preset: q.preset, crf: q.crf }
}

// UI option row: the four fixed-preset tiers plus the free-form custom tier.
// The preset tiers (which key EXPORT_QUALITY_PRESETS) plus the free-form 'custom'
// option, which has no fixed preset/crf. Derived so a new tier only adds in one place.
export const EXPORT_QUALITY_TIER_OPTIONS = [...EXPORT_QUALITY_TIERS, 'custom'] as const

// Entering custom mode: keep the currently-shown preset/crf as the seed so the
// advanced fields are never blank.
export function toCustomQuality(current: ExportQuality): ExportQuality {
  return { tier: 'custom', preset: current.preset, crf: current.crf }
}

// Args (from the export request) win over stored settings; both are normalized.
export function resolveExportQuality(fromArgs: unknown, fromSettings: unknown): ExportQuality {
  if (fromArgs && typeof fromArgs === 'object') return normalizeExportQuality(fromArgs)
  if (fromSettings && typeof fromSettings === 'object') return normalizeExportQuality(fromSettings)
  return { ...DEFAULT_EXPORT_QUALITY }
}
