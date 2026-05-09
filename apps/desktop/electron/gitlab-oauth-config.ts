export interface OAuthInstance {
  url: string       // normalized, no trailing slash
  clientId: string
}

let cached: OAuthInstance[] | null = null

// Wrapped so tests can override without touching the build-time global.
let rawValue: string = typeof __LOUPE_GITLAB_OAUTH_INSTANCES__ === 'string'
  ? __LOUPE_GITLAB_OAUTH_INSTANCES__
  : ''

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

export function getBundledOAuthInstances(): OAuthInstance[] {
  if (cached !== null) return cached
  const raw = rawValue.trim()
  if (!raw) {
    cached = []
    return cached
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) throw new Error('expected array')
    const result: OAuthInstance[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const url = (entry as { url?: unknown }).url
      const clientId = (entry as { clientId?: unknown }).clientId
      if (typeof url !== 'string' || !url.trim()) continue
      if (typeof clientId !== 'string' || !clientId.trim()) continue
      result.push({ url: normalizeUrl(url.trim()), clientId: clientId.trim() })
    }
    cached = result
    return cached
  } catch (err) {
    console.error('[gitlab-oauth-config] failed to parse LOUPE_GITLAB_OAUTH_INSTANCES:', err)
    cached = []
    return cached
  }
}

export function findBundledOAuthInstance(url: string): OAuthInstance | undefined {
  if (!url) return undefined
  const target = normalizeUrl(url.trim())
  return getBundledOAuthInstances().find(i => i.url === target)
}

// Test-only helpers. Keep them in this file so tests don't need a parallel
// "internal" module; they're prefixed with _ to signal intent.
export function _resetBundledInstancesCacheForTests(): void {
  cached = null
}

export function _setBundledInstancesRawForTests(raw: string): void {
  rawValue = raw
  cached = null
}
