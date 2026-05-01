import { ipcMain, BrowserWindow, clipboard, desktopCapturer, dialog, screen, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Writable, Readable } from 'node:stream'
import { assertVideoInputReadable, clampClipWindow, extractClip, extractClipWithIntro, extractContactSheet, resolveBundledFfmpegPath } from './ffmpeg'
import type { Adb } from './adb'
import type { SessionManager } from './session'
import type { Paths } from './paths'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { ToolCheck } from './doctor'
import type { AppLocale, Bug, ExportProgress, ExportedMarkerFile, ExportPublishOptions, GitLabPublishSettings, GooglePublishSettings, HotkeySettings, MentionIdentity, PcCaptureSource, Session, SessionLoadProgress, SeveritySettings, SlackPublishSettings, ToolInstallLog } from '@shared/types'
import { doctor, installTools } from './doctor'
import { writeExportManifests } from './export-manifest'
import { fetchSlackChannels, fetchSlackMentionUsers } from './slack-publisher'
import { buildSlackUserOAuthUrl, createSlackPkce, exchangeSlackOAuthCode, parseSlackOAuthCallback } from './slack-oauth'
import { publishManifestToRemote } from './remote-publisher'
import { fetchGitLabMentionUsersWithEmailLookup, fetchGitLabProjects } from './gitlab-publisher'
import { createGoogleDriveFolder, listGoogleDriveFolders, listGoogleSheetTabs, listGoogleSpreadsheets, refreshGoogleAccessToken } from './google-publisher'
import { readProjectFile, writeProjectFile } from './project-file'
import type { SettingsStore } from './settings'
import { formatTelemetryLine, nearestTelemetrySample, readTelemetrySamples } from './telemetry'
import { UxPlayReceiver, type UxPlayReceiverStatus } from './uxplay'

export const CHANNEL = {
  doctor:                  'app:doctor',
  showItemInFolder:        'app:showItemInFolder',
  openPath:                'app:openPath',
  appGetPlatform:          'app:getPlatform',
  appOpenIphoneMirroring:  'app:openIphoneMirroring',
  appStartUxPlayReceiver: 'app:startUxPlayReceiver',
  appStopUxPlayReceiver:  'app:stopUxPlayReceiver',
  appGetUxPlayReceiver:   'app:getUxPlayReceiver',
  appInstallTools:        'app:installTools',
  appInstallToolsLog:     'app:installToolsLog',
  getPrimaryScreenSource:  'app:getPrimaryScreenSource',
  listPcCaptureSources:   'app:listPcCaptureSources',
  showPcCaptureFrame:     'app:showPcCaptureFrame',
  hidePcCaptureFrame:     'app:hidePcCaptureFrame',
  readClipboardText:      'app:readClipboardText',
  deviceList:              'device:list',
  deviceConnect:           'device:connect',
  deviceMdnsScan:          'device:mdnsScan',
  devicePair:              'device:pair',
  deviceGetUserName:       'device:getUserName',
  deviceListPackages:      'device:listPackages',
  sessionStart:            'session:start',
  sessionMarkBug:          'session:markBug',
  sessionStop:             'session:stop',
  sessionDiscard:          'session:discard',
  sessionList:             'session:list',
  sessionGet:              'session:get',
  sessionLoadProgress:     'session:loadProgress',
  sessionOpenProject:      'session:openProject',
  sessionUpdateMetadata:   'session:updateMetadata',
  sessionSavePcRecording:  'session:savePcRecording',
  sessionSaveMicRecording: 'session:saveMicRecording',
  sessionResolveAssetPath: 'session:resolveAssetPath',
  bugUpdate:               'bug:update',
  bugAddMarker:            'bug:addMarker',
  bugGetLogcatPreview:     'bug:getLogcatPreview',
  bugDelete:               'bug:delete',
  bugExportClip:           'bug:exportClip',
  bugExportClips:          'bug:exportClips',
  bugExportProgress:       'bug:exportProgress',
  bugExportCancel:         'bug:exportCancel',
  bugSaveAudio:            'bug:saveAudio',
  bugMarkRequested:        'bug:markRequested',
  sessionInterrupted:      'session:interrupted',
  hotkeySetEnabled:        'hotkey:setEnabled',
  settingsGet:             'settings:get',
  settingsSetExportRoot:   'settings:setExportRoot',
  settingsSetHotkeys:      'settings:setHotkeys',
  settingsSetSlack:        'settings:setSlack',
  settingsSetGitLab:       'settings:setGitLab',
  settingsConnectGitLabOAuth:'settings:connectGitLabOAuth',
  settingsCancelGitLabOAuth:'settings:cancelGitLabOAuth',
  settingsListGitLabProjects:'settings:listGitLabProjects',
  settingsSetGoogle:       'settings:setGoogle',
  settingsConnectGoogleOAuth:'settings:connectGoogleOAuth',
  settingsCancelGoogleOAuth:'settings:cancelGoogleOAuth',
  settingsListGoogleDriveFolders:'settings:listGoogleDriveFolders',
  settingsCreateGoogleDriveFolder:'settings:createGoogleDriveFolder',
  settingsListGoogleSpreadsheets:'settings:listGoogleSpreadsheets',
  settingsListGoogleSheetTabs:'settings:listGoogleSheetTabs',
  settingsSetMentionIdentities:'settings:setMentionIdentities',
  settingsImportMentionIdentities:'settings:importMentionIdentities',
  settingsExportMentionIdentities:'settings:exportMentionIdentities',
  settingsRefreshSlackUsers:'settings:refreshSlackUsers',
  settingsRefreshSlackChannels:'settings:refreshSlackChannels',
  settingsStartSlackUserOAuth:'settings:startSlackUserOAuth',
  settingsSlackOAuthCompleted:'settings:slackOAuthCompleted',
  settingsRefreshGitLabUsers:'settings:refreshGitLabUsers',
  settingsSetLocale:       'settings:setLocale',
  settingsSetSeverities:   'settings:setSeverities',
  settingsChooseExportRoot:'settings:chooseExportRoot',
} as const

let pcCaptureFrame: BrowserWindow | null = null
let pcCaptureFrameToken = 0
let pcCaptureFrameTimer: NodeJS.Timeout | null = null
let pcRecordingProcess: ChildProcessByStdio<Writable, null, Readable> | null = null
let pcRecordingStderr = ''
const exportControllers = new Map<string, AbortController>()
let pendingSlackOAuth: { state: string; codeVerifier: string; createdAt: number } | null = null
let slackOAuthCallbackHandler: ((url: string) => Promise<void>) | null = null
let gitlabOAuthCancel: (() => void) | null = null
let gitlabOAuthCallbackHandler: ((url: string) => void) | null = null
let googleOAuthCancel: (() => void) | null = null
let uxPlayReceiver: UxPlayReceiver | null = null

const DEFAULT_GITLAB_OAUTH_REDIRECT_URI = 'loupe://gitlab-oauth'
const DEFAULT_GOOGLE_OAUTH_REDIRECT_URI = 'http://127.0.0.1:38988/oauth/google/callback'
const MAC_WINDOW_SCRIPT_TIMEOUT_MS = 3000
const PC_CAPTURE_FRAME_START_TIMEOUT_MS = 3500

export function handleProtocolUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'loupe:') return false
    if (parsed.hostname === 'slack-oauth') {
      if (!slackOAuthCallbackHandler) return false
      void slackOAuthCallbackHandler(url)
      return true
    }
    if (parsed.hostname === 'gitlab-oauth') {
      if (!gitlabOAuthCallbackHandler) return false
      gitlabOAuthCallbackHandler(url)
      return true
    }
  } catch {
    return false
  }
  return false
}

export interface IpcDeps {
  adb: Adb
  manager: SessionManager
  paths: Paths
  runner: IProcessRunner
  db: Db
  settings: SettingsStore
  getWindow: () => BrowserWindow | null
  setHotkeyEnabled: (enabled: boolean) => void
  setHotkeys: (hotkeys: HotkeySettings) => void
}

function sessionVideoInputPath(session: { id: string; videoPath: string | null; pcVideoPath: string | null; connectionMode?: string }, paths: Paths): string {
  if (session.connectionMode === 'pc' && session.pcVideoPath) return session.pcVideoPath
  return session.videoPath ?? paths.videoFile(session.id)
}

function safeFilePart(value: string): string {
  return (value || 'session')
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 80) || 'session'
}

function slackApiTokenForUsers(settings: SlackPublishSettings): string {
  return (settings.publishIdentity === 'user' ? settings.userToken : settings.botToken)?.trim() || settings.botToken.trim() || settings.userToken?.trim() || ''
}

async function refreshSlackDirectory(settings: SlackPublishSettings, token: string): Promise<Partial<SlackPublishSettings>> {
  if (!token.trim()) throw new Error('Slack token is missing')
  const [mentionUsersResult, channelsResult] = await Promise.allSettled([
    fetchSlackMentionUsers(token),
    fetchSlackChannels(token),
  ])
  const now = new Date().toISOString()
  const directory: Partial<SlackPublishSettings> = {}
  if (mentionUsersResult.status === 'fulfilled') {
    directory.mentionUsers = mentionUsersResult.value
    directory.usersFetchedAt = now
  }
  if (channelsResult.status === 'fulfilled') {
    const channels = channelsResult.value
    const channelStillExists = channels.some(channel => channel.id === settings.channelId)
    directory.channels = channels
    directory.channelsFetchedAt = now
    directory.channelId = channelStillExists ? settings.channelId : (settings.channelId || '')
  }
  const errors = [mentionUsersResult, channelsResult]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason))
  if (errors.length === 2) throw new Error(errors.join('; '))
  if (errors.length > 0) console.warn('Loupe: partial Slack directory refresh failed', errors.join('; '))
  return directory
}

async function refreshSlackChannelsOnly(settings: SlackPublishSettings, token: string): Promise<Partial<SlackPublishSettings>> {
  if (!token.trim()) throw new Error('Slack token is missing')
  const channels = await fetchSlackChannels(token)
  const now = new Date().toISOString()
  const channelStillExists = channels.some(channel => channel.id === settings.channelId)
  return {
    channels,
    channelsFetchedAt: now,
    channelId: channelStillExists ? settings.channelId : (settings.channelId || ''),
  }
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function connectGitLabOAuth(settings: GitLabPublishSettings): Promise<string> {
  gitlabOAuthCancel?.()
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, '')
  const clientId = settings.oauthClientId?.trim() || ''
  const clientSecret = settings.oauthClientSecret?.trim() || ''
  const redirectUri = DEFAULT_GITLAB_OAUTH_REDIRECT_URI
  if (!baseUrl) throw new Error('GitLab base URL is missing')
  if (!clientId) throw new Error('GitLab OAuth client ID is missing')

  const redirect = new URL(redirectUri)
  if (redirect.protocol !== 'loupe:' || redirect.hostname !== 'gitlab-oauth') {
    throw new Error('GitLab OAuth redirect URI must be loupe://gitlab-oauth')
  }
  const state = base64Url(randomBytes(24))
  const verifier = base64Url(randomBytes(48))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())

  const code = await new Promise<string>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      gitlabOAuthCancel = null
      gitlabOAuthCallbackHandler = null
      fn()
    }
    const timeout = setTimeout(() => {
      finish(() => reject(new Error('GitLab OAuth timed out')))
    }, 30000)
    timeout.unref?.()
    gitlabOAuthCallbackHandler = (callbackUrl) => {
      try {
        const url = new URL(callbackUrl)
        if (url.protocol !== redirect.protocol || url.hostname !== redirect.hostname) return
        const error = url.searchParams.get('error')
        if (error) throw new Error(url.searchParams.get('error_description') || error)
        if (url.searchParams.get('state') !== state) throw new Error('GitLab OAuth state mismatch')
        const receivedCode = url.searchParams.get('code')
        if (!receivedCode) throw new Error('GitLab OAuth code is missing')
        finish(() => resolve(receivedCode))
      } catch (err) {
        finish(() => reject(err))
      }
    }
    gitlabOAuthCancel = () => finish(() => reject(new Error('GitLab OAuth cancelled')))
    const authorize = new URL(`${baseUrl}/oauth/authorize`)
    authorize.searchParams.set('client_id', clientId)
    authorize.searchParams.set('redirect_uri', redirectUri)
    authorize.searchParams.set('response_type', 'code')
    authorize.searchParams.set('scope', 'api')
    authorize.searchParams.set('state', state)
    authorize.searchParams.set('code_challenge', challenge)
    authorize.searchParams.set('code_challenge_method', 'S256')
    void shell.openExternal(authorize.toString())
  })

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })
  if (clientSecret) body.set('client_secret', clientSecret)
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) as { access_token?: string; error?: string; error_description?: string } : {}
  if (!response.ok || !payload.access_token) {
    const reason = payload.error_description || payload.error || response.statusText
    const hint = /client authentication|unknown client|invalid_client/i.test(reason)
      ? ' Check Application ID, Redirect URI, and whether the GitLab application is confidential. If it is confidential, fill OAuth client secret; otherwise create a non-confidential application.'
      : ''
    throw new Error(`GitLab OAuth token exchange failed: ${reason}${hint}`)
  }
  return payload.access_token
}

async function connectGoogleOAuth(settings: GooglePublishSettings): Promise<GooglePublishSettings> {
  googleOAuthCancel?.()
  const clientId = settings.oauthClientId?.trim() || ''
  const clientSecret = settings.oauthClientSecret?.trim() || ''
  const redirectUri = DEFAULT_GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId) throw new Error('Google OAuth client ID is missing')

  const redirect = new URL(redirectUri)
  if (redirect.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(redirect.hostname)) {
    throw new Error('Google OAuth redirect URI must be a localhost HTTP URL')
  }
  const port = Number(redirect.port || 80)
  const state = base64Url(randomBytes(24))
  const verifier = base64Url(randomBytes(48))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())

  const code = await new Promise<string>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      googleOAuthCancel = null
      server.close()
      fn()
    }
    const timeout = setTimeout(() => {
      finish(() => reject(new Error('Google OAuth timed out')))
    }, 60_000)
    timeout.unref?.()
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', redirect.origin)
        if (url.pathname !== redirect.pathname) {
          res.writeHead(404).end('Not found')
          return
        }
        const error = url.searchParams.get('error')
        if (error) throw new Error(url.searchParams.get('error_description') || error)
        if (url.searchParams.get('state') !== state) throw new Error('Google OAuth state mismatch')
        const receivedCode = url.searchParams.get('code')
        if (!receivedCode) throw new Error('Google OAuth code is missing')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<!doctype html><meta charset="utf-8"><title>Loupe</title><p>Google OAuth connected. You can return to Loupe.</p>')
        finish(() => resolve(receivedCode))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(err instanceof Error ? err.message : String(err))
        finish(() => reject(err))
      }
    })
    server.on('error', error => finish(() => reject(error)))
    server.listen(port, redirect.hostname, () => {
      googleOAuthCancel = () => finish(() => reject(new Error('Google OAuth cancelled')))
      const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authorize.searchParams.set('client_id', clientId)
      authorize.searchParams.set('redirect_uri', redirectUri)
      authorize.searchParams.set('response_type', 'code')
      authorize.searchParams.set('scope', [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
        'https://www.googleapis.com/auth/spreadsheets',
      ].join(' '))
      authorize.searchParams.set('access_type', 'offline')
      authorize.searchParams.set('prompt', 'consent')
      authorize.searchParams.set('state', state)
      authorize.searchParams.set('code_challenge', challenge)
      authorize.searchParams.set('code_challenge_method', 'S256')
      void shell.openExternal(authorize.toString())
    })
  })

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })
  if (clientSecret) body.set('client_secret', clientSecret)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string } : {}
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google OAuth token exchange failed: ${payload.error_description || payload.error || response.statusText}`)
  }

  const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${payload.access_token}` },
  })
  const userInfoText = await userInfoResponse.text()
  const userInfo = userInfoText ? JSON.parse(userInfoText) as { email?: string } : {}
  return {
    ...settings,
    token: payload.access_token,
    refreshToken: payload.refresh_token || settings.refreshToken,
    tokenExpiresAt: Date.now() + Math.max(1, payload.expires_in ?? 3600) * 1000,
    accountEmail: userInfo.email?.trim().toLowerCase() || settings.accountEmail,
  }
}

function exportDirForSession(root: string, session: Session): string {
  const d = new Date(session.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`
  return join(root, `${safeFilePart(session.buildVersion)} - ${stamp}`)
}

function exportRecordsDir(outDir: string): string {
  return join(outDir, 'records')
}

function exportReportDir(outDir: string): string {
  return join(outDir, 'report')
}

function exportOriginalsDir(outDir: string): string {
  return join(outDir, 'originals')
}

function copyOriginalRecordingFile(outDir: string, sourcePath: string | null | undefined, targetStem: string): string | null {
  if (!sourcePath || !existsSync(sourcePath)) return null
  const originalsDir = exportOriginalsDir(outDir)
  mkdirSync(originalsDir, { recursive: true })
  const ext = extname(sourcePath) || extname(basename(sourcePath)) || ''
  const outputPath = join(originalsDir, `${targetStem}${ext}`)
  copyFileSync(sourcePath, outputPath)
  return outputPath
}

function copyRecordingFileToDir(targetDir: string, sourcePath: string | null | undefined, targetStem: string): string | null {
  if (!sourcePath || !existsSync(sourcePath)) return null
  mkdirSync(targetDir, { recursive: true })
  const ext = extname(sourcePath) || extname(basename(sourcePath)) || ''
  const outputPath = join(targetDir, `${targetStem}${ext}`)
  copyFileSync(sourcePath, outputPath)
  return outputPath
}

async function mergeOriginalRecordingAudio(runner: IProcessRunner, ffmpegPath: string, videoPath: string, micAudioPath: string, outputPath: string): Promise<void> {
  const sourceHasAudio = await getVideoHasAudio(runner, videoPath)
  const audioArgs = sourceHasAudio
    ? [
        '-filter_complex', '[0:a:0][1:a:0]amix=inputs=2:duration=first:dropout_transition=0[a]',
        '-map', '[a]',
      ]
    : [
        '-map', '1:a:0',
      ]
  const result = await runner.run(ffmpegPath, [
    '-y',
    '-i', videoPath,
    '-i', micAudioPath,
    '-map', '0:v:0',
    ...audioArgs,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    outputPath,
  ])
  if (result.code !== 0) throw new Error(result.stderr || `ffmpeg failed while merging original audio into ${outputPath}`)
}

async function exportOriginalRecordingFiles(args: { outDir: string; session: Session; paths: Paths; runner: IProcessRunner; mergeAudio?: boolean }): Promise<string[]> {
  const { outDir, session, paths } = args
  const videoPath = sessionVideoInputPath(session, paths)
  const originalsDir = exportOriginalsDir(outDir)
  if (args.mergeAudio && session.micAudioPath && existsSync(videoPath) && existsSync(session.micAudioPath)) {
    mkdirSync(originalsDir, { recursive: true })
    const mergedPath = join(originalsDir, 'original-video-with-mic.mp4')
    await mergeOriginalRecordingAudio(args.runner, resolveBundledFfmpegPath(), videoPath, session.micAudioPath, mergedPath)
    return [mergedPath]
  }
  return [
    copyOriginalRecordingFile(outDir, videoPath, 'original-video'),
    copyOriginalRecordingFile(outDir, session.micAudioPath, 'session-mic'),
  ].filter(Boolean) as string[]
}

function exportFullRecordingFilesToRecords(args: { recordsDir: string; session: Session; paths: Paths }): string[] {
  const videoPath = sessionVideoInputPath(args.session, args.paths)
  const outputs = [
    copyRecordingFileToDir(args.recordsDir, videoPath, 'full-recording'),
    copyRecordingFileToDir(args.recordsDir, args.session.micAudioPath, 'session-mic'),
  ].filter(Boolean) as string[]
  if (outputs.length === 0) throw new Error('No full recording files were found for this session.')
  return outputs
}

function localDatePart(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

function exportBaseName(session: Session, bug: { id: string; note: string; createdAt: number }): string {
  const note = safeFilePart(bug.note || 'marker')
  const build = safeFilePart(session.buildVersion || 'build')
  return `${note}_${build}_${localDatePart(bug.createdAt)}_${bug.id.slice(0, 8)}`
}

function exportLogcatSidecar(paths: Paths, session: Session, bug: { id: string; logcatRel: string | null }, outDir: string, baseName: string): string | null {
  if (!bug.logcatRel) return null
  const sourcePath = join(paths.sessionDir(session.id), bug.logcatRel)
  if (!existsSync(sourcePath)) return null
  const outputPath = join(outDir, `${baseName}.logcat.txt`)
  copyFileSync(sourcePath, outputPath)
  return outputPath
}

function readLogcatTailForContactSheet(paths: Paths, session: Session, bug: { logcatRel: string | null }, maxLines = 12): string | null {
  if (!bug.logcatRel) return null
  const sourcePath = join(paths.sessionDir(session.id), bug.logcatRel)
  if (!existsSync(sourcePath)) return null
  const lines = readFileSync(sourcePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return null
  return lines.slice(-maxLines).join('\n')
}

async function exportBugEvidence(args: {
  deps: IpcDeps
  session: Session
  bug: Bug
  outDir: string
  baseName: string
  includeLogcat?: boolean
  includeMicTrack?: boolean
}): Promise<ExportedMarkerFile> {
  const outputPath = join(args.outDir, `${args.baseName}.mp4`)
  const imagePath = join(args.outDir, `${args.baseName}.jpg`)
  const { startMs, endMs } = clampClipWindow({ ...args.bug, durationMs: args.session.durationMs })
  const ffmpegPath = resolveBundledFfmpegPath()
  const clicks = readClickLog(args.deps.paths.clicksFile(args.session.id))
  const inputPath = sessionVideoInputPath(args.session, args.deps.paths)
  await assertVideoInputReadable(args.deps.runner, ffmpegPath, { inputPath })
  const tileSize = await contactSheetTileSize(args.deps.runner, inputPath)
  const clipOptions = {
    inputPath,
    outputPath,
    startMs,
    endMs,
    narrationPath: !args.includeMicTrack && args.bug.audioRel ? join(args.deps.paths.sessionDir(args.session.id), args.bug.audioRel) : null,
    narrationDurationMs: !args.includeMicTrack ? args.bug.audioDurationMs : null,
    sessionMicPath: args.includeMicTrack ? args.session.micAudioPath : null,
    severity: args.bug.severity,
    note: args.bug.note,
    markerMs: args.bug.offsetMs,
    deviceModel: args.session.deviceModel,
    buildVersion: args.session.buildVersion,
    androidVersion: args.session.androidVersion,
    testNote: args.session.testNote,
    tester: args.session.tester,
    testedAtMs: args.bug.createdAt,
    clicks,
  }
  await extractClip(args.deps.runner, ffmpegPath, clipOptions)
  await extractContactSheet(args.deps.runner, ffmpegPath, { ...clipOptions, ...tileSize, outputPath: imagePath })
  const logcatPath = args.includeLogcat
    ? exportLogcatSidecar(args.deps.paths, args.session, args.bug, args.outDir, args.baseName)
    : null
  return {
    bugId: args.bug.id,
    videoPath: outputPath,
    previewPath: imagePath,
    logcatPath,
  }
}

function readClickLog(filePath: string): { t: number; x: number; y: number }[] {
  if (!existsSync(filePath)) return []
  const clicks: { t: number; x: number; y: number }[] = []
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const raw = JSON.parse(trimmed) as { t?: unknown; x?: unknown; y?: unknown }
      if (typeof raw.t === 'number' && typeof raw.x === 'number' && typeof raw.y === 'number') {
        clicks.push({ t: raw.t, x: raw.x, y: raw.y })
      }
    } catch {
      // Ignore partial lines if the click recorder was stopped while writing.
    }
  }
  return clicks
}

function dockRecordingPanel(win: BrowserWindow | null): void {
  if (!win) return
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const width = Math.min(460, Math.max(380, area.width))
  win.setBounds({
    x: area.x + area.width - width,
    y: area.y,
    width,
    height: area.height,
  })
}

function restoreReviewWindow(win: BrowserWindow | null): void {
  if (!win) return
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const width = Math.min(1280, area.width)
  const height = Math.min(820, area.height)
  win.setBounds({
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  })
}

async function getVideoSize(runner: IProcessRunner, inputPath: string): Promise<{ width: number; height: number } | null> {
  const ffmpegPath = resolveBundledFfmpegPath()
  const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
  const r = await runner.run(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=s=x:p=0',
    inputPath,
  ]).catch(() => null)
  if (r && r.code === 0) {
    const [w, h] = r.stdout.trim().split('x').map(Number)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h }
  }

  const info = await runner.run(ffmpegPath, ['-hide_banner', '-i', inputPath]).catch(() => null)
  const text = `${info?.stdout ?? ''}\n${info?.stderr ?? ''}`
  const matches = [...text.matchAll(/Video:.*?(\d{2,5})x(\d{2,5})/g)]
  const last = matches.at(-1)
  if (!last) return null
  const width = Number(last[1])
  const height = Number(last[2])
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null
}

async function contactSheetTileSize(runner: IProcessRunner, inputPath: string): Promise<{ tileWidth: number; tileHeight: number | null; outputWidth?: number; outputHeight?: number }> {
  const size = await getVideoSize(runner, inputPath)
  if (size) {
    const outputWidth = even(size.width)
    const outputHeight = even(size.height)
    const tileWidth = even(Math.max(2, Math.floor(outputWidth / 3)))
    const tileHeight = even(Math.max(2, Math.floor(outputHeight / 3)))
    return { tileWidth, tileHeight, outputWidth, outputHeight }
  }
  return { tileWidth: 240, tileHeight: 426, outputWidth: 720, outputHeight: 1280 }
}

async function getVideoHasAudio(runner: IProcessRunner, inputPath: string): Promise<boolean> {
  const ffmpegPath = resolveBundledFfmpegPath()
  const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
  const r = await runner.run(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=index',
    '-of', 'csv=p=0',
    inputPath,
  ]).catch(() => null)
  if (r && r.code === 0) return r.stdout.trim().length > 0

  const info = await runner.run(ffmpegPath, ['-hide_banner', '-i', inputPath]).catch(() => null)
  const text = `${info?.stdout ?? ''}\n${info?.stderr ?? ''}`
  return /Stream #\d+:\d+.*Audio:/i.test(text)
}

function telemetryLineForMarker(paths: Paths, sessionId: string, offsetMs: number): string | null {
  const samples = readTelemetrySamples(paths.telemetryFile(sessionId))
  return formatTelemetryLine(nearestTelemetrySample(samples, offsetMs))
}

interface ReportEntry {
  index: number
  bug: Bug
  imagePath: string
  videoPath: string
  clipStartMs: number
  clipEndMs: number
  severityLabel: string
  severityColor: string
  telemetryLine: string | null
}

function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatReportDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatReportTime(msValue: number): string {
  const totalSeconds = Math.max(0, Math.round(msValue / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function colorText(hex: string): string {
  const value = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '888888'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? '#111111' : '#ffffff'
}

function reportPdfPath(outDir: string, session: Session): string {
  const d = new Date(session.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return join(outDir, `QA_bug_report_${safeFilePart(session.buildVersion || session.deviceModel)}_${date}.pdf`)
}

function reportBasePath(outDir: string, session: Session): string {
  const d = new Date(session.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return join(outDir, `QA_bug_report_${safeFilePart(session.buildVersion || session.deviceModel)}_${date}`)
}

function sortedReportEntries(entries: ReportEntry[]): ReportEntry[] {
  const order: Record<string, number> = { major: 0, normal: 1, minor: 2, improvement: 3, note: 4 }
  return [...entries].sort((a, b) => {
    const ao = order[a.bug.severity] ?? 10
    const bo = order[b.bug.severity] ?? 10
    return ao === bo ? a.index - b.index : ao - bo
  })
}

function groupReportEntries(entries: ReportEntry[]): Map<string, ReportEntry[]> {
  const groups = new Map<string, ReportEntry[]>()
  for (const entry of sortedReportEntries(entries)) {
    const key = entry.bug.severity
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  return groups
}

function normalizedReportTitle(reportTitle?: string | null): string {
  return reportTitle?.trim() || 'Loupe QA Report'
}

function buildSlackSummaryText(session: Session, entries: ReportEntry[], pdfPath: string, reportTitle?: string | null): string {
  const groups = groupReportEntries(entries)
  const counts = [...groups.values()].map(items => `${items[0].severityLabel}: ${items.length}`).join(' / ')
  const majorItems = entries.filter(entry => entry.bug.severity === 'major')
  const focusItems = (majorItems.length > 0 ? majorItems : sortedReportEntries(entries)).slice(0, 8)
  const lines = [
    `*${normalizedReportTitle(reportTitle)}*`,
    `Build: ${session.buildVersion || '-'}`,
    `Device: ${session.deviceModel || '-'} / ${session.androidVersion === 'Windows' ? 'Windows' : `Android ${session.androidVersion || '-'}`}`,
    `Tester: ${session.tester || '-'} / ${formatReportDate(session.startedAt)}`,
    session.testNote ? `Test note: ${session.testNote}` : '',
    `Markers: ${entries.length}${counts ? ` (${counts})` : ''}`,
    '',
    focusItems.length > 0 ? `*${majorItems.length > 0 ? 'Major issues' : 'Highlights'}*` : '',
    ...focusItems.map(entry => {
      const note = entry.bug.note.trim() || 'marker'
      return `#${String(entry.index).padStart(2, '0')} [${entry.severityLabel}] ${note} (${formatReportTime(entry.clipStartMs)}-${formatReportTime(entry.clipEndMs)})`
    }),
    '',
    pdfPath ? 'PDF: attached' : '',
  ]
  return `${lines.filter((line, index, arr) => line || arr[index - 1]).join('\n')}\n`
}

function buildReportHtml(session: Session, entries: ReportEntry[], reportTitle?: string | null): string {
  const groups = groupReportEntries(entries)
  const groupList = [...groups.entries()]
  const total = entries.length
  const summaryCards = groupList.map(([severity, items]) => {
    const first = items[0]
    return `
      <div class="summary-card">
        <div class="summary-count" style="color:${escapeHtml(first.severityColor)}">${items.length}</div>
        <div class="summary-label">${escapeHtml(first.severityLabel || severity)}</div>
      </div>
    `
  }).join('')
  const sections = groupList.map(([severity, items]) => {
    const first = items[0]
    const label = first.severityLabel || severity
    const color = first.severityColor || '#888888'
    return `
      <section class="severity-section">
        <div class="section-heading">
          <h2>${escapeHtml(label)}</h2>
          <span class="section-count" style="background:${escapeHtml(color)};color:${colorText(color)}">${items.length}</span>
        </div>
        ${items.map(entry => {
          const note = entry.bug.note.trim() || 'marker'
          const imageUrl = pathToFileURL(entry.imagePath).toString()
          const videoName = entry.videoPath.split(/[\\/]/).pop() ?? entry.videoPath
          return `
            <article class="bug-card">
              <div class="accent" style="background:${escapeHtml(entry.severityColor)}"></div>
              <div class="bug-content">
                <div class="bug-top">
                  <span class="bug-id">#${String(entry.index).padStart(2, '0')}</span>
                  <span class="badge" style="background:${escapeHtml(entry.severityColor)};color:${colorText(entry.severityColor)}">${escapeHtml(entry.severityLabel)}</span>
                  <span class="clip-name">${escapeHtml(videoName)}</span>
                </div>
                <div class="bug-meta">
                  ${escapeHtml(formatReportDate(entry.bug.createdAt))}
                  <span>Clip ${escapeHtml(formatReportTime(entry.clipStartMs))} - ${escapeHtml(formatReportTime(entry.clipEndMs))}</span>
                </div>
                <div class="bug-note">${escapeHtml(note)}</div>
                ${entry.telemetryLine ? `<div class="bug-telemetry">${escapeHtml(entry.telemetryLine)}</div>` : ''}
              </div>
              <img class="thumb" src="${imageUrl}" />
            </article>
          `
        }).join('')}
      </section>
    `
  }).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f4f1eb;
      color: #202124;
      font-family: "Microsoft JhengHei", "Microsoft YaHei", "Noto Sans CJK TC", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { padding: 38px 46px 44px; }
    .cover {
      min-height: 260px;
      border-bottom: 3px solid #202124;
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .kicker {
      display: inline-block;
      border-radius: 999px;
      background: #242320;
      color: white;
      padding: 7px 13px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
    }
    h1 { margin: 22px 0 10px; font-size: 34px; line-height: 1.15; }
    .subtitle { max-width: 920px; color: #625b53; font-size: 15px; line-height: 1.65; }
    .summary {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
      margin-top: 24px;
    }
    .summary-card {
      min-height: 76px;
      border: 1px solid #d6cdc1;
      border-radius: 10px;
      background: #fffdf8;
      padding: 12px 14px;
    }
    .summary-count { font-size: 28px; line-height: 1; font-weight: 800; }
    .summary-label { margin-top: 12px; color: #625b53; font-size: 13px; font-weight: 700; }
    .severity-section { margin-top: 24px; break-inside: avoid-page; }
    .section-heading {
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #d6cdc1;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .section-heading h2 { margin: 0; font-size: 24px; }
    .section-count {
      min-width: 34px;
      border-radius: 999px;
      padding: 5px 10px;
      text-align: center;
      font-size: 12px;
      font-weight: 800;
    }
    .bug-card {
      position: relative;
      display: grid;
      grid-template-columns: 1fr 172px;
      gap: 18px;
      min-height: 132px;
      margin: 0 0 12px;
      border: 1px solid #d6cdc1;
      border-radius: 12px;
      background: #fffdf8;
      overflow: hidden;
      break-inside: avoid;
    }
    .accent { position: absolute; left: 0; top: 0; bottom: 0; width: 8px; }
    .bug-content { padding: 15px 0 14px 24px; min-width: 0; }
    .bug-top { display: flex; align-items: center; gap: 9px; min-width: 0; }
    .bug-id { font-size: 20px; font-weight: 800; }
    .badge {
      border-radius: 999px;
      padding: 5px 10px 6px;
      font-size: 12px;
      line-height: 1;
      font-weight: 800;
      white-space: nowrap;
    }
    .clip-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #625b53;
      font-size: 12px;
      font-weight: 700;
    }
    .bug-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 8px;
      color: #746b61;
      font-size: 11px;
    }
    .bug-note {
      margin-top: 12px;
      font-size: 19px;
      line-height: 1.45;
      font-weight: 800;
      word-break: break-word;
    }
    .bug-telemetry {
      margin-top: 8px;
      color: #746b61;
      font-size: 11px;
      line-height: 1.35;
    }
    .thumb {
      width: 152px;
      height: 96px;
      margin: 18px 18px 18px 0;
      border: 1px solid #cfc6b9;
      border-radius: 8px;
      object-fit: contain;
      background: #eee9e1;
      justify-self: end;
      align-self: start;
    }
    .footer {
      margin-top: 22px;
      color: #726a60;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="cover">
      <div class="kicker">QA RESULT REPORT</div>
      <h1>${escapeHtml(normalizedReportTitle(reportTitle))}</h1>
      <div class="subtitle">
        ${escapeHtml(session.deviceModel)} / ${escapeHtml(session.androidVersion === 'Windows' ? 'Windows' : `Android ${session.androidVersion}`)} / ${escapeHtml(session.buildVersion)}
        <br />
        Tester: ${escapeHtml(session.tester || '-')} / Session: ${escapeHtml(formatReportDate(session.startedAt))}
        ${session.testNote ? `<br />${escapeHtml(session.testNote)}` : ''}
      </div>
      <div class="summary">
        ${summaryCards}
        <div class="summary-card">
          <div class="summary-count">${total}</div>
          <div class="summary-label">Total</div>
        </div>
      </div>
    </section>
    ${sections}
    <div class="footer">Generated by Loupe QA Recorder</div>
  </main>
</body>
</html>`
}

async function writeQaReportPdf(htmlDir: string, pdfDir: string, session: Session, entries: ReportEntry[], reportTitle?: string | null, owner?: BrowserWindow | null): Promise<string> {
  if (entries.length === 0) throw new Error('cannot create PDF report without entries')
  mkdirSync(htmlDir, { recursive: true })
  mkdirSync(pdfDir, { recursive: true })
  const htmlPath = join(htmlDir, 'qa-report.html')
  const pdfPath = `${reportBasePath(pdfDir, session)}.pdf`
  writeFileSync(htmlPath, buildReportHtml(session, entries, reportTitle), 'utf8')

  const win = new BrowserWindow({
    show: false,
    parent: owner ?? undefined,
    width: 1240,
    height: 1754,
    webPreferences: { sandbox: true },
  })
  try {
    await win.loadURL(pathToFileURL(htmlPath).toString())
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'none' },
    })
    writeFileSync(pdfPath, pdf)
    return pdfPath
  } finally {
    if (!win.isDestroyed()) win.close()
  }
}

async function writeSummaryText(outDir: string, session: Session, entries: ReportEntry[], pdfPath: string, reportTitle?: string | null): Promise<string> {
  if (entries.length === 0) throw new Error('cannot create summary without entries')
  mkdirSync(outDir, { recursive: true })
  const textPath = join(outDir, 'summery.txt')
  writeFileSync(textPath, buildSlackSummaryText(session, entries, pdfPath, reportTitle), 'utf8')
  return textPath
}

function emitExportProgress(
  sender: Electron.WebContents,
  progress: ExportProgress,
): void {
  sender.send(CHANNEL.bugExportProgress, progress)
}

function emitSessionLoadProgress(sender: Electron.WebContents, progress: SessionLoadProgress): void {
  sender.send(CHANNEL.sessionLoadProgress, progress)
}

function sessionLoadProgress(
  sessionId: string,
  phase: SessionLoadProgress['phase'],
  message: string,
  current: number,
  total: number,
  detail?: string,
): SessionLoadProgress {
  return { sessionId, phase, message, current: Math.max(0, Math.min(total, current)), total, detail }
}

function exportProgress(
  exportId: string,
  phase: ExportProgress['phase'],
  message: string,
  detail: string | undefined,
  current: number,
  total: number,
  clipIndex: number,
  clipCount: number,
): ExportProgress {
  return {
    exportId,
    phase,
    message,
    detail,
    current: Math.max(0, Math.min(total, current)),
    total,
    clipIndex,
    clipCount,
    remaining: Math.max(0, clipCount - clipIndex),
  }
}

function throwIfExportCancelled(exportId: string, signal: AbortSignal): void {
  if (signal.aborted) throw new Error(`export cancelled: ${exportId}`)
}

async function listPcCaptureSources(): Promise<PcCaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  })
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    type: source.id.startsWith('screen:') ? 'screen' : 'window',
    displayId: source.display_id || undefined,
    thumbnailDataUrl: source.thumbnail.isEmpty() ? undefined : source.thumbnail.toDataURL(),
  }))
}

async function hidePcCaptureFrame(): Promise<void> {
  pcCaptureFrameToken += 1
  if (pcCaptureFrameTimer) {
    clearInterval(pcCaptureFrameTimer)
    pcCaptureFrameTimer = null
  }
  const frame = pcCaptureFrame
  pcCaptureFrame = null
  if (!frame || frame.isDestroyed()) return
  await new Promise<void>((resolve) => {
    frame.once('closed', resolve)
    frame.close()
  })
}

function even(n: number): number {
  const floored = Math.max(2, Math.floor(n))
  return floored % 2 === 0 ? floored : floored - 1
}

function displayPhysicalBounds(display: Electron.Display): Electron.Rectangle {
  if (process.platform !== 'win32') return display.bounds
  return screen.dipToScreenRect(null, display.bounds)
}

function virtualPhysicalBounds(): Electron.Rectangle {
  const rects = screen.getAllDisplays().map(displayPhysicalBounds)
  const left = Math.min(...rects.map(r => r.x))
  const top = Math.min(...rects.map(r => r.y))
  const right = Math.max(...rects.map(r => r.x + r.width))
  const bottom = Math.max(...rects.map(r => r.y + r.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function clampToVirtualDesktop(rect: Electron.Rectangle): Electron.Rectangle {
  const virtual = virtualPhysicalBounds()
  return clampRectToBounds(rect, virtual)
}

function clampRectToBounds(rect: Electron.Rectangle, bounds: Electron.Rectangle): Electron.Rectangle {
  const x = Math.max(bounds.x, Math.floor(rect.x))
  const y = Math.max(bounds.y, Math.floor(rect.y))
  const right = Math.min(bounds.x + bounds.width, Math.floor(rect.x + rect.width))
  const bottom = Math.min(bounds.y + bounds.height, Math.floor(rect.y + rect.height))
  return {
    x,
    y,
    width: even(right - x),
    height: even(bottom - y),
  }
}

function parseGdigrabWindowArea(stderr: string): Electron.Rectangle | null {
  const match = stderr.match(/window area \((-?\d+),(-?\d+)\),\((-?\d+),(-?\d+)\)/i)
  if (!match) return null
  const [, x1, y1, x2, y2] = match
  const left = Number(x1)
  const top = Number(y1)
  const right = Number(x2)
  const bottom = Number(y2)
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function isUnsupportedGdigrabDrawMouseError(stderr: string): boolean {
  return /Unrecognized option 'draw_mouse'|Option not found/i.test(stderr)
}

function gdigrabWindowInput(source: PcCaptureSource): string {
  const match = source.id.match(/^window:(\d+):/)
  const hwnd = match ? Number(match[1]) : NaN
  if (Number.isFinite(hwnd) && hwnd > 0) return `hwnd=0x${hwnd.toString(16)}`
  return `title=${source.name}`
}

export function parseWindowsWindowHandle(sourceId: string): number | null {
  const match = sourceId.match(/^window:(\d+):/)
  if (!match) return null
  const hwnd = Number(match[1])
  return Number.isSafeInteger(hwnd) && hwnd > 0 ? hwnd : null
}

export function parseMacWindowId(sourceId: string): number | null {
  const match = sourceId.match(/^window:(\d+):/)
  if (!match) return null
  const windowId = Number(match[1])
  return Number.isSafeInteger(windowId) && windowId > 0 ? windowId : null
}

function execWindowsWindowScript<T>(hwnd: number, body: string): Promise<T> {
  const script = `
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class LoupeWin32 {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@
    $hwnd = [IntPtr]${hwnd}
    if (-not [LoupeWin32]::IsWindow($hwnd)) { throw "Window handle is no longer valid." }
    ${body}
  `
  return new Promise<T>((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message))
        return
      }
      try {
        resolve(JSON.parse(stdout.trim()) as T)
      } catch (parseErr) {
        reject(parseErr)
      }
    })
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      err => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function execMacWindowIdScript(windowId: number, shouldFocus: boolean): Promise<Electron.Rectangle> {
  const script = `
import AppKit
import CoreGraphics

guard CommandLine.arguments.count >= 3,
      let windowId = UInt32(CommandLine.arguments[1]) else {
  exit(2)
}

let shouldFocus = CommandLine.arguments[2] == "1"
let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], CGWindowID(windowId)) as? [[String: Any]] ?? []
guard let window = list.first,
      let bounds = window[kCGWindowBounds as String] as? [String: Any],
      let x = bounds["X"] as? CGFloat,
      let y = bounds["Y"] as? CGFloat,
      let width = bounds["Width"] as? CGFloat,
      let height = bounds["Height"] as? CGFloat,
      width > 0,
      height > 0 else {
  exit(3)
}

if shouldFocus,
   let pid = window[kCGWindowOwnerPID as String] as? pid_t,
   let app = NSRunningApplication(processIdentifier: pid) {
  if let bundleIdentifier = app.bundleIdentifier {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    process.arguments = ["-b", bundleIdentifier]
    try? process.run()
    process.waitUntilExit()
  }
  app.unhide()
  app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
}

print("\\(Int(x)),\\(Int(y)),\\(Int(width)),\\(Int(height))")
  `
  return new Promise<Electron.Rectangle>((resolve, reject) => {
    execFile('/usr/bin/xcrun', ['swift', '-e', script, String(windowId), shouldFocus ? '1' : '0'], {
      timeout: MAC_WINDOW_SCRIPT_TIMEOUT_MS,
      env: { ...process.env, CLANG_MODULE_CACHE_PATH: '/private/tmp/loupe-swift-cache' },
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message))
        return
      }
      const parts = stdout.trim().split(',').map(Number)
      if (parts.length !== 4 || !parts.every(Number.isFinite)) {
        reject(new Error('Could not parse macOS window bounds.'))
        return
      }
      const [x, y, width, height] = parts
      if (width <= 0 || height <= 0) {
        reject(new Error('Selected window has no visible bounds.'))
        return
      }
      resolve({ x, y, width, height })
    })
  })
}

function execMacAccessibilityWindowScript(sourceName: string, shouldFocus: boolean): Promise<Electron.Rectangle> {
  const script = `
on run argv
  set targetName to item 1 of argv
  set shouldFocus to (item 2 of argv) is "1"
  tell application "System Events"
    ignoring case
      repeat with proc in application processes
        set procName to name of proc as text
        repeat with win in windows of proc
          set winName to name of win as text
          if winName is not "" and (winName is targetName or winName contains targetName or targetName contains winName or procName is targetName or targetName contains procName) then
            if shouldFocus then
              set frontmost of proc to true
              try
                perform action "AXRaise" of win
              end try
            end if
            set winPos to position of win
            set winSize to size of win
            return ((item 1 of winPos) as text) & "," & ((item 2 of winPos) as text) & "," & ((item 1 of winSize) as text) & "," & ((item 2 of winSize) as text)
          end if
        end repeat
      end repeat
    end ignoring
  end tell
  error "Could not find window: " & targetName
end run
  `
  return new Promise<Electron.Rectangle>((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', script, sourceName, shouldFocus ? '1' : '0'], { timeout: MAC_WINDOW_SCRIPT_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message))
        return
      }
      const parts = stdout.trim().split(',').map(Number)
      if (parts.length !== 4 || !parts.every(Number.isFinite)) {
        reject(new Error('Could not parse macOS window bounds.'))
        return
      }
      const [x, y, width, height] = parts
      if (width <= 0 || height <= 0) {
        reject(new Error('Selected window has no visible bounds.'))
        return
      }
      resolve({ x, y, width, height })
    })
  })
}

async function resolvePcCaptureSourceName(sourceId: string): Promise<string | null> {
  const source = (await listPcCaptureSources()).find(s => s.id === sourceId)
  return source?.name ?? null
}

async function getWindowsWindowBounds(hwnd: number): Promise<Electron.Rectangle> {
  const rect = await execWindowsWindowScript<{ x: number; y: number; width: number; height: number }>(hwnd, `
    $rect = New-Object LoupeWin32+RECT
    if (-not [LoupeWin32]::GetWindowRect($hwnd, [ref]$rect)) { throw "Could not read window bounds." }
    [pscustomobject]@{
      x = $rect.Left
      y = $rect.Top
      width = $rect.Right - $rect.Left
      height = $rect.Bottom - $rect.Top
    } | ConvertTo-Json -Compress
  `)
  if (rect.width <= 0 || rect.height <= 0) throw new Error('Selected window has no visible bounds.')
  return screen.screenToDipRect(null, rect)
}

async function focusPcCaptureSource(sourceId: string, sourceName?: string): Promise<boolean> {
  if (process.platform === 'win32') {
    const hwnd = parseWindowsWindowHandle(sourceId)
    if (!hwnd) return false
    await execWindowsWindowScript<{ ok: boolean }>(hwnd, `
      if ([LoupeWin32]::IsIconic($hwnd)) { [void][LoupeWin32]::ShowWindow($hwnd, 9) }
      [void][LoupeWin32]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x0043)
      [void][LoupeWin32]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x0043)
      [void][LoupeWin32]::BringWindowToTop($hwnd)
      [void][LoupeWin32]::SetForegroundWindow($hwnd)
      [pscustomobject]@{ ok = $true } | ConvertTo-Json -Compress
    `)
    return true
  }
  if (process.platform === 'darwin' && sourceId.startsWith('window:')) {
    const windowId = parseMacWindowId(sourceId)
    if (windowId) {
      await execMacWindowIdScript(windowId, true)
      return true
    }
    const name = sourceName?.trim() || await resolvePcCaptureSourceName(sourceId)
    if (!name) return false
    await execMacAccessibilityWindowScript(name, true)
    return true
  }
  return false
}

export function buildMacAvfoundationInputName(source: PcCaptureSource, screenSources: PcCaptureSource[]): string {
  if (source.type !== 'screen') throw new Error('Window PC recording is only supported on Windows for now. Please choose a screen instead.')
  const screenIndex = Math.max(0, screenSources.findIndex(s => s.id === source.id))
  return `Capture screen ${screenIndex}:none`
}

async function startPcFfmpegRecording(sourceId: string, outputPath: string): Promise<void> {
  if (pcRecordingProcess) throw new Error('PC recording is already running')

  const sources = await listPcCaptureSources()
  const source = sources.find(s => s.id === sourceId)
  if (!source) throw new Error('Selected PC capture source is no longer available.')
  if (process.platform !== 'win32' && source.type === 'window') {
    throw new Error('Window PC recording is only supported on Windows for now. Please choose a screen instead.')
  }
  const display = source.type === 'screen'
    ? (source.displayId
        ? screen.getAllDisplays().find(d => String(d.id) === source.displayId)
        : screen.getPrimaryDisplay())
    : null
  if (source.type === 'screen' && !display) throw new Error('Selected display is no longer available.')

  function buildArgs(boundsOverride?: Electron.Rectangle, includeMouse = true): string[] {
    if (process.platform === 'darwin') {
      const args = [
        '-y',
        '-hide_banner',
        '-loglevel', 'warning',
        '-f', 'avfoundation',
        '-framerate', '30',
        '-capture_cursor', '1',
        '-i', buildMacAvfoundationInputName(source!, sources.filter(s => s.type === 'screen')),
      ]
      args.push(
        '-c:v', 'libvpx-vp9',
        '-deadline', 'realtime',
        '-cpu-used', '8',
        '-b:v', '4M',
        '-pix_fmt', 'yuv420p',
        outputPath,
      )
      return args
    }

    if (process.platform !== 'win32') {
      throw new Error(`PC recording is not supported on ${process.platform}.`)
    }

    const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'gdigrab', '-framerate', '30']
    if (includeMouse) args.push('-draw_mouse', '1')
    if (source!.type === 'screen') {
      const rawBounds = displayPhysicalBounds(display!)
      const physicalBounds = boundsOverride
        ? clampRectToBounds(rawBounds, boundsOverride)
        : clampToVirtualDesktop(rawBounds)
      args.push(
        '-offset_x', String(physicalBounds.x),
        '-offset_y', String(physicalBounds.y),
        '-video_size', `${physicalBounds.width}x${physicalBounds.height}`,
        '-i', 'desktop',
      )
    } else {
      args.push('-i', gdigrabWindowInput(source!))
    }

    args.push(
      '-c:v', 'libvpx-vp9',
      '-deadline', 'realtime',
      '-cpu-used', '8',
      '-b:v', '4M',
      '-pix_fmt', 'yuv420p',
      outputPath,
    )
    return args
  }

  async function spawnAndWait(args: string[]): Promise<void> {
    pcRecordingStderr = ''
    const proc = spawn(resolveBundledFfmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'] })
    pcRecordingProcess = proc
    proc.stderr.on('data', d => { pcRecordingStderr += d.toString() })
    proc.once('exit', () => {
      if (pcRecordingProcess === proc) pcRecordingProcess = null
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        proc.off('exit', onExit)
        resolve()
      }, 800)
      const onExit = (code: number | null) => {
        clearTimeout(timer)
        if (pcRecordingProcess === proc) pcRecordingProcess = null
        reject(new Error(`PC recording failed to start (${code ?? 'unknown'}): ${pcRecordingStderr.trim()}`))
      }
      proc.once('exit', onExit)
      proc.once('error', err => {
        clearTimeout(timer)
        proc.off('exit', onExit)
        if (pcRecordingProcess === proc) pcRecordingProcess = null
        reject(err)
      })
    })
  }

  let includeMouse = true
  let boundsOverride: Electron.Rectangle | undefined
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await spawnAndWait(buildArgs(boundsOverride, includeMouse))
      return
    } catch (err) {
      lastErr = err
      const stderr = pcRecordingStderr
      if (includeMouse && isUnsupportedGdigrabDrawMouseError(stderr)) {
        includeMouse = false
        continue
      }

      const gdigrabBounds = source.type === 'screen' && !boundsOverride ? parseGdigrabWindowArea(stderr) : null
      if (gdigrabBounds) {
        boundsOverride = gdigrabBounds
        continue
      }
      throw err
    }
  }
  throw lastErr
}

async function stopPcFfmpegRecording(): Promise<void> {
  const proc = pcRecordingProcess
  if (!proc) return
  pcRecordingProcess = null
  await new Promise<void>((resolve) => {
    const hardKill = setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL')
      resolve()
    }, 5000)
    proc.once('close', () => {
      clearTimeout(hardKill)
      resolve()
    })
    try {
      proc.stdin.write('q')
      proc.stdin.end()
    } catch {
      proc.kill()
    }
  })
}

async function showPcCaptureFrame(sourceId: string, color: 'green' | 'red' = 'red', displayId?: string): Promise<boolean> {
  const token = pcCaptureFrameToken + 1
  await hidePcCaptureFrame()
  pcCaptureFrameToken = token

  let bounds: Electron.Rectangle | null = null
  let windowHwnd: number | null = null
  let macWindowId: number | null = null
  let windowSourceName: string | null = null
  if (sourceId.startsWith('screen:')) {
    const resolvedDisplayId = displayId ?? sourceId.match(/^screen:(\d+):/)?.[1]
    const display = resolvedDisplayId
      ? screen.getAllDisplays().find(d => String(d.id) === resolvedDisplayId)
      : screen.getPrimaryDisplay()
    if (!display) return false
    bounds = display.bounds
  } else {
    if (process.platform === 'win32') {
      windowHwnd = parseWindowsWindowHandle(sourceId)
      if (!windowHwnd) return false
      await focusPcCaptureSource(sourceId)
      bounds = await getWindowsWindowBounds(windowHwnd)
    } else if (process.platform === 'darwin') {
      macWindowId = parseMacWindowId(sourceId)
      if (macWindowId) {
        bounds = await execMacWindowIdScript(macWindowId, true)
      } else {
        windowSourceName = await resolvePcCaptureSourceName(sourceId)
        if (!windowSourceName) return false
        bounds = await execMacAccessibilityWindowScript(windowSourceName, true)
      }
    } else {
      return false
    }
  }

  if (pcCaptureFrameToken !== token) return false
  const frame = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { sandbox: true },
  })
  pcCaptureFrame = frame
  frame.setIgnoreMouseEvents(true)
  frame.setAlwaysOnTop(true, 'screen-saver')
  const borderColor = color === 'green' ? '#22c55e' : '#ff2d2d'
  const inset = 4
  await frame.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html>
      <body style="margin:0;overflow:hidden;background:transparent;">
        <div style="position:fixed;inset:${inset}px;border:2px solid ${borderColor};box-sizing:border-box;"></div>
      </body>
    </html>
  `)}`)
  if (pcCaptureFrameToken !== token) {
    if (!frame.isDestroyed()) frame.close()
    return false
  }
  if (windowHwnd) {
    await focusPcCaptureSource(sourceId).catch(() => false)
  } else if (macWindowId) {
    await execMacWindowIdScript(macWindowId, true).catch(() => bounds)
  } else if (windowSourceName && process.platform === 'darwin') {
    await execMacAccessibilityWindowScript(windowSourceName, true).catch(() => bounds)
  }
  if (windowHwnd || macWindowId || (process.platform === 'darwin' && sourceId.startsWith('window:'))) {
    let updatingWindowFrame = false
    pcCaptureFrameTimer = setInterval(() => {
      if (updatingWindowFrame) return
      updatingWindowFrame = true
      const nextBounds = windowHwnd
        ? getWindowsWindowBounds(windowHwnd)
        : macWindowId
          ? execMacWindowIdScript(macWindowId, false)
        : windowSourceName
          ? execMacAccessibilityWindowScript(windowSourceName, false)
          : Promise.reject(new Error('Selected window is no longer available.'))
      void nextBounds.then(nextBounds => {
        if (pcCaptureFrameToken !== token || frame.isDestroyed()) return
        frame.setBounds(nextBounds, false)
        frame.moveTop()
      }).catch(() => {
        if (pcCaptureFrameToken === token) void hidePcCaptureFrame()
      }).finally(() => {
        updatingWindowFrame = false
      })
    }, 750)
  }
  return true
}

export function registerIpc(deps: IpcDeps): void {
  slackOAuthCallbackHandler = async (callbackUrl: string) => {
    const win = deps.getWindow()
    try {
      const callback = parseSlackOAuthCallback(callbackUrl)
      if (!pendingSlackOAuth || pendingSlackOAuth.state !== callback.state) throw new Error('Slack OAuth state does not match this Loupe session')
      if (Date.now() - pendingSlackOAuth.createdAt > 10 * 60 * 1000) throw new Error('Slack OAuth code expired; please start login again')
      const codeVerifier = pendingSlackOAuth.codeVerifier
      pendingSlackOAuth = null
      const current = deps.settings.get().slack
      const oauth = await exchangeSlackOAuthCode({ code: callback.code, codeVerifier, settings: current })
      let settings = deps.settings.setSlack({
        ...current,
        userToken: oauth.userToken,
        publishIdentity: 'user',
        oauthUserId: oauth.userId,
        oauthTeamId: oauth.teamId,
        oauthTeamName: oauth.teamName,
        oauthConnectedAt: new Date().toISOString(),
        oauthUserScopes: oauth.scopes,
      })
      try {
        const directory = await refreshSlackDirectory(settings.slack, oauth.userToken)
        settings = deps.settings.setSlack({
          ...settings.slack,
          ...directory,
        })
      } catch (err) {
        console.warn('Loupe: failed to refresh Slack directory after Slack OAuth', err)
      }
      win?.webContents.send(CHANNEL.settingsSlackOAuthCompleted, { ok: true, settings })
    } catch (err) {
      pendingSlackOAuth = null
      win?.webContents.send(CHANNEL.settingsSlackOAuthCompleted, { ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  ipcMain.handle(CHANNEL.doctor, async (): Promise<ToolCheck[]> => doctor(deps.runner))
  ipcMain.handle(CHANNEL.showItemInFolder, async (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle(CHANNEL.openPath, async (_e, path: string) => {
    if (/^https?:\/\//i.test(path)) {
      await shell.openExternal(path)
      return
    }
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
  ipcMain.handle(CHANNEL.appGetPlatform, async () => process.platform)
  ipcMain.handle(CHANNEL.appOpenIphoneMirroring, async () => {
    if (process.platform !== 'darwin') return false
    await new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/open', ['-a', 'iPhone Mirroring'], { timeout: MAC_WINDOW_SCRIPT_TIMEOUT_MS }, (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || err.message))
        else resolve()
      })
    })
    return true
  })
  ipcMain.handle(CHANNEL.appStartUxPlayReceiver, async (): Promise<UxPlayReceiverStatus> => {
    uxPlayReceiver ??= new UxPlayReceiver(deps.runner)
    return uxPlayReceiver.start()
  })
  ipcMain.handle(CHANNEL.appStopUxPlayReceiver, async (): Promise<UxPlayReceiverStatus> => {
    uxPlayReceiver ??= new UxPlayReceiver(deps.runner)
    return uxPlayReceiver.stop()
  })
  ipcMain.handle(CHANNEL.appGetUxPlayReceiver, async (): Promise<UxPlayReceiverStatus> => {
    uxPlayReceiver ??= new UxPlayReceiver(deps.runner)
    return uxPlayReceiver.status()
  })
  ipcMain.handle(CHANNEL.appInstallTools, async (event, names: ToolCheck['name'][]) => installTools(deps.runner, names, {
    onLog: (log: ToolInstallLog) => event.sender.send(CHANNEL.appInstallToolsLog, log),
  }))
  ipcMain.handle(CHANNEL.getPrimaryScreenSource, async (): Promise<{ id: string; name: string } | null> => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    const primaryDisplayId = String(screen.getPrimaryDisplay().id)
    const source = sources.find(s => s.display_id === primaryDisplayId) ?? sources[0]
    return source ? { id: source.id, name: source.name } : null
  })
  ipcMain.handle(CHANNEL.listPcCaptureSources, async () => listPcCaptureSources())
  ipcMain.handle(CHANNEL.showPcCaptureFrame, async (_e, sourceId: string, color?: 'green' | 'red', displayId?: string) => showPcCaptureFrame(sourceId, color, displayId))
  ipcMain.handle(CHANNEL.hidePcCaptureFrame, async () => hidePcCaptureFrame())
  ipcMain.handle(CHANNEL.readClipboardText, async () => clipboard.readText())

  ipcMain.handle(CHANNEL.deviceList, async () => deps.adb.listDevices())
  ipcMain.handle(CHANNEL.deviceConnect, async (_e, ip: string, port?: number) => deps.adb.connect(ip, port))
  ipcMain.handle(CHANNEL.deviceMdnsScan, async () => deps.adb.mdnsServices())
  ipcMain.handle(CHANNEL.devicePair, async (_e, args: { ipPort: string; code: string }) => deps.adb.pair(args.ipPort, args.code))
  ipcMain.handle(CHANNEL.deviceGetUserName, async (_e, id: string) => deps.adb.getUserDeviceName(id))
  ipcMain.handle(CHANNEL.deviceListPackages, async (_e, id: string) => deps.adb.listPackages(id))

  ipcMain.handle(CHANNEL.sessionStart, async (_e, args) => {
    const session = await deps.manager.start(args)
    if (session.connectionMode === 'pc') {
      const outputPath = deps.paths.pcVideoFile(session.id)
      try {
        await withTimeout(
          showPcCaptureFrame(args.deviceId, 'red').catch(() => false),
          PC_CAPTURE_FRAME_START_TIMEOUT_MS,
          'Timed out while preparing the PC capture frame.',
        ).catch(() => false)
        if (process.platform !== 'darwin') {
          await startPcFfmpegRecording(args.deviceId, outputPath)
          deps.db.updateSessionPcRecording(session.id, { pcRecordingEnabled: true, pcVideoPath: outputPath })
          deps.manager.persistProject(session.id)
        }
      } catch (err) {
        await hidePcCaptureFrame()
        await stopPcFfmpegRecording().catch(() => {})
        await deps.manager.discard(session.id).catch(() => {})
        throw err
      }
    }
    dockRecordingPanel(deps.getWindow())
    if (session.connectionMode === 'pc') {
      await withTimeout(
        focusPcCaptureSource(args.deviceId, args.pcCaptureSourceName).catch(() => false),
        PC_CAPTURE_FRAME_START_TIMEOUT_MS,
        'Timed out while focusing the PC capture source.',
      ).catch(() => false)
    }
    return session
  })
  ipcMain.handle(CHANNEL.sessionMarkBug, async (_e, args) => deps.manager.markBug(args))
  ipcMain.handle(CHANNEL.sessionStop, async () => {
    await stopPcFfmpegRecording()
    await hidePcCaptureFrame()
    const session = await deps.manager.stop()
    restoreReviewWindow(deps.getWindow())
    return session
  })
  ipcMain.handle(CHANNEL.sessionDiscard, async (_e, id: string) => {
    await stopPcFfmpegRecording()
    await hidePcCaptureFrame()
    return deps.manager.discard(id)
  })
  ipcMain.handle(CHANNEL.sessionList, async () => deps.manager.listSessions())
  ipcMain.handle(CHANNEL.sessionGet, async (event, id: string) => {
    emitSessionLoadProgress(event.sender, sessionLoadProgress(id, 'load', 'Loading session metadata', 0, 4))
    const session = deps.manager.getSession(id)
    if (!session) return null
    emitSessionLoadProgress(event.sender, sessionLoadProgress(id, 'repair', 'Checking marker thumbnails', 1, 4, 'Large sessions can take a moment while missing screenshots are repaired.'))
    await deps.manager.repairBrokenThumbnails(id)
    emitSessionLoadProgress(event.sender, sessionLoadProgress(id, 'load', 'Loading marker list', 2, 4))
    const updated = deps.manager.getSession(id)
    const bugs = deps.manager.listBugs(id)
    emitSessionLoadProgress(event.sender, sessionLoadProgress(id, 'assets', 'Preparing recorded video', 3, 4))
    const result = updated ? { session: updated, bugs } : { session, bugs }
    emitSessionLoadProgress(event.sender, sessionLoadProgress(id, 'complete', 'Session ready', 4, 4))
    return result
  })
  ipcMain.handle(CHANNEL.sessionUpdateMetadata, async (_e, id: string, patch: { buildVersion: string; testNote: string; tester: string }) => {
    deps.manager.updateSessionMetadata(id, patch)
  })
  ipcMain.handle(CHANNEL.sessionSavePcRecording, async (_e, args: { sessionId: string; base64: string; mimeType: string; durationMs: number }): Promise<string> => {
    const bytes = Buffer.from(args.base64, 'base64')
    return deps.manager.savePcRecording(args.sessionId, bytes)
  })
  ipcMain.handle(CHANNEL.sessionSaveMicRecording, async (_e, args: { sessionId: string; base64: string; mimeType: string; durationMs: number }): Promise<string> => {
    const bytes = Buffer.from(args.base64, 'base64')
    return deps.manager.saveMicRecording(args.sessionId, bytes, args.durationMs)
  })
  ipcMain.handle(CHANNEL.sessionOpenProject, async (): Promise<Session | null> => {
    const win = deps.getWindow()
    const pick = await (win
      ? dialog.showOpenDialog(win, { title: 'Open Loupe session', properties: ['openFile'], filters: [{ name: 'Loupe session', extensions: ['loupe'] }] })
      : dialog.showOpenDialog({ title: 'Open Loupe session', properties: ['openFile'], filters: [{ name: 'Loupe session', extensions: ['loupe'] }] }))
    if (pick.canceled || pick.filePaths.length === 0) return null

    const project = readProjectFile(pick.filePaths[0])
    let session: Session = {
      ...project.session,
      tester: project.session.tester ?? '',
      videoPath: project.session.videoPath ?? null,
      pcRecordingEnabled: project.session.pcRecordingEnabled ?? false,
      pcVideoPath: project.session.pcVideoPath ?? null,
      micAudioPath: project.session.micAudioPath ?? null,
      micAudioDurationMs: project.session.micAudioDurationMs ?? null,
    }
    const currentVideoPath = session.connectionMode === 'pc' ? session.pcVideoPath : session.videoPath
    if (!currentVideoPath || !existsSync(currentVideoPath)) {
      const message = currentVideoPath
        ? `The recorded video could not be found:\n${currentVideoPath}\n\nChoose the video file to relink this session.`
        : 'This session does not have a recorded video path. Choose the video file to relink it.'
      const response = await (win
        ? dialog.showMessageBox(win, { type: 'warning', buttons: ['Locate video', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Video missing', message })
        : dialog.showMessageBox({ type: 'warning', buttons: ['Locate video', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Video missing', message }))
      if (response.response !== 0) return null
      const videoPick = await (win
        ? dialog.showOpenDialog(win, { title: 'Locate recorded video', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm'] }] })
        : dialog.showOpenDialog({ title: 'Locate recorded video', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm'] }] }))
      if (videoPick.canceled || videoPick.filePaths.length === 0) return null
      session = session.connectionMode === 'pc'
        ? { ...session, pcVideoPath: videoPick.filePaths[0] }
        : { ...session, videoPath: videoPick.filePaths[0] }
      writeProjectFile(pick.filePaths[0], session, project.bugs)
    }
    deps.manager.importProject(session, project.bugs.map(b => ({
      ...b,
      sessionId: session.id,
      audioRel: b.audioRel ?? null,
      audioDurationMs: b.audioDurationMs ?? null,
    })))
    return session
  })
  ipcMain.handle(CHANNEL.sessionResolveAssetPath, async (_e, sessionId: string, relPath: string) => {
    if (relPath === 'video.mp4') {
      const session = deps.manager.getSession(sessionId)
      if (session?.videoPath) return session.videoPath
    }
    if (relPath === 'pc-recording.webm') {
      const session = deps.manager.getSession(sessionId)
      if (session?.pcVideoPath) return session.pcVideoPath
    }
    if (relPath === 'session-mic.webm') {
      const session = deps.manager.getSession(sessionId)
      if (session?.micAudioPath) return session.micAudioPath
    }
    return join(deps.paths.sessionDir(sessionId), relPath)
  })

  ipcMain.handle(CHANNEL.bugUpdate, async (_e, id: string, patch: { note: string; severity: Bug['severity']; preSec: number; postSec: number; mentionUserIds?: string[] }) => deps.manager.updateBug(id, patch))
  ipcMain.handle(CHANNEL.bugGetLogcatPreview, async (_e, args: { sessionId: string; relPath: string; maxLines?: number }) => {
    const filePath = join(deps.paths.sessionDir(args.sessionId), args.relPath)
    if (!existsSync(filePath)) return null
    const lines = readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    if (lines.length === 0) return null
    if (args.maxLines === undefined) return lines.join('\n')
    const maxLines = Math.max(1, args.maxLines)
    return lines.slice(-maxLines).join('\n')
  })
  ipcMain.handle(CHANNEL.bugDelete, async (_e, id: string) => deps.manager.deleteBug(id))

  ipcMain.handle(CHANNEL.hotkeySetEnabled, async (_e, enabled: boolean) => deps.setHotkeyEnabled(enabled))
  ipcMain.handle(CHANNEL.settingsGet, async () => deps.settings.get())
  ipcMain.handle(CHANNEL.settingsSetExportRoot, async (_e, path: string) => deps.settings.setExportRoot(path))
  ipcMain.handle(CHANNEL.settingsSetHotkeys, async (_e, hotkeys: HotkeySettings) => {
    const settings = deps.settings.setHotkeys(hotkeys)
    deps.setHotkeys(settings.hotkeys)
    return settings
  })
  ipcMain.handle(CHANNEL.settingsSetSlack, async (_e, slack: SlackPublishSettings) => {
    let settings = deps.settings.setSlack(slack)
    const token = slackApiTokenForUsers(settings.slack)
    if (token && (settings.slack.mentionUsers ?? []).length === 0 && (settings.slack.channels ?? []).length === 0) {
      try {
        const directory = await refreshSlackDirectory(settings.slack, token)
        settings = deps.settings.setSlack({
          ...settings.slack,
          ...directory,
        })
      } catch (err) {
        console.warn('Loupe: failed to refresh Slack directory after saving settings', err)
      }
    }
    return settings
  })
  ipcMain.handle(CHANNEL.settingsSetGitLab, async (_e, gitlab: GitLabPublishSettings) => deps.settings.setGitLab(gitlab))
  ipcMain.handle(CHANNEL.settingsConnectGitLabOAuth, async (_e, gitlab: GitLabPublishSettings) => {
    const saved = deps.settings.setGitLab(gitlab)
    const token = await connectGitLabOAuth(saved.gitlab)
    return deps.settings.setGitLab({ ...saved.gitlab, token, authType: 'oauth' })
  })
  ipcMain.handle(CHANNEL.settingsCancelGitLabOAuth, async () => {
    gitlabOAuthCancel?.()
    gitlabOAuthCancel = null
  })
  ipcMain.handle(CHANNEL.settingsListGitLabProjects, async (_e, gitlab: GitLabPublishSettings) => {
    return fetchGitLabProjects(gitlab)
  })
  ipcMain.handle(CHANNEL.settingsSetGoogle, async (_e, google: GooglePublishSettings) => deps.settings.setGoogle(google))
  ipcMain.handle(CHANNEL.settingsConnectGoogleOAuth, async (_e, google: GooglePublishSettings) => {
    const saved = deps.settings.setGoogle(google)
    const connected = await connectGoogleOAuth(saved.google)
    return deps.settings.setGoogle(connected)
  })
  ipcMain.handle(CHANNEL.settingsCancelGoogleOAuth, async () => {
    googleOAuthCancel?.()
    googleOAuthCancel = null
  })
  ipcMain.handle(CHANNEL.settingsListGoogleDriveFolders, async (_e, google: GooglePublishSettings) => {
    const refreshed = await refreshGoogleAccessToken(google)
    const folders = await listGoogleDriveFolders(refreshed)
    deps.settings.setGoogle({ ...google, token: refreshed.token, tokenExpiresAt: refreshed.tokenExpiresAt })
    return folders
  })
  ipcMain.handle(CHANNEL.settingsCreateGoogleDriveFolder, async (_e, google: GooglePublishSettings, name: string) => {
    const refreshed = await refreshGoogleAccessToken(google)
    const folder = await createGoogleDriveFolder(refreshed, name)
    deps.settings.setGoogle({ ...google, token: refreshed.token, tokenExpiresAt: refreshed.tokenExpiresAt, driveFolderId: folder.id, driveFolderName: folder.name })
    return folder
  })
  ipcMain.handle(CHANNEL.settingsListGoogleSpreadsheets, async (_e, google: GooglePublishSettings) => {
    const refreshed = await refreshGoogleAccessToken(google)
    const sheets = await listGoogleSpreadsheets(refreshed)
    deps.settings.setGoogle({ ...google, token: refreshed.token, tokenExpiresAt: refreshed.tokenExpiresAt })
    return sheets
  })
  ipcMain.handle(CHANNEL.settingsListGoogleSheetTabs, async (_e, google: GooglePublishSettings) => {
    const refreshed = await refreshGoogleAccessToken(google)
    const tabs = await listGoogleSheetTabs(refreshed)
    deps.settings.setGoogle({ ...google, token: refreshed.token, tokenExpiresAt: refreshed.tokenExpiresAt })
    return tabs
  })
  ipcMain.handle(CHANNEL.settingsSetMentionIdentities, async (_e, identities: MentionIdentity[]) => deps.settings.setMentionIdentities(identities))
  ipcMain.handle(CHANNEL.settingsExportMentionIdentities, async (): Promise<string | null> => {
    const win = deps.getWindow()
    const result = await (win
      ? dialog.showSaveDialog(win, {
        title: 'Export mention identities',
        defaultPath: 'loupe-mention-identities.json',
        filters: [{ name: 'Loupe mention identities', extensions: ['json'] }],
      })
      : dialog.showSaveDialog({
        title: 'Export mention identities',
        defaultPath: 'loupe-mention-identities.json',
        filters: [{ name: 'Loupe mention identities', extensions: ['json'] }],
      }))
    if (result.canceled || !result.filePath) return null
    const settings = deps.settings.get()
    writeFileSync(result.filePath, `${JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      mentionIdentities: settings.mentionIdentities,
    }, null, 2)}\n`, 'utf8')
    return result.filePath
  })
  ipcMain.handle(CHANNEL.settingsImportMentionIdentities, async (): Promise<ReturnType<SettingsStore['get']> | null> => {
    const win = deps.getWindow()
    const result = await (win
      ? dialog.showOpenDialog(win, {
        title: 'Import mention identities',
        properties: ['openFile'],
        filters: [{ name: 'Loupe mention identities', extensions: ['json'] }],
      })
      : dialog.showOpenDialog({
        title: 'Import mention identities',
        properties: ['openFile'],
        filters: [{ name: 'Loupe mention identities', extensions: ['json'] }],
      }))
    if (result.canceled || !result.filePaths[0]) return null
    const payload = JSON.parse(readFileSync(result.filePaths[0], 'utf8')) as unknown
    const identities = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object' && Array.isArray((payload as { mentionIdentities?: unknown }).mentionIdentities)
        ? (payload as { mentionIdentities: unknown[] }).mentionIdentities
        : null
    if (!identities) throw new Error('Mention identity import failed: expected a JSON array or mentionIdentities field')
    return deps.settings.setMentionIdentities(identities as MentionIdentity[])
  })
  ipcMain.handle(CHANNEL.settingsRefreshSlackUsers, async () => {
    const settings = deps.settings.get()
    const token = slackApiTokenForUsers(settings.slack)
    const directory = (settings.slack.mentionUsers ?? []).length > 0 && (settings.slack.channels ?? []).length === 0
      ? await refreshSlackChannelsOnly(settings.slack, token)
      : await refreshSlackDirectory(settings.slack, token)
    const next = deps.settings.setSlack({
      ...settings.slack,
      ...directory,
    })
    return deps.settings.refreshMentionIdentities()
  })
  ipcMain.handle(CHANNEL.settingsRefreshGitLabUsers, async () => {
    const settings = deps.settings.get()
    const { users: mentionUsers, warning } = await fetchGitLabMentionUsersWithEmailLookup(settings.gitlab)
    const next = deps.settings.setGitLab({
      ...settings.gitlab,
      mentionUsers,
      usersFetchedAt: new Date().toISOString(),
      lastUserSyncWarning: warning,
    })
    return deps.settings.refreshMentionIdentities()
  })
  ipcMain.handle(CHANNEL.settingsRefreshSlackChannels, async () => {
    const settings = deps.settings.get()
    const directory = await refreshSlackChannelsOnly(settings.slack, slackApiTokenForUsers(settings.slack))
    return deps.settings.setSlack({
      ...settings.slack,
      ...directory,
    })
  })
  ipcMain.handle(CHANNEL.settingsStartSlackUserOAuth, async (_e, slack: SlackPublishSettings) => {
    const settings = deps.settings.setSlack(slack)
    const state = randomBytes(18).toString('base64url')
    const pkce = createSlackPkce()
    pendingSlackOAuth = { state, codeVerifier: pkce.codeVerifier, createdAt: Date.now() }
    await shell.openExternal(buildSlackUserOAuthUrl(settings.slack, state, pkce.codeChallenge))
    return settings
  })
  ipcMain.handle(CHANNEL.settingsSetLocale, async (_e, locale: AppLocale) => deps.settings.setLocale(locale))
  ipcMain.handle(CHANNEL.settingsSetSeverities, async (_e, severities: SeveritySettings) => deps.settings.setSeverities(severities))
  ipcMain.handle(CHANNEL.settingsChooseExportRoot, async (): Promise<ReturnType<SettingsStore['get']> | null> => {
    const win = deps.getWindow()
    const pick = await (win
      ? dialog.showOpenDialog(win, { title: 'Choose export folder', properties: ['openDirectory', 'createDirectory'] })
      : dialog.showOpenDialog({ title: 'Choose export folder', properties: ['openDirectory', 'createDirectory'] }))
    if (pick.canceled || pick.filePaths.length === 0) return null
    return deps.settings.setExportRoot(pick.filePaths[0])
  })

  ipcMain.handle(CHANNEL.bugAddMarker, async (_e, args: { sessionId: string; offsetMs: number; severity?: any; note?: string }) => {
    return deps.manager.addMarker(args)
  })
  ipcMain.handle(CHANNEL.bugSaveAudio, async (_e, args: { sessionId: string; bugId: string; base64: string; durationMs: number; mimeType: string }) => {
    const bytes = Buffer.from(args.base64, 'base64')
    deps.manager.saveBugAudio(args.sessionId, args.bugId, bytes, args.durationMs)
  })
  ipcMain.handle(CHANNEL.bugExportCancel, async (_e, exportId: string): Promise<void> => {
    exportControllers.get(exportId)?.abort()
  })
  ipcMain.handle(CHANNEL.bugExportClip, async (event, args: { sessionId: string; bugId: string; exportId?: string; reportTitle?: string; includeLogcat?: boolean; includeMicTrack?: boolean; includeOriginalFiles?: boolean; mergeOriginalAudio?: boolean; publish?: ExportPublishOptions }): Promise<string | null> => {
    const session = deps.manager.getSession(args.sessionId)
    const bugs = deps.manager.listBugs(args.sessionId)
    const bug = bugs.find(b => b.id === args.bugId)
    if (!session || !bug) throw new Error('session or bug not found')
    const exportId = args.exportId ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const controller = new AbortController()
    exportControllers.set(exportId, controller)
    const runOpts = { signal: controller.signal }
    const total = 6

    try {
      emitExportProgress(event.sender, exportProgress(exportId, 'prepare', 'Preparing export folder', 'Creating output paths and reading marker metadata.', 0, total, 1, 1))
      const outDir = exportDirForSession(deps.settings.get().exportRoot, session)
      const recordsDir = exportRecordsDir(outDir)
      const reportDir = exportReportDir(outDir)
      mkdirSync(recordsDir, { recursive: true })
      mkdirSync(reportDir, { recursive: true })
      const baseName = exportBaseName(session, bug)
      const outputPath = join(recordsDir, `${baseName}.mp4`)
      const imagePath = join(recordsDir, `${baseName}.jpg`)

      emitExportProgress(event.sender, exportProgress(exportId, 'prepare', 'Preparing clip metadata', `Marker 1 of 1 at ${Math.round(bug.offsetMs / 1000)}s.`, 1, total, 1, 1))
      throwIfExportCancelled(exportId, controller.signal)
      const { startMs, endMs } = clampClipWindow({ ...bug, durationMs: session.durationMs })
      const ffmpegPath = resolveBundledFfmpegPath()
      const clicks = readClickLog(deps.paths.clicksFile(session.id))
      const inputPath = sessionVideoInputPath(session, deps.paths)
      await assertVideoInputReadable(deps.runner, ffmpegPath, { inputPath })
      const tileSize = await contactSheetTileSize(deps.runner, inputPath)
      const sourceHasAudio = await getVideoHasAudio(deps.runner, inputPath)
      const severities = deps.settings.get().severities
      const severityStyle = severities[bug.severity]
      const telemetryLine = telemetryLineForMarker(deps.paths, session.id, bug.offsetMs)
      const clipOptions = {
        inputPath,
        outputPath,
        startMs, endMs,
        narrationPath: !args.includeMicTrack && bug.audioRel ? join(deps.paths.sessionDir(session.id), bug.audioRel) : null,
        narrationDurationMs: !args.includeMicTrack ? bug.audioDurationMs : null,
        sessionMicPath: args.includeMicTrack ? session.micAudioPath : null,
        severity: bug.severity,
        severityLabel: severityStyle?.label ?? bug.severity,
        severityColor: severityStyle?.color ?? '#888888',
        note: bug.note,
        markerMs: bug.offsetMs,
        clipStartMs: startMs,
        clipEndMs: endMs,
        deviceModel: session.deviceModel,
        buildVersion: session.buildVersion,
        androidVersion: session.androidVersion,
        testNote: session.testNote,
        tester: session.tester,
        testedAtMs: bug.createdAt,
        telemetryLine,
        clicks,
      }
      emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating 3x2 intro card', `Writing ${imagePath}`, 2, total, 1, 1))
      await extractContactSheet(deps.runner, ffmpegPath, {
        ...clipOptions,
        ...tileSize,
        outputPath: imagePath,
        logcatText: args.includeLogcat ? readLogcatTailForContactSheet(deps.paths, session, bug) : null,
      }, runOpts)
      throwIfExportCancelled(exportId, controller.signal)
      const introSize = await getVideoSize(deps.runner, imagePath)
      emitExportProgress(event.sender, exportProgress(exportId, 'video', 'Exporting video clip', `Writing ${outputPath}`, 3, total, 1, 1))
      if (bug.audioRel || !introSize) {
        await extractClip(deps.runner, ffmpegPath, clipOptions, runOpts)
      } else {
        await extractClipWithIntro(deps.runner, ffmpegPath, {
          ...clipOptions,
          introImagePath: imagePath,
          canvasWidth: introSize.width,
          canvasHeight: introSize.height,
          sourceHasAudio,
        }, runOpts)
      }
      if (!existsSync(outputPath)) throw new Error(`exported clip was not created: ${outputPath}`)
      throwIfExportCancelled(exportId, controller.signal)
      emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating PDF report', `Writing PDF report for ${outputPath}`, 4, total, 1, 1))
      const reportTitle = normalizedReportTitle(args.reportTitle)
      const pdfPath = await writeQaReportPdf(reportDir, outDir, session, [{
        index: 1,
        bug,
        imagePath,
        videoPath: outputPath,
        clipStartMs: startMs,
        clipEndMs: endMs,
        severityLabel: clipOptions.severityLabel,
        severityColor: clipOptions.severityColor,
        telemetryLine,
      }], reportTitle, deps.getWindow())
      throwIfExportCancelled(exportId, controller.signal)
      emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating summary text', `Writing summary text.`, 5, total, 1, 1))
      const summaryTextPath = await writeSummaryText(outDir, session, [{
        index: 1,
        bug,
        imagePath,
        videoPath: outputPath,
        clipStartMs: startMs,
        clipEndMs: endMs,
        severityLabel: clipOptions.severityLabel,
        severityColor: clipOptions.severityColor,
        telemetryLine,
      }], pdfPath, reportTitle)
      const file: ExportedMarkerFile = {
        bugId: bug.id,
        videoPath: outputPath,
        previewPath: imagePath,
        logcatPath: args.includeLogcat ? exportLogcatSidecar(deps.paths, session, bug, recordsDir, baseName) : null,
      }
      if (args.includeOriginalFiles) {
        emitExportProgress(event.sender, exportProgress(exportId, 'prepare', args.mergeOriginalAudio ? 'Merging original recordings' : 'Copying original recordings', args.mergeOriginalAudio ? 'Writing original video with MIC audio.' : 'Writing original video and audio files.', 5, total, 1, 1))
        await exportOriginalRecordingFiles({ outDir, session, paths: deps.paths, runner: deps.runner, mergeAudio: args.mergeOriginalAudio })
      }
      const manifestFiles = writeExportManifests({ session, bugs: [bug], files: [file], outDir, reportPdfPath: pdfPath, publish: args.publish, severities })
      await publishManifestToRemote({
        manifest: manifestFiles.manifest,
        manifestPaths: { jsonPath: manifestFiles.jsonPath, csvPath: manifestFiles.csvPath, reportPdfPath: pdfPath, summaryTextPath },
        settings: deps.settings.get(),
      })
      emitExportProgress(event.sender, exportProgress(exportId, 'complete', 'Export complete', `${outputPath}\n${pdfPath}`, total, total, 1, 1))
      return outputPath
    } catch (err) {
      if (controller.signal.aborted) {
        emitExportProgress(event.sender, exportProgress(exportId, 'error', 'Export canceled', 'The current FFmpeg task was stopped.', total, total, 1, 1))
        throw new Error('export cancelled')
      }
      throw err
    } finally {
      exportControllers.delete(exportId)
    }
  })

  ipcMain.handle(CHANNEL.bugExportClips, async (event, args: { sessionId: string; bugIds: string[]; exportId?: string; reportTitle?: string; includeLogcat?: boolean; includeMicTrack?: boolean; includeOriginalFiles?: boolean; mergeOriginalAudio?: boolean; publish?: ExportPublishOptions }): Promise<string[] | null> => {
    const session = deps.manager.getSession(args.sessionId)
    const bugs = deps.manager.listBugs(args.sessionId).filter(b => args.bugIds.includes(b.id))
    if (!session) throw new Error('session not found')
    const exportId = args.exportId ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const controller = new AbortController()
    exportControllers.set(exportId, controller)
    const runOpts = { signal: controller.signal }
    const total = 3 + bugs.length * 3

    try {
      const outDir = exportDirForSession(deps.settings.get().exportRoot, session)
      const recordsDir = exportRecordsDir(outDir)
      const reportDir = exportReportDir(outDir)
      mkdirSync(recordsDir, { recursive: true })
      if (bugs.length === 0) {
        emitExportProgress(event.sender, exportProgress(exportId, 'prepare', 'No markers found', 'Copying the full-length recording and session audio into records.', 0, 2, 0, 0))
        throwIfExportCancelled(exportId, controller.signal)
        const outputs = exportFullRecordingFilesToRecords({ recordsDir, session, paths: deps.paths })
        emitExportProgress(event.sender, exportProgress(exportId, 'complete', 'Full recording exported', recordsDir, 2, 2, 0, 0))
        return outputs
      }
      mkdirSync(reportDir, { recursive: true })
      emitExportProgress(event.sender, exportProgress(exportId, 'prepare', 'Preparing batch export', `Preparing ${bugs.length} selected marker${bugs.length === 1 ? '' : 's'}.`, 0, total, 0, bugs.length))
      const outputs: string[] = []
      const files: ExportedMarkerFile[] = []
      const reportEntries: ReportEntry[] = []
      const clicks = readClickLog(deps.paths.clicksFile(session.id))
      const telemetrySamples = readTelemetrySamples(deps.paths.telemetryFile(session.id))
      const severities = deps.settings.get().severities
      for (let i = 0; i < bugs.length; i++) {
        throwIfExportCancelled(exportId, controller.signal)
        const bug = bugs[i]
        const clipIndex = i + 1
        const baseProgress = 1 + i * 3
        emitExportProgress(event.sender, exportProgress(exportId, 'prepare', 'Preparing clip metadata', `Marker ${clipIndex} of ${bugs.length} at ${Math.round(bug.offsetMs / 1000)}s.`, baseProgress, total, clipIndex, bugs.length))
        const { startMs, endMs } = clampClipWindow({ ...bug, durationMs: session.durationMs })
        const baseName = `${String(i + 1).padStart(2, '0')}-${exportBaseName(session, bug)}`
        const outputPath = join(recordsDir, `${baseName}.mp4`)
        const imagePath = join(recordsDir, `${baseName}.jpg`)
        const ffmpegPath = resolveBundledFfmpegPath()
        const inputPath = sessionVideoInputPath(session, deps.paths)
        await assertVideoInputReadable(deps.runner, ffmpegPath, { inputPath })
        const tileSize = await contactSheetTileSize(deps.runner, inputPath)
        const sourceHasAudio = await getVideoHasAudio(deps.runner, inputPath)
        const severityStyle = severities[bug.severity]
        const telemetryLine = formatTelemetryLine(nearestTelemetrySample(telemetrySamples, bug.offsetMs))
        const clipOptions = {
          inputPath,
          outputPath,
          startMs,
          endMs,
          narrationPath: !args.includeMicTrack && bug.audioRel ? join(deps.paths.sessionDir(session.id), bug.audioRel) : null,
          narrationDurationMs: !args.includeMicTrack ? bug.audioDurationMs : null,
          sessionMicPath: args.includeMicTrack ? session.micAudioPath : null,
          severity: bug.severity,
          severityLabel: severityStyle?.label ?? bug.severity,
          severityColor: severityStyle?.color ?? '#888888',
          note: bug.note,
          markerMs: bug.offsetMs,
          clipStartMs: startMs,
          clipEndMs: endMs,
          deviceModel: session.deviceModel,
          buildVersion: session.buildVersion,
          androidVersion: session.androidVersion,
          testNote: session.testNote,
          tester: session.tester,
          testedAtMs: bug.createdAt,
          telemetryLine,
          clicks,
        }
        emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating 3x2 intro card', `Marker ${clipIndex} of ${bugs.length}: ${imagePath}`, baseProgress + 1, total, clipIndex, bugs.length))
        await extractContactSheet(deps.runner, ffmpegPath, {
          ...clipOptions,
          ...tileSize,
          outputPath: imagePath,
          logcatText: args.includeLogcat ? readLogcatTailForContactSheet(deps.paths, session, bug) : null,
        }, runOpts)
        throwIfExportCancelled(exportId, controller.signal)
        const introSize = await getVideoSize(deps.runner, imagePath)
        emitExportProgress(event.sender, exportProgress(exportId, 'video', 'Exporting video clip', `Marker ${clipIndex} of ${bugs.length}: ${outputPath}`, baseProgress + 2, total, clipIndex, bugs.length))
        if (bug.audioRel || !introSize) {
          await extractClip(deps.runner, ffmpegPath, clipOptions, runOpts)
        } else {
          await extractClipWithIntro(deps.runner, ffmpegPath, {
            ...clipOptions,
            introImagePath: imagePath,
            canvasWidth: introSize.width,
            canvasHeight: introSize.height,
            sourceHasAudio,
          }, runOpts)
        }
        if (!existsSync(outputPath)) throw new Error(`exported clip was not created: ${outputPath}`)
        outputs.push(outputPath)
        files.push({
          bugId: bug.id,
          videoPath: outputPath,
          previewPath: imagePath,
          logcatPath: args.includeLogcat ? exportLogcatSidecar(deps.paths, session, bug, recordsDir, baseName) : null,
        })
        reportEntries.push({
          index: clipIndex,
          bug,
          imagePath,
          videoPath: outputPath,
          clipStartMs: startMs,
          clipEndMs: endMs,
          severityLabel: clipOptions.severityLabel,
          severityColor: clipOptions.severityColor,
          telemetryLine,
        })
        emitExportProgress(event.sender, exportProgress(exportId, 'complete', 'Finished marker export', `Marker ${clipIndex} of ${bugs.length} complete.`, baseProgress + 3, total, clipIndex, bugs.length))
      }
      throwIfExportCancelled(exportId, controller.signal)
      emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating PDF report', `Writing QA report for ${outputs.length} exported clip${outputs.length === 1 ? '' : 's'}.`, total - 2, total, bugs.length, bugs.length))
      const reportTitle = normalizedReportTitle(args.reportTitle)
      const pdfPath = await writeQaReportPdf(reportDir, outDir, session, reportEntries, reportTitle, deps.getWindow())
      throwIfExportCancelled(exportId, controller.signal)
      emitExportProgress(event.sender, exportProgress(exportId, 'image', 'Creating summary text', 'Writing summary text.', total - 1, total, bugs.length, bugs.length))
      const summaryTextPath = await writeSummaryText(outDir, session, reportEntries, pdfPath, reportTitle)
      if (args.includeOriginalFiles) {
        emitExportProgress(event.sender, exportProgress(exportId, 'prepare', args.mergeOriginalAudio ? 'Merging original recordings' : 'Copying original recordings', args.mergeOriginalAudio ? 'Writing original video with MIC audio.' : 'Writing original video and audio files.', total - 1, total, bugs.length, bugs.length))
        await exportOriginalRecordingFiles({ outDir, session, paths: deps.paths, runner: deps.runner, mergeAudio: args.mergeOriginalAudio })
      }
      const manifestFiles = writeExportManifests({ session, bugs, files, outDir, reportPdfPath: pdfPath, publish: args.publish, severities })
      await publishManifestToRemote({
        manifest: manifestFiles.manifest,
        manifestPaths: { jsonPath: manifestFiles.jsonPath, csvPath: manifestFiles.csvPath, reportPdfPath: pdfPath, summaryTextPath },
        settings: deps.settings.get(),
      })
      emitExportProgress(event.sender, exportProgress(exportId, 'complete', 'Export complete', `${outputs.length} clip${outputs.length === 1 ? '' : 's'} exported.\n${pdfPath}`, total, total, bugs.length, bugs.length))
      return outputs
    } catch (err) {
      if (controller.signal.aborted) {
        emitExportProgress(event.sender, exportProgress(exportId, 'error', 'Export canceled', 'The current FFmpeg task was stopped. Finished files are kept.', total, total, bugs.length, bugs.length))
        throw new Error('export cancelled')
      }
      throw err
    } finally {
      exportControllers.delete(exportId)
    }
  })
}

export function emitBugMarkRequested(win: BrowserWindow | null, severity = 'normal') {
  win?.webContents.send(CHANNEL.bugMarkRequested, severity)
}
