import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RemotePublishResult } from './remote-publisher'

export interface SlackPublishRecord { channelId: string; rootTs: string | null; markerThreadTs: Record<string, string>; publishedAt: string }
export interface GitLabPublishRecord { projectId: string; issueUrls: string[]; publishedAt: string }
export interface GooglePublishRecord { folderId: string; folderUrl: string | null; publishedAt: string }

export interface PublishStateFile {
  version: 1
  targets: {
    slack?: SlackPublishRecord[]
    gitlab?: GitLabPublishRecord[]
    google?: GooglePublishRecord[]
  }
}

function readState(exportDir: string): PublishStateFile {
  const path = join(exportDir, 'publish-state.json')
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as PublishStateFile
      if (parsed && parsed.version === 1 && parsed.targets) return parsed
    } catch { /* fall through to fresh */ }
  }
  return { version: 1, targets: {} }
}

function flatten(result: RemotePublishResult): RemotePublishResult[] {
  return result.target === 'multi' ? result.results.flatMap(flatten) : [result]
}

export function appendPublishState(exportDir: string, result: RemotePublishResult, atIso: string): PublishStateFile {
  const state = readState(exportDir)
  for (const r of flatten(result)) {
    if (r.target === 'slack' && !('failed' in r)) {
      (state.targets.slack ??= []).push({ channelId: r.channelId, rootTs: r.rootTs, markerThreadTs: r.markerThreadTs, publishedAt: atIso })
    } else if (r.target === 'gitlab' && !('failed' in r)) {
      (state.targets.gitlab ??= []).push({ projectId: r.projectId, issueUrls: r.issueUrls, publishedAt: atIso })
    } else if (r.target === 'google-drive' && !('failed' in r)) {
      (state.targets.google ??= []).push({ folderId: r.folderId, folderUrl: r.folderUrl, publishedAt: atIso })
    }
    // 'local' (skipped) and failed results record nothing.
  }
  writeFileSync(join(exportDir, 'publish-state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  return state
}
