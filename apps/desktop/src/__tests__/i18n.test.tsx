import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider, useI18n } from '@/lib/i18n'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    settings: {
      get: mocks.getSettings,
    },
  },
}))

function ExportLabels() {
  const { t } = useI18n()
  return (
    <>
      <div data-testid="local-only-summary">{t('export.confirm.localOnly')}</div>
      <div data-testid="local-only-button">{t('export.button.exportLocal')}</div>
    </>
  )
}

describe('export localization', () => {
  beforeEach(() => {
    mocks.getSettings.mockReset()
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    })
  })

  it('uses platform-neutral English copy on Windows', async () => {
    mocks.getSettings.mockResolvedValue({ locale: 'en' })
    render(<I18nProvider><ExportLabels /></I18nProvider>)

    expect((await screen.findByTestId('local-only-summary')).textContent).toBe('No publish target — saves to this computer only')
    expect(screen.getByTestId('local-only-button').textContent).toBe('Export to this computer only')
  })

  it('uses platform-neutral Traditional Chinese copy on Windows', async () => {
    mocks.getSettings.mockResolvedValue({ locale: 'zh-TW' })
    render(<I18nProvider><ExportLabels /></I18nProvider>)

    expect((await screen.findByTestId('local-only-summary')).textContent).toBe('未選發布目標 — 只存到本機')
    expect(screen.getByTestId('local-only-button').textContent).toBe('只輸出到本機')
  })
})
