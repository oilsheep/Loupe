import { app } from 'electron'
import type { AppUpdateCheckResult } from '@shared/types'

// Build-time defines (electron.vite.config.ts) point at GitHub by default,
// or at a Rayark GitLab generic-package endpoint when LOUPE_INTERNAL_UPDATE_*
// CI variables are set. Falls back to upstream GitHub when defines absent
// (e.g. running unbundled in dev).
const PROVIDER = typeof __LOUPE_UPDATE_PROVIDER__ === 'string' && __LOUPE_UPDATE_PROVIDER__
  ? __LOUPE_UPDATE_PROVIDER__
  : 'github'
const API_URL = typeof __LOUPE_UPDATE_API_URL__ === 'string' && __LOUPE_UPDATE_API_URL__
  ? __LOUPE_UPDATE_API_URL__
  : 'https://api.github.com/repos/oilsheep/Loupe/releases/latest'
const PAGE_URL_TEMPLATE = typeof __LOUPE_UPDATE_PAGE_URL_TEMPLATE__ === 'string' && __LOUPE_UPDATE_PAGE_URL_TEMPLATE__
  ? __LOUPE_UPDATE_PAGE_URL_TEMPLATE__
  : 'https://github.com/oilsheep/Loupe/releases/latest'

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
  if (PROVIDER === 'gitlab') return checkGitLabUpdate(currentVersion)
  return checkGithubUpdate(currentVersion, platform, arch)
}

async function checkGithubUpdate(currentVersion: string, platform: NodeJS.Platform, arch: NodeJS.Architecture): Promise<AppUpdateCheckResult> {
  const response = await fetch(API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Loupe/${currentVersion}`,
    },
  })
  if (response.status === 404) {
    return {
      currentVersion,
      updateAvailable: false,
      releaseUrl: PAGE_URL_TEMPLATE,
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
      releaseUrl: release.html_url || PAGE_URL_TEMPLATE,
      error: 'Latest GitHub release does not have a version tag.',
    }
  }

  const asset = chooseUpdateAsset(release.assets ?? [], platform, arch)
  return {
    currentVersion,
    latestVersion,
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl: release.html_url || PAGE_URL_TEMPLATE,
    publishedAt: release.published_at,
    downloadUrl: asset?.browser_download_url,
    assetName: asset?.name,
  }
}

async function checkGitLabUpdate(currentVersion: string): Promise<AppUpdateCheckResult> {
  // Node 22 fetch (undici) refuses URLs with embedded credentials per the
  // WHATWG Fetch spec ("Request cannot be constructed from a URL that
  // includes credentials"). Strip userinfo and re-attach as a Basic header.
  const url = new URL(API_URL)
  const headers: Record<string, string> = { 'User-Agent': `Loupe/${currentVersion}` }
  if (url.username || url.password) {
    headers.Authorization = `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`
    url.username = ''
    url.password = ''
  }
  const response = await fetch(url.toString(), { headers })
  if (!response.ok) throw new Error(`GitLab update check failed: HTTP ${response.status}`)
  const text = await response.text()

  // latest-mac.yml format: top-level `version: <semver>`. We don't need
  // the rest (files/path/sha) — just the version string for the prompt.
  const versionMatch = text.match(/^version:\s*(.+)$/m)
  const versionRaw = versionMatch?.[1]?.trim() ?? ''
  if (!versionRaw) {
    return {
      currentVersion,
      updateAvailable: false,
      releaseUrl: PAGE_URL_TEMPLATE.replace('{version}', ''),
      error: 'GitLab latest-mac.yml has no version field.',
    }
  }
  const releaseUrl = PAGE_URL_TEMPLATE.replace('{version}', `v${versionRaw}`)
  return {
    currentVersion,
    latestVersion: versionRaw,
    updateAvailable: compareVersions(versionRaw, currentVersion) > 0,
    releaseUrl,
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
  const left = parseSemver(a)
  const right = parseSemver(b)
  for (let i = 0; i < Math.max(left.main.length, right.main.length); i += 1) {
    const diff = (left.main[i] ?? 0) - (right.main[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  // Main numeric parts equal — compare pre-release identifiers per semver §11.4.
  // A version without pre-release is considered greater than one with pre-release
  // (so 0.5.8 > 0.5.8-rayark.11). Numeric identifiers compare numerically and
  // sort lower than alphanumeric ones. The internal `-rayark.N` chain falls under
  // the all-numeric tail and ends up ordered correctly: 0.5.8-rayark.11 wins
  // over 0.5.8-rayark.5.
  if (left.pre.length === 0 && right.pre.length === 0) return 0
  if (left.pre.length === 0) return 1
  if (right.pre.length === 0) return -1
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
    const ai = left.pre[i]
    const bi = right.pre[i]
    if (ai === bi) continue
    if (ai === undefined) return -1
    if (bi === undefined) return 1
    const aIsNum = /^\d+$/.test(ai)
    const bIsNum = /^\d+$/.test(bi)
    if (aIsNum && bIsNum) {
      const diff = Number(ai) - Number(bi)
      if (diff !== 0) return diff > 0 ? 1 : -1
    } else if (aIsNum) {
      return -1
    } else if (bIsNum) {
      return 1
    } else {
      return ai > bi ? 1 : -1
    }
  }
  return 0
}

interface ParsedSemver { main: number[]; pre: string[] }

function parseSemver(version: string): ParsedSemver {
  const normalized = normalizeVersion(version)
  const dash = normalized.indexOf('-')
  const mainStr = dash === -1 ? normalized : normalized.slice(0, dash)
  const preStr = dash === -1 ? '' : normalized.slice(dash + 1)
  return {
    main: mainStr.split('.').map(p => Number(p) || 0),
    pre: preStr ? preStr.split('.') : [],
  }
}

function normalizeVersion(version: string): string {
  // Preserve pre-release identifiers (e.g. `0.5.8-rayark.11`). Without that
  // tail, the internal patch chain compares equal to the base version and
  // the update banner never fires.
  const match = version.trim().match(/^v?(\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.-]+)?)/i)
  return match?.[1] ?? ''
}
