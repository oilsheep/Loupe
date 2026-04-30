import type { AppSettings } from '@shared/types'
import type { ExportManifest } from './export-manifest'
import { publishManifestToSlack, type SlackPublishResult } from './slack-publisher'

interface ManifestPaths {
  jsonPath: string
  csvPath: string
}

export type RemotePublishResult =
  | { target: 'local'; skipped: true }
  | ({ target: 'slack' } & SlackPublishResult)

export async function publishManifestToRemote(args: {
  manifest: ExportManifest
  manifestPaths: ManifestPaths
  settings: AppSettings
}): Promise<RemotePublishResult> {
  if (args.manifest.publish.target === 'local') {
    return { target: 'local', skipped: true }
  }

  if (args.manifest.publish.target === 'slack') {
    const result = await publishManifestToSlack({
      manifest: args.manifest,
      manifestPaths: args.manifestPaths,
      settings: args.settings.slack,
    })
    return { target: 'slack', ...result }
  }

  const target: never = args.manifest.publish.target
  throw new Error(`Unsupported publish target: ${target}`)
}
