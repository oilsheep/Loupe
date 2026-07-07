import type { AppSettings, RepublishOverrides } from '@shared/types'
import type { ExportManifest } from './export-manifest'
import { publishManifestToGitLab, type GitLabPublishResult } from './gitlab-publisher'
import { publishManifestToGoogleDrive, type GooglePublishResult } from './google-publisher'
import { publishManifestToSlack, type SlackPublishResult } from './slack-publisher'
import { findProfileForSession } from '@shared/profileLookup'

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
  overrides?: RepublishOverrides
  onProgress?: (target: 'slack' | 'gitlab' | 'google-drive') => void
}): Promise<RemotePublishResult> {
  const targets = args.manifest.publish.targets?.length ? args.manifest.publish.targets : [args.manifest.publish.target]
  const remoteTargets = targets.filter((target): target is 'slack' | 'gitlab' | 'google-drive' => target === 'slack' || target === 'gitlab' || target === 'google-drive')
  if (remoteTargets.length === 0) {
    return { target: 'local', skipped: true }
  }

  const sessionProjectName = args.manifest.session.project
  const { profile, matched } = findProfileForSession(args.settings, args.manifest.session)
  if (!matched) {
    if (sessionProjectName) {
      console.warn(`[publish] Session's project "${sessionProjectName}" no longer exists. Falling back to active profile "${profile.name}".`)
    }
    // Else: session was recorded without a project name (legacy session, or
    // fresh session before the profileId field existed). Silent fallback to active.
  }

  // Mode overrides ride on the manifest the publishers read; clone so we never
  // mutate the caller's object.
  const ov = args.overrides
  const manifest = ov
    ? { ...args.manifest, publish: {
        ...args.manifest.publish,
        slackThreadMode: ov.slack?.threadMode ?? args.manifest.publish.slackThreadMode,
        gitlabMode: ov.gitlab?.mode ?? args.manifest.publish.gitlabMode,
      } }
    : args.manifest

  const results: RemotePublishResult[] = []
  for (const target of remoteTargets) {
    args.onProgress?.(target)
    try {
      if (target === 'slack') {
        const settings = ov?.slack
          ? { ...profile.slack, channelId: ov.slack.channelId, mentionUserIds: ov.slack.mentionUserIds }
          : profile.slack
        const result = await publishManifestToSlack({
          manifest,
          manifestPaths: args.manifestPaths,
          settings,
          mentionIdentities: args.settings.mentionIdentities,
          template: profile.publishTemplates?.slack,
        })
        results.push({ target: 'slack', ...result })
      } else if (target === 'gitlab') {
        const settings = ov?.gitlab
          ? { ...profile.gitlab, projectId: ov.gitlab.projectId }
          : profile.gitlab
        const result = await publishManifestToGitLab({
          manifest,
          manifestPaths: args.manifestPaths,
          settings,
          mentionIdentities: args.settings.mentionIdentities,
          template: profile.publishTemplates?.gitlab,
        })
        results.push({ target: 'gitlab', ...result })
      } else {
        const result = await publishManifestToGoogleDrive({
          manifest,
          manifestPaths: args.manifestPaths,
          settings: profile.google,
          mentionIdentities: args.settings.mentionIdentities,
          template: profile.publishTemplates?.['google-drive'],
        })
        results.push({ target: 'google-drive', ...result })
      }
    } catch (err) {
      results.push({ target, failed: true, error: errorMessage(err) })
    }
  }
  return results.length === 1 ? results[0] : { target: 'multi', results }
}
