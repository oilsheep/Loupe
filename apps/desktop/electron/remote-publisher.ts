import type { AppSettings } from '@shared/types'
import type { ExportManifest } from './export-manifest'
import { publishManifestToGitLab, type GitLabPublishResult } from './gitlab-publisher'
import { publishManifestToGoogleDrive, type GooglePublishResult } from './google-publisher'
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
  | { target: 'slack' | 'gitlab' | 'google-drive'; failed: true; error: string }
  | ({ target: 'slack' } & SlackPublishResult)
  | ({ target: 'gitlab' } & GitLabPublishResult)
  | ({ target: 'google-drive' } & GooglePublishResult)

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function publishManifestToRemote(args: {
  manifest: ExportManifest
  manifestPaths: ManifestPaths
  settings: AppSettings
}): Promise<RemotePublishResult> {
  const targets = args.manifest.publish.targets?.length ? args.manifest.publish.targets : [args.manifest.publish.target]
  const remoteTargets = targets.filter((target): target is 'slack' | 'gitlab' | 'google-drive' => target === 'slack' || target === 'gitlab' || target === 'google-drive')
  if (remoteTargets.length === 0) {
    return { target: 'local', skipped: true }
  }

  const results: RemotePublishResult[] = []
  for (const target of remoteTargets) {
    try {
      if (target === 'slack') {
        const result = await publishManifestToSlack({
          manifest: args.manifest,
          manifestPaths: args.manifestPaths,
          settings: args.settings.slack,
          mentionIdentities: args.settings.mentionIdentities,
        })
        results.push({ target: 'slack', ...result })
      } else if (target === 'gitlab') {
        const result = await publishManifestToGitLab({
          manifest: args.manifest,
          manifestPaths: args.manifestPaths,
          settings: args.settings.gitlab,
          mentionIdentities: args.settings.mentionIdentities,
        })
        results.push({ target: 'gitlab', ...result })
      } else {
        const result = await publishManifestToGoogleDrive({
          manifest: args.manifest,
          manifestPaths: args.manifestPaths,
          settings: args.settings.google,
          mentionIdentities: args.settings.mentionIdentities,
        })
        results.push({ target: 'google-drive', ...result })
      }
    } catch (err) {
      results.push({ target, failed: true, error: errorMessage(err) })
    }
  }
  return results.length === 1 ? results[0] : { target: 'multi', results }
}
