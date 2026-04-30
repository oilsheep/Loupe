import { basename } from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'
import type { ExportManifest } from './export-manifest'
import { slackSessionMessage } from './export-manifest'
import type { SlackMentionUser, SlackPublishSettings } from '@shared/types'

interface ManifestPaths {
  jsonPath: string
  csvPath: string
  reportPdfPath?: string | null
  summaryTextPath?: string | null
}

interface SlackApiResponse {
  ok: boolean
  error?: string
  ts?: string
  file_id?: string
  upload_url?: string
  members?: Array<{
    id?: string
    name?: string
    deleted?: boolean
    is_bot?: boolean
    profile?: {
      display_name?: string
      real_name?: string
      real_name_normalized?: string
    }
  }>
  response_metadata?: { next_cursor?: string }
}

interface SlackPublisherFetch {
  (input: string, init?: RequestInit): Promise<Response>
}

export interface SlackPublishResult {
  channelId: string
  rootTs: string | null
  markerThreadTs: Record<string, string>
  mode: 'single-thread' | 'per-marker-thread'
  uploadErrors: string[]
}

async function slackApi(fetchImpl: SlackPublisherFetch, token: string, method: string, body: Record<string, unknown>): Promise<SlackApiResponse> {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    if (value == null) continue
    form.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const response = await fetchImpl(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body: form.toString(),
  })
  const payload = await response.json() as SlackApiResponse
  if (!response.ok || !payload.ok) {
    throw new Error(`Slack ${method} failed: ${payload.error || response.statusText}`)
  }
  return payload
}

export async function fetchSlackMentionUsers(token: string, fetchImpl: SlackPublisherFetch = fetch): Promise<SlackMentionUser[]> {
  const botToken = token.trim()
  if (!botToken) throw new Error('Slack bot token is missing')
  const users: SlackMentionUser[] = []
  let cursor = ''
  do {
    const payload = await slackApi(fetchImpl, botToken, 'users.list', {
      limit: '200',
      ...(cursor ? { cursor } : {}),
    })
    for (const member of payload.members ?? []) {
      const id = member.id?.trim()
      if (!id || member.deleted || member.is_bot || id === 'USLACKBOT') continue
      users.push({
        id,
        name: member.name?.trim() || '',
        displayName: member.profile?.display_name?.trim() || '',
        realName: member.profile?.real_name_normalized?.trim() || member.profile?.real_name?.trim() || '',
        deleted: Boolean(member.deleted),
        isBot: Boolean(member.is_bot),
      })
    }
    cursor = payload.response_metadata?.next_cursor?.trim() || ''
  } while (cursor)
  return users.sort((a, b) => mentionSortLabel(a).localeCompare(mentionSortLabel(b)))
}

function mentionSortLabel(user: SlackMentionUser): string {
  return user.displayName || user.realName || user.name || user.id
}

function slackUploadFilename(filePath: string): string {
  const original = basename(filePath)
  const dot = original.lastIndexOf('.')
  const rawStem = dot > 0 ? original.slice(0, dot) : original
  const ext = dot > 0 ? original.slice(dot).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16) : ''
  const stem = rawStem
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72) || 'loupe-file'
  return `${stem}${ext}`
}

async function postMessage(fetchImpl: SlackPublisherFetch, token: string, channelId: string, text: string, threadTs?: string): Promise<string> {
  const payload = await slackApi(fetchImpl, token, 'chat.postMessage', {
    channel: channelId,
    text,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  })
  if (!payload.ts) throw new Error('Slack chat.postMessage did not return a message timestamp')
  return payload.ts
}

async function uploadFile(fetchImpl: SlackPublisherFetch, token: string, channelId: string, filePath: string, threadTs: string, initialComment?: string): Promise<void> {
  const filename = slackUploadFilename(filePath)
  const length = statSync(filePath).size
  if (length <= 0) throw new Error(`Cannot upload empty file: ${basename(filePath)}`)
  const upload = await slackApi(fetchImpl, token, 'files.getUploadURLExternal', {
    filename,
    length,
  })
  if (!upload.upload_url || !upload.file_id) throw new Error(`Slack did not return upload info for ${filename}`)

  const uploadResponse = await fetchImpl(upload.upload_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: readFileSync(filePath),
  })
  if (!uploadResponse.ok) throw new Error(`Slack file upload failed for ${filename}: ${uploadResponse.statusText}`)

  await slackApi(fetchImpl, token, 'files.completeUploadExternal', {
    channel_id: channelId,
    thread_ts: threadTs,
    initial_comment: initialComment,
    files: [{ id: upload.file_id, title: filename }],
  })
}

async function uploadFileCollectingErrors(
  errors: string[],
  fetchImpl: SlackPublisherFetch,
  token: string,
  channelId: string,
  filePath: string,
  threadTs: string,
  initialComment?: string,
): Promise<void> {
  try {
    await uploadFile(fetchImpl, token, channelId, filePath, threadTs, initialComment)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    errors.push(`${basename(filePath)}: ${reason}`)
  }
}

function validateSettings(settings: SlackPublishSettings): void {
  if (!settings.botToken.trim()) throw new Error('Slack bot token is missing')
  if (!settings.channelId.trim()) throw new Error('Slack channel ID is missing')
}

function markerTitle(marker: ExportManifest['markers'][number]): string {
  return `[${marker.severityLabel || marker.severity}] ${marker.note.trim() || 'No note'}`
}

function rootMessageText(manifest: ExportManifest, paths: ManifestPaths): string {
  const summaryPath = paths.summaryTextPath
  if (summaryPath && existsSync(summaryPath)) {
    const summary = readFileSync(summaryPath, 'utf8').trimEnd()
    if (summary) return summary
  }
  return slackSessionMessage(manifest).trimEnd()
}

function markerMessageText(marker: ExportManifest['markers'][number]): string {
  return markerTitle(marker)
}

function formatSlackDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function deviceLabel(session: ExportManifest['session']): string {
  const os = session.androidVersion === 'Windows' ? 'Windows' : `Android ${session.androidVersion || '-'}`
  return `${session.deviceModel || '-'} / ${os}`
}

function markerThreadInfoText(manifest: ExportManifest): string {
  const lines = [
    `Build: ${manifest.session.buildVersion || '-'}`,
    `Device: ${deviceLabel(manifest.session)}`,
    `Tester: ${manifest.session.tester || '-'} / ${formatSlackDate(new Date(manifest.session.startedAt).getTime())}`,
  ]
  if (manifest.session.ramTotalGb != null) lines.push(`RAM: ${manifest.session.ramTotalGb.toFixed(1)}G`)
  if (manifest.session.graphicsDevice) lines.push(`Graphic Device: ${manifest.session.graphicsDevice}`)
  return lines.join('\n')
}

export async function publishManifestToSlack(args: {
  manifest: ExportManifest
  manifestPaths: ManifestPaths
  settings: SlackPublishSettings
  fetchImpl?: SlackPublisherFetch
}): Promise<SlackPublishResult> {
  validateSettings(args.settings)
  const fetchImpl = args.fetchImpl ?? fetch
  const botToken = args.settings.botToken.trim()
  const channelId = args.settings.channelId.trim()
  const mode = args.manifest.publish.slackThreadMode ?? 'single-thread'
  const uploadErrors: string[] = []
  const markerThreadTs: Record<string, string> = {}

  if (mode === 'single-thread') {
    const rootTs = await postMessage(fetchImpl, botToken, channelId, rootMessageText(args.manifest, args.manifestPaths))
    const reportPdfPath = args.manifest.reportPdfPath ?? args.manifestPaths.reportPdfPath
    if (reportPdfPath) {
      await uploadFileCollectingErrors(uploadErrors, fetchImpl, botToken, channelId, reportPdfPath, rootTs, 'Detailed PDF report')
    }
    for (const marker of args.manifest.markers) {
      await uploadFileCollectingErrors(uploadErrors, fetchImpl, botToken, channelId, marker.videoPath, rootTs, markerMessageText(marker))
    }
    if (uploadErrors.length > 0) {
      await postMessage(fetchImpl, botToken, channelId, `Loupe finished with ${uploadErrors.length} upload error(s):\n${uploadErrors.map(error => `- ${error}`).join('\n')}`, rootTs)
    }
    return { channelId, rootTs, markerThreadTs, mode, uploadErrors }
  } else {
    const reportPdfPath = args.manifest.reportPdfPath ?? args.manifestPaths.reportPdfPath
    const rootTs = await postMessage(fetchImpl, botToken, channelId, rootMessageText(args.manifest, args.manifestPaths))
    if (reportPdfPath) {
      await uploadFileCollectingErrors(uploadErrors, fetchImpl, botToken, channelId, reportPdfPath, rootTs, 'Detailed PDF report')
    }
    for (const marker of args.manifest.markers) {
      const firstErrorIndex = uploadErrors.length
      const markerRootTs = await postMessage(fetchImpl, botToken, channelId, markerMessageText(marker))
      markerThreadTs[marker.id] = markerRootTs
      await postMessage(fetchImpl, botToken, channelId, markerThreadInfoText(args.manifest), markerRootTs)
      await uploadFileCollectingErrors(uploadErrors, fetchImpl, botToken, channelId, marker.videoPath, markerRootTs)
      const markerErrors = uploadErrors.slice(firstErrorIndex)
      if (markerErrors.length > 0) {
        await postMessage(fetchImpl, botToken, channelId, `Loupe finished this marker with upload error(s):\n${markerErrors.map(error => `- ${error}`).join('\n')}`, markerRootTs)
      }
    }
    return { channelId, rootTs, markerThreadTs, mode, uploadErrors }
  }
}
