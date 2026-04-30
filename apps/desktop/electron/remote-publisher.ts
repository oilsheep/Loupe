import type { AppSettings } from '@shared/types'
import type { ExportManifest } from './export-manifest'
import { publishManifestToGitLab, type GitLabPublishResult } from './gitlab-publisher'
import { publishManifestToSlack, type SlackPublishResult } from './slack-publisher'

interface ManifestPaths {
  jsonPath: string
  csvPath: string
  reportPdfPath?: string | null
  summaryTextPath?: string | null
}

export type RemotePublishResult =
  | { target: 'local'; skipped: true }
  | { target: 'multi'; results: RemotePublishResult[] }
  | ({ target: 'slack' } & SlackPublishResult)
  | ({ target: 'gitlab' } & GitLabPublishResult)

export async function publishManifestToRemote(args: {
  manifest: ExportManifest
  manifestPaths: ManifestPaths
  settings: AppSettings
}): Promise<RemotePublishResult> {
  const targets = args.manifest.publish.targets?.length ? args.manifest.publish.targets : [args.manifest.publish.target]
  const remoteTargets = targets.filter((target): target is 'slack' | 'gitlab' => target === 'slack' || target === 'gitlab')
  if (remoteTargets.length === 0) {
    return { target: 'local', skipped: true }
  }

  const results: RemotePublishResult[] = []
  for (const target of remoteTargets) {
    if (target === 'slack') {
      const result = await publishManifestToSlack({
        manifest: args.manifest,
        manifestPaths: args.manifestPaths,
        settings: args.settings.slack,
      })
      results.push({ target: 'slack', ...result })
    } else {
      const result = await publishManifestToGitLab({
        manifest: args.manifest,
        manifestPaths: args.manifestPaths,
        settings: args.settings.gitlab,
      })
      results.push({ target: 'gitlab', ...result })
    }
  }
  return results.length === 1 ? results[0] : { target: 'multi', results }
}
