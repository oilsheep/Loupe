import { basename } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import type { GitLabPublishSettings } from '@shared/types'
import type { ExportManifest } from './export-manifest'

interface ManifestPaths {
  jsonPath: string
  csvPath: string
  reportPdfPath?: string | null
  summaryTextPath?: string | null
}

interface GitLabPublisherFetch {
  (input: string, init?: RequestInit): Promise<Response>
}

interface GitLabIssueResponse {
  iid: number
  web_url?: string
}

interface GitLabUploadResponse {
  markdown?: string
  url?: string
  full_path?: string
}

export interface GitLabPublishResult {
  projectId: string
  mode: 'single-issue' | 'per-marker-issue'
  issueUrls: string[]
  uploadErrors: string[]
}

function validateSettings(settings: GitLabPublishSettings): void {
  if (!settings.baseUrl.trim()) throw new Error('GitLab base URL is missing')
  if (!settings.token.trim()) throw new Error('GitLab token is missing')
  if (!settings.projectId.trim()) throw new Error('GitLab project ID or path is missing')
}

function apiBase(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/api/v4`
}

function projectPath(projectId: string): string {
  return encodeURIComponent(projectId.trim())
}

async function gitlabJson<T>(
  fetchImpl: GitLabPublisherFetch,
  settings: GitLabPublishSettings,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetchImpl(`${apiBase(settings.baseUrl)}${path}`, {
    method: 'POST',
    headers: {
      'PRIVATE-TOKEN': settings.token.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) as T & { message?: unknown; error?: unknown } : {} as T & { message?: unknown; error?: unknown }
  if (!response.ok) {
    const message = typeof payload.message === 'string'
      ? payload.message
      : typeof payload.error === 'string'
        ? payload.error
        : response.statusText
    throw new Error(`GitLab ${path} failed: ${message}`)
  }
  return payload
}

async function uploadFile(fetchImpl: GitLabPublisherFetch, settings: GitLabPublishSettings, filePath: string): Promise<string> {
  const form = new FormData()
  const bytes = readFileSync(filePath)
  form.set('file', new Blob([bytes]), basename(filePath))
  const response = await fetchImpl(`${apiBase(settings.baseUrl)}/projects/${projectPath(settings.projectId)}/uploads`, {
    method: 'POST',
    headers: { 'PRIVATE-TOKEN': settings.token.trim() },
    body: form,
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) as GitLabUploadResponse & { message?: unknown; error?: unknown } : {}
  if (!response.ok) {
    const message = typeof payload.message === 'string'
      ? payload.message
      : typeof payload.error === 'string'
        ? payload.error
        : response.statusText
    throw new Error(`GitLab upload failed for ${basename(filePath)}: ${message}`)
  }
  return payload.markdown || payload.full_path || payload.url || basename(filePath)
}

async function uploadFileCollectingErrors(errors: string[], fetchImpl: GitLabPublisherFetch, settings: GitLabPublishSettings, filePath: string | null | undefined): Promise<string | null> {
  if (!filePath || !existsSync(filePath)) return null
  try {
    return await uploadFile(fetchImpl, settings, filePath)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    errors.push(`${basename(filePath)}: ${reason}`)
    return null
  }
}

function markerTitle(marker: ExportManifest['markers'][number]): string {
  return `[${marker.severityLabel || marker.severity}] ${marker.note.trim() || 'No note'}`
}

function mentionText(settings: GitLabPublishSettings, marker: ExportManifest['markers'][number]): string {
  const names = (settings.mentionUsernames ?? []).map(name => name.trim().replace(/^@/, '')).filter(Boolean)
  if (names.length === 0 && marker.mentionUserIds.length === 0) return ''
  return [...names, ...marker.mentionUserIds].map(name => `@${name.replace(/^@/, '')}`).join(' ')
}

function sessionLines(manifest: ExportManifest): string[] {
  const session = manifest.session
  const lines = [
    `Build: ${session.buildVersion || '-'}`,
    `Device: ${session.deviceModel || '-'} / ${session.androidVersion === 'Windows' ? 'Windows' : `Android ${session.androidVersion || '-'}`}`,
    `Tester: ${session.tester || '-'}`,
  ]
  if (session.ramTotalGb != null) lines.push(`RAM: ${session.ramTotalGb.toFixed(1)}G`)
  if (session.graphicsDevice) lines.push(`Graphic Device: ${session.graphicsDevice}`)
  if (session.testNote) lines.push(`Test note: ${session.testNote}`)
  return lines
}

function rootDescription(manifest: ExportManifest, summaryTextPath: string | null | undefined, attachments: string[]): string {
  const summary = summaryTextPath && existsSync(summaryTextPath) ? readFileSync(summaryTextPath, 'utf8').trim() : ''
  const lines = [
    summary || ['Loupe QA Export', '', ...sessionLines(manifest), '', `Markers: ${manifest.markers.length}`].join('\n'),
    '',
    ...attachments,
    '',
    ...manifest.markers.map((marker, index) => `${index + 1}. ${markerTitle(marker)}`),
  ]
  return lines.filter((line, index, arr) => line || arr[index - 1]).join('\n')
}

function markerBody(manifest: ExportManifest, settings: GitLabPublishSettings, marker: ExportManifest['markers'][number], attachments: string[], errors: string[]): string {
  const mention = mentionText(settings, marker)
  const lines = [
    mention,
    markerTitle(marker),
    '',
    ...sessionLines(manifest),
    '',
    marker.note.trim() || '(none)',
    '',
    ...attachments,
    ...(errors.length > 0 ? ['', `Upload errors:\n${errors.map(error => `- ${error}`).join('\n')}`] : []),
  ]
  return lines.filter((line, index, arr) => line || arr[index - 1]).join('\n')
}

async function createIssue(fetchImpl: GitLabPublisherFetch, settings: GitLabPublishSettings, title: string, description: string): Promise<GitLabIssueResponse> {
  return gitlabJson<GitLabIssueResponse>(fetchImpl, settings, `/projects/${projectPath(settings.projectId)}/issues`, {
    title,
    description,
    labels: (settings.labels ?? []).join(','),
    confidential: Boolean(settings.confidential),
  })
}

async function createIssueNote(fetchImpl: GitLabPublisherFetch, settings: GitLabPublishSettings, issueIid: number, body: string): Promise<void> {
  await gitlabJson(fetchImpl, settings, `/projects/${projectPath(settings.projectId)}/issues/${issueIid}/notes`, {
    body,
    internal: Boolean(settings.confidential),
  })
}

export async function publishManifestToGitLab(args: {
  manifest: ExportManifest
  manifestPaths: ManifestPaths
  settings: GitLabPublishSettings
  fetchImpl?: GitLabPublisherFetch
}): Promise<GitLabPublishResult> {
  validateSettings(args.settings)
  const fetchImpl = args.fetchImpl ?? fetch
  const mode = args.manifest.publish.gitlabMode ?? args.settings.mode
  const issueUrls: string[] = []
  const uploadErrors: string[] = []
  const reportMarkdown = await uploadFileCollectingErrors(uploadErrors, fetchImpl, args.settings, args.manifest.reportPdfPath ?? args.manifestPaths.reportPdfPath)

  if (mode === 'single-issue') {
    const issue = await createIssue(
      fetchImpl,
      args.settings,
      `[Loupe QA] ${args.manifest.session.buildVersion || args.manifest.session.id} - ${args.manifest.markers.length} marker${args.manifest.markers.length === 1 ? '' : 's'}`,
      rootDescription(args.manifest, args.manifestPaths.summaryTextPath, [reportMarkdown].filter(Boolean) as string[]),
    )
    if (issue.web_url) issueUrls.push(issue.web_url)
    for (const marker of args.manifest.markers) {
      const markerErrors: string[] = []
      const videoMarkdown = await uploadFileCollectingErrors(markerErrors, fetchImpl, args.settings, marker.videoPath)
      const body = markerBody(args.manifest, args.settings, marker, [videoMarkdown].filter(Boolean) as string[], markerErrors)
      await createIssueNote(fetchImpl, args.settings, issue.iid, body)
      uploadErrors.push(...markerErrors)
    }
  } else {
    for (const marker of args.manifest.markers) {
      const markerErrors: string[] = []
      const videoMarkdown = await uploadFileCollectingErrors(markerErrors, fetchImpl, args.settings, marker.videoPath)
      const issue = await createIssue(
        fetchImpl,
        args.settings,
        `[Loupe QA] ${markerTitle(marker)}`,
        markerBody(args.manifest, args.settings, marker, [reportMarkdown, videoMarkdown].filter(Boolean) as string[], markerErrors),
      )
      if (issue.web_url) issueUrls.push(issue.web_url)
      uploadErrors.push(...markerErrors)
    }
  }

  return { projectId: args.settings.projectId.trim(), mode, issueUrls, uploadErrors }
}
