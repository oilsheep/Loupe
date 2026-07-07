import { describe, it, expect } from 'vitest'
import {
  DEFAULT_EXPORT_QUALITY,
  EXPORT_QUALITY_PRESETS,
  EXPORT_QUALITY_TIER_OPTIONS,
  normalizeExportQuality,
  qualityEncodeParams,
  resolveExportQuality,
  toCustomQuality,
} from '../exportQuality'

describe('exportQuality', () => {
  it('default is balanced veryfast/20 (matches legacy hard-coded values)', () => {
    expect(DEFAULT_EXPORT_QUALITY).toEqual({ tier: 'balanced', preset: 'veryfast', crf: 20 })
  })

  it('normalizes a known tier by forcing its mapped preset/crf', () => {
    expect(normalizeExportQuality({ tier: 'high', preset: 'ignored', crf: 99 }))
      .toEqual({ tier: 'high', ...EXPORT_QUALITY_PRESETS.high })
  })

  it('falls back to balanced for garbage input', () => {
    expect(normalizeExportQuality(undefined)).toEqual(DEFAULT_EXPORT_QUALITY)
    expect(normalizeExportQuality({ tier: 'nope' })).toEqual(DEFAULT_EXPORT_QUALITY)
    expect(normalizeExportQuality(42)).toEqual(DEFAULT_EXPORT_QUALITY)
  })

  it('custom tier keeps a valid preset and clamps crf to 0..51', () => {
    expect(normalizeExportQuality({ tier: 'custom', preset: 'slower', crf: 14 }))
      .toEqual({ tier: 'custom', preset: 'slower', crf: 14 })
    expect(normalizeExportQuality({ tier: 'custom', preset: 'bogus', crf: -5 }))
      .toEqual({ tier: 'custom', preset: 'veryfast', crf: 0 })
    expect(normalizeExportQuality({ tier: 'custom', preset: 'medium', crf: 80 }).crf).toBe(51)
  })

  it('qualityEncodeParams returns only preset+crf, normalizing first', () => {
    expect(qualityEncodeParams({ tier: 'quick', preset: 'x', crf: 0 }))
      .toEqual(EXPORT_QUALITY_PRESETS.quick)
    expect(qualityEncodeParams(null)).toEqual({ preset: 'veryfast', crf: 20 })
  })

  it('resolveExportQuality prefers args over settings, then default', () => {
    expect(resolveExportQuality({ tier: 'max' }, { tier: 'high' }).tier).toBe('max')
    expect(resolveExportQuality(undefined, { tier: 'high' }).tier).toBe('high')
    expect(resolveExportQuality(undefined, undefined)).toEqual(DEFAULT_EXPORT_QUALITY)
  })
})

describe('custom quality tier', () => {
  it('lists all four presets plus custom as UI options', () => {
    expect(EXPORT_QUALITY_TIER_OPTIONS).toEqual(['quick', 'balanced', 'high', 'max', 'custom'])
  })

  it('toCustomQuality keeps the current preset/crf and flips tier to custom', () => {
    const high = normalizeExportQuality({ tier: 'high' }) // fast / 18
    expect(toCustomQuality(high)).toEqual({ tier: 'custom', preset: 'fast', crf: 18 })
  })

  it('toCustomQuality never blanks preset/crf', () => {
    const custom = toCustomQuality({ tier: 'balanced', preset: '', crf: NaN })
    expect(custom.tier).toBe('custom')
    expect(normalizeExportQuality(custom).preset).toBe('veryfast') // normalize backfills invalid
  })
})
