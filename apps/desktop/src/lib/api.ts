import type { DesktopApi } from '@shared/types'

export const api: DesktopApi = (window as unknown as { api: DesktopApi }).api

export function localFileUrl(absolutePath: string): string {
  // Encode windows backslashes and turn drive letter into URL host-less path.
  const normalised = absolutePath.replace(/\\/g, '/')
  return `loupe-file:///${encodeURI(normalised)}`
}

/** Resolves a session-relative asset (video.mp4, screenshots/<id>.png, etc.) to a `loupe-file://` URL. */
export async function assetUrl(sessionId: string, relPath: string): Promise<string> {
  const abs = await api._resolveAssetPath(sessionId, relPath)
  return localFileUrl(abs)
}
