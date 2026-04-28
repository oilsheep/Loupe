import type { DesktopApi } from '@shared/types'

export const api: DesktopApi = (window as unknown as { api: DesktopApi }).api

export function localFileUrl(absolutePath: string): string {
  // Encode windows backslashes and turn drive letter into URL host-less path.
  const normalised = absolutePath.replace(/\\/g, '/')
  return `loupe-file:///${encodeURI(normalised)}`
}
