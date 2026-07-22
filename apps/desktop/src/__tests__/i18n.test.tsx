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

function RecordingLimitLabels() {
  const { t } = useI18n()
  return (
    <>
      <div data-testid="recording-limit-label">{t('new.recordingMaxSize')}</div>
      <div data-testid="recording-limit-help">{t('new.recordingMaxSizeHelp')}</div>
      <div data-testid="recording-original-label">{t('new.recordingMaxSizeOriginal')}</div>
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

describe('recording limit localization', () => {
  beforeEach(() => {
    mocks.getSettings.mockReset()
  })

  it.each([
    ['en', 'Recording longest-edge limit', 'Limits the longest edge in pixels. Smaller sources are not enlarged.', 'Original size'],
    ['zh-TW', '錄製最長邊上限', '限制錄製畫面的最長邊像素；較小的來源不會被放大。', '原尺寸'],
    ['zh-CN', '录制最长边上限', '限制录制画面的最长边像素；较小的来源不会被放大。', '原始尺寸'],
    ['ja', '録画の長辺上限', '録画の長辺をピクセル単位で制限します。小さいソースは拡大しません。', '元のサイズ'],
    ['ko', '녹화 긴 변 제한', '녹화 화면의 긴 변을 픽셀 단위로 제한합니다. 더 작은 소스는 확대하지 않습니다.', '원본 크기'],
    ['es', 'Límite del lado más largo', 'Limita en píxeles el lado más largo. Las fuentes más pequeñas no se amplían.', 'Tamaño original'],
  ])('provides %s copy', async (locale, label, help, original) => {
    mocks.getSettings.mockResolvedValue({ locale })
    render(<I18nProvider><RecordingLimitLabels /></I18nProvider>)

    expect((await screen.findByTestId('recording-limit-label')).textContent).toBe(label)
    expect(screen.getByTestId('recording-limit-help').textContent).toBe(help)
    expect(screen.getByTestId('recording-original-label').textContent).toBe(original)
  })
})
