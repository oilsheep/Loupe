import type { DesktopApi } from '@shared/types'

export const api: DesktopApi = (window as unknown as { api: DesktopApi }).api

export function localFileUrl(absolutePath: string): string {
  const normalised = absolutePath.replace(/\\/g, '/')
  const encoded = normalised
    .split('/')
    .map((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part)) ? part : encodeURIComponent(part))
    .join('/')
  if (/^[A-Za-z]:\//.test(encoded)) return `file:///${encoded}`
  return `file://${encoded.startsWith('/') ? encoded : `/${encoded}`}`
}

/** Resolves a session-relative asset (video.mp4, screenshots/<id>.png, etc.) to a local file URL. */
export async function assetUrl(sessionId: string, relPath: string): Promise<string> {
  const abs = await api._resolveAssetPath(sessionId, relPath)
  return localFileUrl(abs)
}
