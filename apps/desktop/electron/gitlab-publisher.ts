import { basename } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import type { GitLabMentionUser, GitLabProject, GitLabPublishSettings, MentionIdentity, PublishTemplateConfig } from '@shared/types'
import { renderPublishTemplate, markerImagePath, type ExportManifest } from './export-manifest'

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

interface GitLabMemberResponse {
  id?: number
  username?: string
  name?: string
  email?: string
  public_email?: string
  state?: string
  avatar_url?: string
  web_url?: string
}

interface GitLabUserResponse {
  email?: string
  public_email?: string
}

interface GitLabProjectResponse {
  id?: number
  name?: string
  name_with_namespace?: string
  path_with_namespace?: string
  web_url?: string
  archived?: boolean
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

function authHeaders(settings: GitLabPublishSettings): Record<string, string> {
  const token = settings.token.trim()
  return settings.authType === 'oauth'
    ? { Authorization: `Bearer ${token}` }
    : { 'PRIVATE-TOKEN': token }
}

function validateProjectListSettings(settings: GitLabPublishSettings): void {
  if (!settings.baseUrl.trim()) throw new Error('GitLab base URL is missing')
  if (!settings.token.trim()) throw new Error('GitLab token is missing')
}

// Refresh 5 minutes before actual expiry to avoid races where the request
// is in flight when the token flips invalid.
const REFRESH_LEAD_MS = 5 * 60 * 1000

function tokenExpired(settings: GitLabPublishSettings): boolean {
  if (typeof settings.tokenExpiresAt !== 'number') return false
  return Date.now() >= settings.tokenExpiresAt - REFRESH_LEAD_MS
}

interface GitLabTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

// Cheap probe (GET /api/v4/user) that also handles refresh-if-needed. Used
// by the validateConnections IPC to keep the connection chip accurate on
// Preferences / publish-page open without re-fetching the full projects list.
//
// Throws when the token is dead so the caller can route through
// maybeClearExpiredGitLabTokenForProject — error message must match its
// regex (invalid_token|401|unauthorized).
export async function validateGitLabConnection(
  settings: GitLabPublishSettings,
  fetchImpl: GitLabPublisherFetch = fetch,
): Promise<GitLabPublishSettings> {
  const refreshed = await refreshGitLabAccessToken(settings, fetchImpl)
  if (!refreshed.token.trim()) throw new Error('GitLab token is missing')
  if (!refreshed.baseUrl.trim()) throw new Error('GitLab base URL is missing')
  const response = await fetchImpl(`${apiBase(refreshed.baseUrl)}/user`, {
    method: 'GET',
    headers: authHeaders(refreshed),
  })
  if (!response.ok) {
    throw new Error(`GitLab /user failed: ${response.status} ${response.statusText}`)
  }
  return refreshed
}

// Mirrors refreshGoogleAccessToken in google-publisher.ts.
export async function refreshGitLabAccessToken(
  settings: GitLabPublishSettings,
  fetchImpl: GitLabPublisherFetch = fetch,
  options: { forceRefresh?: boolean } = {},
): Promise<GitLabPublishSettings> {
  if (settings.authType === 'pat') return settings
  // No refresh token: nothing to do, return as-is. The caller (fetchGitLab*
  // or validateGitLabConnection) is responsible for handling the empty-token
  // case with a clearer "GitLab token is missing" error.
  if (!settings.refreshToken?.trim()) return settings
  if (!options.forceRefresh && settings.token.trim() && !tokenExpired(settings)) return settings

  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, '')
  if (!baseUrl) throw new Error('GitLab base URL is missing')
  const clientId = settings.oauthClientId?.trim()
  if (!clientId) throw new Error('GitLab OAuth client ID is missing')

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: settings.refreshToken.trim(),
    client_id: clientId,
  })
  if (settings.oauthClientSecret?.trim()) body.set('client_secret', settings.oauthClientSecret.trim())

  const response = await fetchImpl(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) as GitLabTokenResponse : {}
  if (!response.ok || !payload.access_token) {
    throw new Error(`GitLab token refresh failed: ${payload.error_description || payload.error || response.statusText}`)
  }
  return {
    ...settings,
    token: payload.access_token,
    refreshToken: payload.refresh_token || settings.refreshToken,
    tokenExpiresAt: Date.now() + Math.max(1, payload.expires_in ?? 7200) * 1000,
  }
}

export async function fetchGitLabProjects(settings: GitLabPublishSettings, fetchImpl: GitLabPublisherFetch = fetch): Promise<GitLabProject[]> {
  validateProjectListSettings(settings)
  const projects: GitLabProject[] = []
  let page = 1
  for (;;) {
    const response = await fetchImpl(`${apiBase(settings.baseUrl)}/projects?membership=true&simple=true&archived=false&order_by=last_activity_at&sort=desc&per_page=100&page=${page}`, {
      method: 'GET',
      headers: authHeaders(settings),
    })
    const text = await response.text()
    const payload = text ? JSON.parse(text) as GitLabProjectResponse[] | { message?: unknown; error?: unknown } : []
    if (!response.ok) {
      const message = !Array.isArray(payload) && typeof payload.message === 'string'
        ? payload.message
        : !Array.isArray(payload) && typeof payload.error === 'string'
          ? payload.error
          : response.statusText
      throw new Error(`GitLab projects fetch failed: ${message}`)
    }
    if (!Array.isArray(payload)) throw new Error('GitLab projects fetch failed: unexpected response')
    for (const project of payload) {
      const id = typeof project.id === 'number' ? project.id : 0
      const pathWithNamespace = project.path_with_namespace?.trim() || ''
      if (!id || !pathWithNamespace || project.archived) continue
      projects.push({
        id,
        name: project.name?.trim() || pathWithNamespace.split('/').pop() || pathWithNamespace,
        nameWithNamespace: project.name_with_namespace?.trim() || pathWithNamespace,
        pathWithNamespace,
        webUrl: project.web_url?.trim(),
      })
    }
    const nextPage = response.headers.get('x-next-page')?.trim()
    if (nextPage) {
      page = Number(nextPage)
      if (Number.isFinite(page) && page > 0) continue
    }
    if (payload.length === 100) {
      page += 1
      continue
    }
    break
  }
  const byPath = new Map(projects.map(project => [project.pathWithNamespace, project]))
  return [...byPath.values()].sort((a, b) => a.nameWithNamespace.localeCompare(b.nameWithNamespace))
}

export async function fetchGitLabMentionUsers(settings: GitLabPublishSettings, fetchImpl: GitLabPublisherFetch = fetch): Promise<GitLabMentionUser[]> {
  validateSettings(settings)
  const users: GitLabMentionUser[] = []
  let page = 1
  for (;;) {
    const response = await fetchImpl(`${apiBase(settings.baseUrl)}/projects/${projectPath(settings.projectId)}/members/all?per_page=100&page=${page}`, {
      method: 'GET',
      headers: authHeaders(settings),
    })
    const text = await response.text()
    const payload = text ? JSON.parse(text) as GitLabMemberResponse[] | { message?: unknown; error?: unknown } : []
    if (!response.ok) {
      const message = !Array.isArray(payload) && typeof payload.message === 'string'
        ? payload.message
        : !Array.isArray(payload) && typeof payload.error === 'string'
          ? payload.error
          : response.statusText
      throw new Error(`GitLab members fetch failed: ${message}`)
    }
    if (!Array.isArray(payload)) throw new Error('GitLab members fetch failed: unexpected response')
    for (const member of payload) {
      const id = typeof member.id === 'number' ? member.id : 0
      const username = member.username?.trim().replace(/^@/, '') || ''
      const state = member.state?.trim()
      if (!id || !username) continue
      if (state !== 'active') continue
      users.push({
        id,
        username,
        name: member.name?.trim() || username,
        email: (member.email || member.public_email)?.trim().toLowerCase() || undefined,
        state,
        avatarUrl: member.avatar_url?.trim(),
        webUrl: member.web_url?.trim(),
      })
    }
    const nextPage = response.headers.get('x-next-page')?.trim()
    if (nextPage) {
      page = Number(nextPage)
      if (Number.isFinite(page) && page > 0) continue
    }
    if (payload.length === 100) {
      page += 1
      continue
    }
    break
  }
  const byUsername = new Map(users.map(user => [user.username, user]))
  return [...byUsername.values()].sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username))
}

export async function fetchGitLabMentionUsersWithEmailLookup(
  settings: GitLabPublishSettings,
  fetchImpl: GitLabPublisherFetch = fetch,
): Promise<{ users: GitLabMentionUser[]; warning: string | null }> {
  const users = await fetchGitLabMentionUsers(settings, fetchImpl)
  if (settings.emailLookup !== 'admin-users-api') return { users, warning: null }

  let warning: string | null = null
  let attemptedEmailLookup = false
  let foundEmail = false
  const enriched: GitLabMentionUser[] = []
  for (const user of users) {
    if (user.email) {
      enriched.push(user)
      foundEmail = true
      continue
    }
    try {
      attemptedEmailLookup = true
      const response = await fetchImpl(`${apiBase(settings.baseUrl)}/users/${user.id}`, {
        method: 'GET',
        headers: authHeaders(settings),
      })
      const text = await response.text()
      if (response.status === 403) {
        warning = '需要 self-managed admin token 才能讀取 GitLab email。'
        enriched.push(user)
        continue
      }
      if (!response.ok) {
        enriched.push(user)
        continue
      }
      const payload = text ? JSON.parse(text) as GitLabUserResponse : {}
      const email = (payload.email || payload.public_email)?.trim().toLowerCase()
      if (email) foundEmail = true
      enriched.push(email ? { ...user, email } : user)
    } catch {
      enriched.push(user)
    }
  }
  if (!warning && attemptedEmailLookup && !foundEmail) {
    warning = 'GitLab users API 沒有回傳 email；請確認 token 是 self-managed admin token 且有 api scope。'
  }
  return { users: enriched, warning }
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
      ...authHeaders(settings),
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
    headers: authHeaders(settings),
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

function mentionText(settings: GitLabPublishSettings, marker: ExportManifest['markers'][number], identities: MentionIdentity[]): string {
  const byId = new Map(identities.map(identity => [identity.id, identity]))
  const names = (settings.mentionUsernames ?? []).map(name => name.trim().replace(/^@/, '')).filter(Boolean)
  const markerNames = marker.mentionUserIds
    .map(id => byId.get(id)?.gitlabUsername?.trim().replace(/^@/, ''))
    .filter(Boolean) as string[]
  const allNames = Array.from(new Set([...names, ...markerNames]))
  if (allNames.length === 0) return ''
  return allNames.map(name => `@${name}`).join(' ')
}

function sessionLines(manifest: ExportManifest): string[] {
  const session = manifest.session
  const lines = [
    ...(session.project ? [`Project: ${session.project}`] : []),
    `Build: ${session.buildVersion || '-'}`,
    `Device: ${[session.platform, session.deviceModel || '-', session.androidVersion === 'Windows' ? 'Windows' : `Android ${session.androidVersion || '-'}`].filter(Boolean).join(' / ')}`,
    `Tester: ${session.tester || '-'}`,
  ]
  if (session.ramTotalGb != null) lines.push(`RAM: ${session.ramTotalGb.toFixed(1)}G`)
  if (session.graphicsDevice) lines.push(`Graphic Device: ${session.graphicsDevice}`)
  if (session.testNote) lines.push(`Test note: ${session.testNote}`)
  return lines
}

// Session-level issue body (single-issue root, or per-marker summary). The trailing
// listSection is either the marker list or links to the per-marker issues.
function buildIssueDescription(manifest: ExportManifest, summaryTextPath: string | null | undefined, attachments: string[], listSection: string[], template?: PublishTemplateConfig): string {
  const summary = summaryTextPath && existsSync(summaryTextPath) ? readFileSync(summaryTextPath, 'utf8').trim() : ''
  const templated = template?.session?.trim() ? renderPublishTemplate(template.session, manifest) : ''
  const lines = [
    templated || summary || ['Loupe QA Export', '', ...sessionLines(manifest), '', `Markers: ${manifest.markers.length}`].join('\n'),
    '',
    ...attachments,
    '',
    ...listSection,
  ]
  return lines.filter((line, index, arr) => line || arr[index - 1]).join('\n')
}

function markerBody(manifest: ExportManifest, settings: GitLabPublishSettings, marker: ExportManifest['markers'][number], attachments: string[], errors: string[], identities: MentionIdentity[], template?: PublishTemplateConfig): string {
  const mention = mentionText(settings, marker, identities)
  const templated = template?.marker?.trim() ? renderPublishTemplate(template.marker, manifest, marker) : ''
  const lines = [
    mention,
    templated || markerTitle(marker),
    '',
    ...(templated ? [] : [...sessionLines(manifest), '', marker.note.trim() || '(none)']),
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
  mentionIdentities?: MentionIdentity[]
  template?: PublishTemplateConfig
  fetchImpl?: GitLabPublisherFetch
}): Promise<GitLabPublishResult> {
  validateSettings(args.settings)
  const fetchImpl = args.fetchImpl ?? fetch
  const mode = args.manifest.publish.gitlabMode ?? args.settings.mode
  const mentionIdentities = args.mentionIdentities ?? []
  const template = args.template
  const issueUrls: string[] = []
  const uploadErrors: string[] = []
  // Per marker, attach the high-res screenshot (falling back to the contact-sheet preview)
  // plus the video clip if any. The shared session PDF belongs only on the single-issue
  // root — repeating it on every per-marker issue is noise.
  async function markerAttachments(marker: ExportManifest['markers'][number], markerErrors: string[]): Promise<string[]> {
    // Screenshot and clip are independent uploads — run them concurrently; the
    // destructure preserves [image, video] order regardless of completion order.
    const [imageMarkdown, mediaMarkdown] = await Promise.all([
      uploadFileCollectingErrors(markerErrors, fetchImpl, args.settings, markerImagePath(marker)),
      uploadFileCollectingErrors(markerErrors, fetchImpl, args.settings, marker.videoPath),
    ])
    return [imageMarkdown, mediaMarkdown].filter(Boolean) as string[]
  }

  if (mode === 'single-issue') {
    const reportMarkdown = await uploadFileCollectingErrors(uploadErrors, fetchImpl, args.settings, args.manifest.reportPdfPath ?? args.manifestPaths.reportPdfPath)
    const issue = await createIssue(
      fetchImpl,
      args.settings,
      template?.title?.trim() ? renderPublishTemplate(template.title, args.manifest) : `[Loupe QA] ${args.manifest.session.buildVersion || args.manifest.session.id} - ${args.manifest.markers.length} marker${args.manifest.markers.length === 1 ? '' : 's'}`,
      buildIssueDescription(args.manifest, args.manifestPaths.summaryTextPath, [reportMarkdown].filter(Boolean) as string[], args.manifest.markers.map((marker, index) => `${index + 1}. ${markerTitle(marker)}`), template),
    )
    if (issue.web_url) issueUrls.push(issue.web_url)
    for (const marker of args.manifest.markers) {
      const markerErrors: string[] = []
      const body = markerBody(args.manifest, args.settings, marker, await markerAttachments(marker, markerErrors), markerErrors, mentionIdentities, template)
      await createIssueNote(fetchImpl, args.settings, issue.iid, body)
      uploadErrors.push(...markerErrors)
    }
  } else {
    const issueLinks: Array<{ title: string; url: string }> = []
    for (const marker of args.manifest.markers) {
      const markerErrors: string[] = []
      const attachments = await markerAttachments(marker, markerErrors)
      const issue = await createIssue(
        fetchImpl,
        args.settings,
        template?.title?.trim() ? renderPublishTemplate(template.title, args.manifest, marker) : `[Loupe QA] ${markerTitle(marker)}`,
        markerBody(args.manifest, args.settings, marker, attachments, markerErrors, mentionIdentities, template),
      )
      if (issue.web_url) {
        issueUrls.push(issue.web_url)
        issueLinks.push({ title: markerTitle(marker), url: issue.web_url })
      }
      uploadErrors.push(...markerErrors)
    }
    // One summary issue carries the session PDF + overview and links every marker issue,
    // so the PDF appears exactly once instead of being repeated on each issue.
    const reportMarkdown = await uploadFileCollectingErrors(uploadErrors, fetchImpl, args.settings, args.manifest.reportPdfPath ?? args.manifestPaths.reportPdfPath)
    const summaryIssue = await createIssue(
      fetchImpl,
      args.settings,
      `[Loupe QA] Summary — ${args.manifest.session.buildVersion || args.manifest.session.id} (${args.manifest.markers.length} marker${args.manifest.markers.length === 1 ? '' : 's'})`,
      buildIssueDescription(args.manifest, args.manifestPaths.summaryTextPath, [reportMarkdown].filter(Boolean) as string[], issueLinks.length > 0 ? ['Issues:', ...issueLinks.map((link, index) => `${index + 1}. ${link.title} — ${link.url}`)] : [], template),
    )
    if (summaryIssue.web_url) issueUrls.push(summaryIssue.web_url)
  }

  return { projectId: args.settings.projectId.trim(), mode, issueUrls, uploadErrors }
}
