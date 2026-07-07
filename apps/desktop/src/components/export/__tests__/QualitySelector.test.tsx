import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QualitySelector } from '../QualitySelector'
import { DEFAULT_EXPORT_QUALITY, normalizeExportQuality } from '@shared/exportQuality'

// useI18n() falls back to dictionaries.en when there is no I18nContext, so
// no wrapper or window.api stub is needed for these pure-UI tests.
function renderSel(value = DEFAULT_EXPORT_QUALITY, onChange = vi.fn()) {
  render(<QualitySelector value={value} onChange={onChange} />)
  return onChange
}

describe('QualitySelector', () => {
  it('renders five tier buttons including custom', () => {
    renderSel()
    for (const label of ['quick', 'balanced', 'high', 'max', 'custom']) {
      expect(screen.getByTestId(`quality-tier-${label}`)).toBeTruthy()
    }
  })

  it('hides advanced controls for preset tiers', () => {
    renderSel(normalizeExportQuality({ tier: 'balanced' }))
    expect(screen.queryByTestId('quality-advanced')).toBeNull()
  })

  it('shows advanced controls when tier is custom', () => {
    renderSel(normalizeExportQuality({ tier: 'custom', preset: 'slow', crf: 19 }))
    expect(screen.getByTestId('quality-advanced')).toBeTruthy()
  })

  it('clicking custom seeds preset/crf from the current value', () => {
    const onChange = renderSel(normalizeExportQuality({ tier: 'high' })) // fast / 18
    fireEvent.click(screen.getByTestId('quality-tier-custom'))
    expect(onChange).toHaveBeenCalledWith({ tier: 'custom', preset: 'fast', crf: 18 })
  })

  it('hides the reset button when already at the default (balanced)', () => {
    renderSel(DEFAULT_EXPORT_QUALITY)
    expect(screen.queryByTestId('quality-reset')).toBeNull()
  })

  it('resets to the balanced default via the reset button', () => {
    const onChange = renderSel(normalizeExportQuality({ tier: 'high' }))
    fireEvent.click(screen.getByTestId('quality-reset'))
    expect(onChange).toHaveBeenCalledWith(DEFAULT_EXPORT_QUALITY)
  })
})
