import { app } from 'electron'
import type { AppUpdateCheckResult } from '@shared/types'

const RELEASE_API_URL = 'https://api.github.com/repos/oilsheep/Loupe/releases/latest'
const RELEASE_PAGE_URL = 'https://github.com/oilsheep/Loupe/releases/latest'

interface GithubReleaseAsset {
  name?: string
  browser_download_url?: string
}

interface GithubRelease {
  html_url?: string
  tag_name?: string
  name?: string
  published_at?: string
  draft?: boolean
  prerelease?: boolean
  assets?: GithubReleaseAsset[]
}

export async function checkForAppUpdates(currentVersion = app.getVersion(), platform = process.platform, arch = process.arch): Promise<AppUpdateCheckResult> {
  const response = await fetch(RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Loupe/${currentVersion}`,
    },
  })
  if (response.status === 404) {
    return {
      currentVersion,
      updateAvailable: false,
      releaseUrl: RELEASE_PAGE_URL,
      error: 'No GitHub release is available yet.',
    }
  }
  if (!response.ok) throw new Error(`GitHub release check failed: HTTP ${response.status}`)

  const release = await response.json() as GithubRelease
  const latestVersion = normalizeVersion(release.tag_name || release.name || '')
  if (!latestVersion) {
    return {
      currentVersion,
      updateAvailable: false,
      releaseUrl: release.html_url || RELEASE_PAGE_URL,
      error: 'Latest GitHub release does not have a version tag.',
    }
  }

  const asset = chooseUpdateAsset(release.assets ?? [], platform, arch)
  return {
    currentVersion,
    latestVersion,
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl: release.html_url || RELEASE_PAGE_URL,
    publishedAt: release.published_at,
    downloadUrl: asset?.browser_download_url,
    assetName: asset?.name,
  }
}

export function chooseUpdateAsset(assets: GithubReleaseAsset[], platform = process.platform, arch = process.arch): GithubReleaseAsset | null {
  const available = assets.filter(asset => asset.name && asset.browser_download_url)
  const scored = available
    .map(asset => ({ asset, score: scoreAsset(asset.name!, platform, arch) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.asset ?? null
}

function scoreAsset(name: string, platform: string, arch: string): number {
  const lower = name.toLowerCase()
  let score = 0
  if (platform === 'darwin') {
    if (lower.endsWith('.dmg')) score += 100
    else if (lower.endsWith('.zip')) score += 60
    else return 0
    if (arch === 'arm64' && /arm64|aarch64|apple|silicon/.test(lower)) score += 20
    if (arch === 'x64' && /x64|x86_64|intel/.test(lower)) score += 20
    if (!/win|windows|linux/.test(lower)) score += 5
    return score
  }
  if (platform === 'win32') {
    if (lower.endsWith('.exe')) score += 100
    else if (lower.endsWith('.msi')) score += 90
    else if (lower.endsWith('.zip')) score += 40
    else return 0
    if (/x64|x86_64|win|windows/.test(lower)) score += 15
    return score
  }
  if (platform === 'linux') {
    if (lower.endsWith('.appimage')) score += 100
    else if (lower.endsWith('.deb')) score += 90
    else if (lower.endsWith('.rpm')) score += 80
    else if (lower.endsWith('.tar.gz') || lower.endsWith('.zip')) score += 40
    else return 0
    if (arch === 'arm64' && /arm64|aarch64/.test(lower)) score += 20
    if (arch === 'x64' && /x64|x86_64|amd64/.test(lower)) score += 20
    return score
  }
  return 0
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

function parseVersion(version: string): number[] {
  return normalizeVersion(version).split('.').map(part => Number(part) || 0)
}

function normalizeVersion(version: string): string {
  const match = version.trim().match(/^v?(\d+(?:\.\d+){0,3})/i)
  return match?.[1] ?? ''
}
