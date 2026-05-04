import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.5.0') },
}))

import { checkForAppUpdates, chooseUpdateAsset, compareVersions } from '../app-updates'

describe('app update checks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('compares semantic versions with optional v prefixes', () => {
    expect(compareVersions('v0.5.1', '0.5.0')).toBe(1)
    expect(compareVersions('0.5.0', '0.5.0')).toBe(0)
    expect(compareVersions('0.4.9', '0.5.0')).toBe(-1)
  })

  it('chooses a macOS dmg asset over zip assets', () => {
    const asset = chooseUpdateAsset([
      { name: 'Loupe QA Recorder-0.5.1.zip', browser_download_url: 'https://github.com/oilsheep/Loupe/releases/download/v0.5.1/app.zip' },
      { name: 'Loupe QA Recorder-0.5.1.dmg', browser_download_url: 'https://github.com/oilsheep/Loupe/releases/download/v0.5.1/app.dmg' },
    ], 'darwin', 'arm64')

    expect(asset?.name).toContain('.dmg')
  })

  it('reports an available update from GitHub releases', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        tag_name: 'v0.5.1',
        html_url: 'https://github.com/oilsheep/Loupe/releases/tag/v0.5.1',
        published_at: '2026-05-04T00:00:00Z',
        assets: [
          { name: 'Loupe QA Recorder-0.5.1.dmg', browser_download_url: 'https://github.com/oilsheep/Loupe/releases/download/v0.5.1/Loupe.dmg' },
        ],
      }),
    }))

    await expect(checkForAppUpdates('0.5.0', 'darwin', 'arm64')).resolves.toMatchObject({
      currentVersion: '0.5.0',
      latestVersion: '0.5.1',
      updateAvailable: true,
      assetName: 'Loupe QA Recorder-0.5.1.dmg',
    })
  })
})
