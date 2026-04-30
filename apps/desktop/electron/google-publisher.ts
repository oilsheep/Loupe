import { basename, dirname, relative, sep } from 'node:path'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import type { GoogleDriveFolder, GooglePublishSettings, GoogleSheetTab, GoogleSpreadsheet, MentionIdentity } from '@shared/types'
import type { ExportManifest } from './export-manifest'

interface ManifestPaths {
  jsonPath: string
  csvPath: string
  reportPdfPath?: string | null
  summaryTextPath?: string | null
}

interface GooglePublisherFetch {
  (input: string, init?: RequestInit): Promise<Response>
}

interface GoogleFileResponse {
  id?: string
  name?: string
  webViewLink?: string
  mimeType?: string
}

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
  error?: string
  error_description?: string
}

interface GoogleFileListResponse {
  files?: GoogleFileResponse[]
  nextPageToken?: string
  error?: { message?: string }
}

interface GoogleSpreadsheetResponse {
  spreadsheetId?: string
  properties?: { title?: string }
  sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>
  error?: { message?: string }
}

interface GoogleSheetCellData {
  userEnteredValue: Record<string, unknown>
  chipRuns?: Array<{
    startIndex?: number
    chip: {
      personProperties: {
        email: string
        displayFormat: 'DEFAULT' | 'LAST_NAME_COMMA_FIRST_NAME' | 'EMAIL'
      }
    }
  }>
}

export interface GooglePublishResult {
  folderId: string
  folderUrl: string | null
  uploadedFiles: Array<{ path: string; id: string; url: string | null }>
  sheetUpdated: boolean
  sheetRowsAppended: number
  warnings: string[]
  uploadErrors: string[]
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SHEET_HEADERS = [
  'Export Created At',
  'Build Version',
  'Device Model',
  'Android Version',
  'Tester',
  'Marker Index',
  'Severity',
  'Note',
  'Marker Time Seconds',
  'Mention Emails',
  'Drive Folder Link',
  'Video Link',
  'Preview Link',
  'Logcat Link',
  'Report PDF Link',
  'Manifest Link',
]

function validateSettings(settings: GooglePublishSettings): void {
  if (!settings.token.trim() && !settings.refreshToken?.trim()) throw new Error('Google OAuth token is missing')
  if (!settings.driveFolderId?.trim()) throw new Error('Google Drive folder is missing')
}

function validateOAuthSettings(settings: GooglePublishSettings): void {
  if (!settings.oauthClientId?.trim()) throw new Error('Google OAuth client ID is missing')
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

function tokenExpired(settings: GooglePublishSettings): boolean {
  return Boolean(settings.tokenExpiresAt && settings.tokenExpiresAt <= Date.now() + 60_000)
}

export async function refreshGoogleAccessToken(settings: GooglePublishSettings, fetchImpl: GooglePublisherFetch = fetch): Promise<GooglePublishSettings> {
  validateOAuthSettings(settings)
  if (!settings.refreshToken?.trim()) {
    if (settings.token.trim()) return settings
    throw new Error('Google refresh token is missing')
  }
  if (settings.token.trim() && !tokenExpired(settings)) return settings

  const body = new URLSearchParams({
    client_id: settings.oauthClientId?.trim() ?? '',
    refresh_token: settings.refreshToken.trim(),
    grant_type: 'refresh_token',
  })
  if (settings.oauthClientSecret?.trim()) body.set('client_secret', settings.oauthClientSecret.trim())
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) as GoogleTokenResponse : {}
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google token refresh failed: ${payload.error_description || payload.error || response.statusText}`)
  }
  return {
    ...settings,
    token: payload.access_token,
    tokenExpiresAt: Date.now() + Math.max(1, payload.expires_in ?? 3600) * 1000,
  }
}

async function googleJson<T>(fetchImpl: GooglePublisherFetch, token: string, input: string, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(input, {
    ...init,
    headers: {
      ...authHeader(token),
      ...(init?.headers ?? {}),
    },
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) as T & { error?: { message?: string } } : {} as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(payload.error?.message || response.statusText)
  return payload
}

export async function listGoogleDriveFolders(settings: GooglePublishSettings, fetchImpl: GooglePublisherFetch = fetch): Promise<GoogleDriveFolder[]> {
  const refreshed = await refreshGoogleAccessToken(settings, fetchImpl)
  const folders: GoogleDriveFolder[] = []
  let pageToken = ''
  do {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'nextPageToken,files(id,name,webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const payload = await googleJson<GoogleFileListResponse>(fetchImpl, refreshed.token, `${DRIVE_API}/files?${params}`)
    for (const file of payload.files ?? []) {
      if (file.id && file.name) folders.push({ id: file.id, name: file.name, webViewLink: file.webViewLink })
    }
    pageToken = payload.nextPageToken ?? ''
  } while (pageToken)
  return folders.sort((a, b) => a.name.localeCompare(b.name))
}

export async function createGoogleDriveFolder(settings: GooglePublishSettings, name: string, fetchImpl: GooglePublisherFetch = fetch): Promise<GoogleDriveFolder> {
  const refreshed = await refreshGoogleAccessToken(settings, fetchImpl)
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Google Drive folder name is missing')
  const payload = await googleJson<GoogleFileResponse>(fetchImpl, refreshed.token, `${DRIVE_API}/files?fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: trimmedName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(settings.driveFolderId ? { parents: [settings.driveFolderId] } : {}),
    }),
  })
  if (!payload.id || !payload.name) throw new Error('Google Drive folder create failed: unexpected response')
  return { id: payload.id, name: payload.name, webViewLink: payload.webViewLink }
}

export async function listGoogleSpreadsheets(settings: GooglePublishSettings, fetchImpl: GooglePublisherFetch = fetch): Promise<GoogleSpreadsheet[]> {
  const refreshed = await refreshGoogleAccessToken(settings, fetchImpl)
  const sheets: GoogleSpreadsheet[] = []
  let pageToken = ''
  do {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: 'nextPageToken,files(id,name,webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const payload = await googleJson<GoogleFileListResponse>(fetchImpl, refreshed.token, `${DRIVE_API}/files?${params}`)
    for (const file of payload.files ?? []) {
      if (file.id && file.name) sheets.push({ id: file.id, name: file.name, webViewLink: file.webViewLink })
    }
    pageToken = payload.nextPageToken ?? ''
  } while (pageToken)
  return sheets.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listGoogleSheetTabs(settings: GooglePublishSettings, fetchImpl: GooglePublisherFetch = fetch): Promise<GoogleSheetTab[]> {
  const refreshed = await refreshGoogleAccessToken(settings, fetchImpl)
  const spreadsheetId = settings.spreadsheetId?.trim()
  if (!spreadsheetId) throw new Error('Google spreadsheet is missing')
  const payload = await googleJson<GoogleSpreadsheetResponse>(fetchImpl, refreshed.token, `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`)
  return (payload.sheets ?? [])
    .map(sheet => sheet.properties)
    .filter((sheet): sheet is { sheetId: number; title: string } => typeof sheet?.sheetId === 'number' && Boolean(sheet.title))
    .map(sheet => ({ sheetId: sheet.sheetId, title: sheet.title }))
}

function mimeTypeForPath(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop()
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'json') return 'application/json'
  if (ext === 'csv') return 'text/csv'
  if (ext === 'txt' || ext === 'log') return 'text/plain'
  return 'application/octet-stream'
}

function exportedFiles(args: { manifest: ExportManifest; manifestPaths: ManifestPaths }): string[] {
  const paths = new Set<string>()
  const add = (path: string | null | undefined) => {
    if (path && existsSync(path) && statSync(path).isFile()) paths.add(path)
  }
  add(args.manifestPaths.jsonPath)
  add(args.manifestPaths.csvPath)
  add(args.manifest.reportPdfPath ?? args.manifestPaths.reportPdfPath)
  add(args.manifestPaths.summaryTextPath)
  for (const marker of args.manifest.markers) {
    add(marker.videoPath)
    add(marker.previewPath)
    add(marker.logcatPath)
  }
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      const path = `${dir}${sep}${entry}`
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else if (stat.isFile()) add(path)
    }
  }
  walk(args.manifest.exportDir)
  return [...paths].sort()
}

function sessionFolderName(manifest: ExportManifest): string {
  const build = manifest.session.buildVersion.trim() || manifest.session.id
  const stamp = manifest.createdAt.replace(/[:T]/g, '-').slice(0, 16)
  return `Loupe QA - ${build} - ${stamp}`
}

async function createChildFolder(fetchImpl: GooglePublisherFetch, token: string, parentId: string, name: string): Promise<GoogleDriveFolder> {
  const payload = await googleJson<GoogleFileResponse>(fetchImpl, token, `${DRIVE_API}/files?fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  if (!payload.id || !payload.name) throw new Error(`Google Drive create folder failed for ${name}`)
  return { id: payload.id, name: payload.name, webViewLink: payload.webViewLink }
}

async function uploadFile(fetchImpl: GooglePublisherFetch, token: string, parentId: string, filePath: string, displayName: string): Promise<{ id: string; url: string | null }> {
  const bytes = readFileSync(filePath)
  const mimeType = mimeTypeForPath(filePath)
  const start = await fetchImpl(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(bytes.byteLength),
    },
    body: JSON.stringify({ name: displayName, parents: [parentId] }),
  })
  if (!start.ok) throw new Error(`Google Drive upload session failed: ${await start.text() || start.statusText}`)
  const location = start.headers.get('location')
  if (!location) throw new Error('Google Drive upload session failed: missing upload URL')
  const finish = await fetchImpl(location, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(bytes.byteLength),
    },
    body: new Blob([bytes]),
  })
  const text = await finish.text()
  const payload = text ? JSON.parse(text) as GoogleFileResponse & { error?: { message?: string } } : {}
  if (!finish.ok || !payload.id) throw new Error(payload.error?.message || finish.statusText)
  return { id: payload.id, url: payload.webViewLink ?? null }
}

async function ensureDriveParentFolder(args: {
  fetchImpl: GooglePublisherFetch
  token: string
  rootFolderId: string
  folderIds: Map<string, string>
  relPath: string
}): Promise<string> {
  const dir = dirname(args.relPath)
  if (!dir || dir === '.') return args.rootFolderId
  const parts = dir.split(/[\\/]+/).filter(Boolean)
  let currentKey = ''
  let parentId = args.rootFolderId
  for (const part of parts) {
    currentKey = currentKey ? `${currentKey}/${part}` : part
    const cached = args.folderIds.get(currentKey)
    if (cached) {
      parentId = cached
      continue
    }
    const folder = await createChildFolder(args.fetchImpl, args.token, parentId, part)
    args.folderIds.set(currentKey, folder.id)
    parentId = folder.id
  }
  return parentId
}

function markerLinkMap(manifest: ExportManifest, uploaded: Array<{ path: string; id: string; url: string | null }>): Map<string, { video?: string; preview?: string; logcat?: string }> {
  const byPath = new Map(uploaded.map(file => [file.path, file.url ?? `https://drive.google.com/file/d/${file.id}/view`]))
  const byMarker = new Map<string, { video?: string; preview?: string; logcat?: string }>()
  for (const marker of manifest.markers) {
    byMarker.set(marker.id, {
      video: byPath.get(marker.videoPath),
      preview: byPath.get(marker.previewPath),
      logcat: marker.logcatPath ? byPath.get(marker.logcatPath) : undefined,
    })
  }
  return byMarker
}

function mentionEmails(marker: ExportManifest['markers'][number], identities: MentionIdentity[], warnings: string[]): string[] {
  const byId = new Map(identities.map(identity => [identity.id, identity]))
  const emails: string[] = []
  for (const id of marker.mentionUserIds) {
    const identity = byId.get(id)
    const email = identity?.googleEmail || identity?.email
    if (email) emails.push(email)
    else warnings.push(`Marker ${marker.id}: mention ${id} has no Google/email mapping`)
  }
  return Array.from(new Set(emails))
}

function peopleChipCell(emails: string[]): GoogleSheetCellData {
  if (emails.length === 0) return { userEnteredValue: { stringValue: '' } }
  const pieces = emails.map(() => '@')
  const text = pieces.join(', ')
  let cursor = 0
  const chipRuns = emails.map(email => {
    const startIndex = cursor
    cursor += 3
    return {
      startIndex,
      chip: {
        personProperties: {
          email,
          displayFormat: 'DEFAULT' as const,
        },
      },
    }
  })
  return {
    userEnteredValue: { stringValue: text },
    chipRuns,
  }
}

function sheetRows(manifest: ExportManifest, identities: MentionIdentity[], folderUrl: string | null, uploaded: Array<{ path: string; id: string; url: string | null }>, warnings: string[]): GoogleSheetCellData[][] {
  const links = markerLinkMap(manifest, uploaded)
  const report = uploaded.find(file => file.path === manifest.reportPdfPath)?.url ?? ''
  const manifestFile = uploaded.find(file => file.path.endsWith('export-manifest.json'))?.url ?? ''
  return manifest.markers.map((marker, index) => {
    const markerLinks = links.get(marker.id) ?? {}
    return [
      cellData(manifest.createdAt),
      cellData(manifest.session.buildVersion),
      cellData(manifest.session.deviceModel),
      cellData(manifest.session.androidVersion),
      cellData(manifest.session.tester),
      cellData(index + 1),
      cellData(marker.severityLabel || marker.severity),
      cellData(marker.note),
      cellData(Math.round(marker.offsetMs / 1000)),
      peopleChipCell(mentionEmails(marker, identities, warnings)),
      cellData(folderUrl ?? ''),
      cellData(markerLinks.video ?? ''),
      cellData(markerLinks.preview ?? ''),
      cellData(markerLinks.logcat ?? ''),
      cellData(report),
      cellData(manifestFile),
    ]
  })
}

async function appendSheetRows(fetchImpl: GooglePublisherFetch, token: string, settings: GooglePublishSettings, rows: GoogleSheetCellData[][]): Promise<void> {
  const spreadsheetId = settings.spreadsheetId?.trim()
  const sheetName = settings.sheetName?.trim()
  if (!spreadsheetId) throw new Error('Google spreadsheet is missing')
  if (!sheetName) throw new Error('Google sheet tab is missing')
  const sheetId = await sheetIdForTitle(fetchImpl, token, spreadsheetId, sheetName)
  await ensureSheetHeaders(fetchImpl, token, spreadsheetId, sheetName, sheetId)
  const nextRow = await nextSheetRow(fetchImpl, token, spreadsheetId, sheetName)
  await updateSheetCells(fetchImpl, token, spreadsheetId, sheetId, nextRow, rows)
}

async function ensureSheetHeaders(fetchImpl: GooglePublisherFetch, token: string, spreadsheetId: string, sheetName: string, sheetId: number): Promise<void> {
  const headerRange = `${sheetName.replace(/'/g, "''")}!A1:P1`
  const current = await googleJson<{ values?: unknown[][] }>(fetchImpl, token, `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(headerRange)}`)
  const firstRow = current.values?.[0] ?? []
  const hasLoupeHeaders = SHEET_HEADERS.every((header, index) => String(firstRow[index] ?? '').trim() === header)
  if (hasLoupeHeaders) return
  if (firstRow.some(value => String(value ?? '').trim())) {
    await googleJson(fetchImpl, token, `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          insertDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
            inheritFromBefore: false,
          },
        }],
      }),
    })
  }
  await updateSheetCells(fetchImpl, token, spreadsheetId, sheetId, 1, [SHEET_HEADERS.map(cellData)])
}

async function nextSheetRow(fetchImpl: GooglePublisherFetch, token: string, spreadsheetId: string, sheetName: string): Promise<number> {
  const range = `${sheetName.replace(/'/g, "''")}!A:P`
  const current = await googleJson<{ values?: unknown[][] }>(fetchImpl, token, `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`)
  const values = current.values ?? []
  for (let index = values.length - 1; index >= 0; index--) {
    if ((values[index] ?? []).some(value => String(value ?? '').trim())) return index + 2
  }
  return 1
}

async function sheetIdForTitle(fetchImpl: GooglePublisherFetch, token: string, spreadsheetId: string, sheetName: string): Promise<number> {
  const payload = await googleJson<GoogleSpreadsheetResponse>(fetchImpl, token, `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`)
  const tabs = (payload.sheets ?? [])
    .map(sheet => sheet.properties)
    .filter((sheet): sheet is { sheetId: number; title: string } => typeof sheet?.sheetId === 'number' && Boolean(sheet.title))
  const tab = tabs.find(item => item.title === sheetName)
  if (!tab) throw new Error(`Google sheet tab not found: ${sheetName}`)
  return tab.sheetId
}

function cellValue(value: unknown): Record<string, unknown> {
  if (typeof value === 'number' && Number.isFinite(value)) return { numberValue: value }
  if (typeof value === 'boolean') return { boolValue: value }
  return { stringValue: value == null ? '' : String(value) }
}

function cellData(value: unknown): GoogleSheetCellData {
  return { userEnteredValue: cellValue(value) }
}

async function updateSheetCells(fetchImpl: GooglePublisherFetch, token: string, spreadsheetId: string, sheetId: number, startRow: number, rows: GoogleSheetCellData[][]): Promise<void> {
  await googleJson(fetchImpl, token, `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        updateCells: {
          start: {
            sheetId,
            rowIndex: Math.max(0, startRow - 1),
            columnIndex: 0,
          },
          rows: rows.map(row => ({
            values: row,
          })),
          fields: 'userEnteredValue,chipRuns',
        },
      }],
    }),
  })
}

export async function publishManifestToGoogleDrive(args: {
  manifest: ExportManifest
  manifestPaths: ManifestPaths
  settings: GooglePublishSettings
  mentionIdentities?: MentionIdentity[]
  fetchImpl?: GooglePublisherFetch
}): Promise<GooglePublishResult> {
  validateSettings(args.settings)
  const fetchImpl = args.fetchImpl ?? fetch
  const settings = await refreshGoogleAccessToken(args.settings, fetchImpl)
  const token = settings.token
  const uploadErrors: string[] = []
  const warnings: string[] = []
  const rootFolder = await createChildFolder(fetchImpl, token, settings.driveFolderId!.trim(), sessionFolderName(args.manifest))
  const uploadedFiles: Array<{ path: string; id: string; url: string | null }> = []
  const folderIds = new Map<string, string>()
  for (const filePath of exportedFiles(args)) {
    try {
      const rel = relative(args.manifest.exportDir, filePath)
      const isInsideExport = rel && !rel.startsWith('..') && rel !== filePath
      const parentId = isInsideExport
        ? await ensureDriveParentFolder({ fetchImpl, token, rootFolderId: rootFolder.id, folderIds, relPath: rel })
        : rootFolder.id
      const uploaded = await uploadFile(fetchImpl, token, parentId, filePath, basename(filePath))
      uploadedFiles.push({ path: filePath, ...uploaded })
    } catch (err) {
      uploadErrors.push(`${basename(filePath)}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  let sheetUpdated = false
  let sheetRowsAppended = 0
  if (settings.updateSheet) {
    const rows = sheetRows(args.manifest, args.mentionIdentities ?? [], rootFolder.webViewLink ?? null, uploadedFiles, warnings)
    await appendSheetRows(fetchImpl, token, settings, rows)
    sheetUpdated = true
    sheetRowsAppended = rows.length
  }

  const planPath = `${args.manifest.exportDir}${sep}google-drive-publish-plan.json`
  writeFileSync(planPath, `${JSON.stringify({
    version: 1,
    folderId: rootFolder.id,
    folderUrl: rootFolder.webViewLink ?? null,
    uploadedFiles,
    sheetUpdated,
    sheetRowsAppended,
    warnings,
    uploadErrors,
  }, null, 2)}\n`, 'utf8')

  return {
    folderId: rootFolder.id,
    folderUrl: rootFolder.webViewLink ?? null,
    uploadedFiles,
    sheetUpdated,
    sheetRowsAppended,
    warnings,
    uploadErrors,
  }
}
