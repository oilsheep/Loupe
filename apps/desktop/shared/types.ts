export interface Device {
  id: string                              // adb serial OR `ip:port` for wifi
  type: 'usb' | 'wifi'
  state: 'device' | 'offline' | 'unauthorized'
  model?: string
  androidVersion?: string
  /** User-set device name from Android Settings (Android 12+). May be unavailable on older devices. */
  userDeviceName?: string
}

export interface IosAppInfo {
  bundleId: string
  name?: string
}

export type SessionStatus = 'recording' | 'draft'
export type MarkerSource = 'manual' | 'audio-auto'
export type BugSeverity = string
export type HotkeySeverity = 'improvement' | 'minor' | 'normal' | 'major'
export type AppLocale = 'system' | 'en' | 'zh-TW' | 'zh-CN' | 'ja' | 'ko' | 'es'
export type SeveritySettings = Record<string, { label: string; color: string }>

export interface HotkeySettings {
  improvement: string
  minor: string
  normal: string
  major: string
}

export interface SlackPublishSettings {
  botToken: string
  userToken?: string
  publishIdentity?: 'bot' | 'user'
  channelId: string
  oauthClientId?: string
  oauthClientSecret?: string
  oauthRedirectUri?: string
  oauthUserId?: string
  oauthTeamId?: string
  oauthTeamName?: string
  oauthConnectedAt?: string | null
  oauthUserScopes?: string[]
  channels?: SlackChannel[]
  channelsFetchedAt?: string | null
  mentionUserIds?: string[]
  mentionAliases?: Record<string, string>
  mentionUsers?: SlackMentionUser[]
  usersFetchedAt?: string | null
}

export interface SlackMentionUser {
  id: string
  name: string
  displayName: string
  realName: string
  email?: string
  deleted?: boolean
  isBot?: boolean
}

export interface SlackChannel {
  id: string
  name: string
  isPrivate?: boolean
  isArchived?: boolean
  isMember?: boolean
}

export interface MentionIdentity {
  id: string
  displayName: string
  email?: string
  slackUserId?: string
  gitlabUsername?: string
  googleEmail?: string
}

export type GitLabPublishMode = 'single-issue' | 'per-marker-issue'

export interface GitLabPublishSettings {
  baseUrl: string
  token: string
  authType?: 'pat' | 'oauth'
  oauthClientId?: string
  oauthClientSecret?: string
  oauthRedirectUri?: string
  projectId: string
  mode: GitLabPublishMode
  emailLookup?: 'off' | 'admin-users-api'
  labels?: string[]
  confidential?: boolean
  mentionUsernames?: string[]
  mentionUsers?: GitLabMentionUser[]
  usersFetchedAt?: string | null
  lastUserSyncWarning?: string | null
}

export interface GitLabProject {
  id: number
  name: string
  nameWithNamespace: string
  pathWithNamespace: string
  webUrl?: string
}

export interface GitLabMentionUser {
  id: number
  username: string
  name: string
  email?: string
  state?: string
  avatarUrl?: string
  webUrl?: string
}

export interface GooglePublishSettings {
  token: string
  refreshToken?: string
  tokenExpiresAt?: number | null
  accountEmail?: string
  oauthClientId?: string
  oauthClientSecret?: string
  oauthRedirectUri?: string
  driveFolderId?: string
  driveFolderName?: string
  updateSheet?: boolean
  spreadsheetId?: string
  spreadsheetName?: string
  sheetName?: string
}

export interface AudioAnalysisSettings {
  enabled: boolean
  engine: 'whisper-cpp' | 'faster-whisper'
  modelPath: string
  language: string
  chineseScript?: 'zh-TW' | 'zh-CN'
  triggerKeywords: string
  showTriggerWords: boolean
}

export interface CommonSessionSettings {
  platforms: string[]
  projects: string[]
  testers: string[]
  lastPlatform: string
  lastProject: string
  lastTester: string
}

export interface GoogleDriveFolder {
  id: string
  name: string
  webViewLink?: string
}

export interface GoogleSpreadsheet {
  id: string
  name: string
  webViewLink?: string
}

export interface GoogleSheetTab {
  sheetId: number
  title: string
}

export interface AppSettings {
  exportRoot: string
  hotkeys: HotkeySettings
  locale: AppLocale
  severities: SeveritySettings
  audioAnalysis: AudioAnalysisSettings
  commonSession?: CommonSessionSettings
  slack: SlackPublishSettings
  gitlab: GitLabPublishSettings
  google: GooglePublishSettings
  mentionIdentities: MentionIdentity[]
}

export interface Session {
  id: string
  buildVersion: string
  platform?: string
  project?: string
  testNote: string
  tester: string
  deviceId: string
  deviceModel: string
  androidVersion: string
  ramTotalGb?: number | null
  graphicsDevice?: string | null
  connectionMode: 'usb' | 'wifi' | 'pc'
  status: SessionStatus
  durationMs: number | null
  startedAt: number             // epoch ms
  endedAt: number | null
  videoPath: string | null
  pcRecordingEnabled: boolean
  pcVideoPath: string | null
  micAudioPath: string | null
  micAudioDurationMs: number | null
  micAudioStartOffsetMs: number | null
  /** Source of session MIC/analysis audio. `video` means extracted from the imported video and should not be played twice. */
  micAudioSource?: 'recording' | 'video' | 'external' | null
  /** Transient recording preference for the active renderer session. Older/saved sessions may omit it. */
  micRecordingRequested?: boolean
}

export interface Bug {
  id: string
  sessionId: string
  offsetMs: number              // ms since session start (= scrcpy elapsed at mark time)
  severity: BugSeverity
  note: string
  screenshotRel: string | null  // path relative to session dir, e.g. "screenshots/abc.png"
  logcatRel: string | null
  audioRel: string | null
  audioDurationMs: number | null
  createdAt: number
  /** Seconds before offsetMs to include when exporting a clip. */
  preSec: number
  /** Seconds after offsetMs to include when exporting a clip. */
  postSec: number
  /** Mention identity ids. Legacy sessions may contain Slack user ids. */
  mentionUserIds?: string[]
  /** Origin of the marker. Missing in legacy sessions and treated as manual. */
  source?: MarkerSource
  /** Video-space rectangular highlights attached to this marker. */
  annotations?: BugAnnotation[]
}

export interface BugAnnotation {
  id: string
  bugId: string
  kind?: 'rect' | 'ellipse' | 'freehand' | 'arrow' | 'text'
  /** Normalized x coordinate relative to the visible video content. */
  x: number
  /** Normalized y coordinate relative to the visible video content. */
  y: number
  /** Normalized width relative to the visible video content. */
  width: number
  /** Normalized height relative to the visible video content. */
  height: number
  /** Freehand/arrow points in normalized video coordinates. */
  points?: Array<{ x: number; y: number }>
  /** Text annotation content. */
  text?: string
  /** Absolute session time where the annotation starts showing. */
  startMs: number
  /** Absolute session time where the annotation stops showing. */
  endMs: number
  createdAt: number
}

export type PublishTarget = 'local' | 'slack' | 'gitlab' | 'google-drive'
export type SlackThreadMode = 'single-thread' | 'per-marker-thread'

export interface ExportPublishOptions {
  target: PublishTarget
  targets?: PublishTarget[]
  slackThreadMode?: SlackThreadMode
  gitlabMode?: GitLabPublishMode
}

export interface ExportedMarkerFile {
  bugId: string
  videoPath: string
  previewPath: string
  logcatPath: string | null
}

import type { ToolCheck } from '../electron/doctor'    // type-only import is fine across boundaries
export type { ToolCheck }

export interface MdnsEntry {
  name: string                  // service name token
  type: 'pair' | 'connect'      // pair → needs `adb pair` first; connect → ready for `adb connect`
  ipPort: string                // e.g. '192.168.1.42:43615'
}

export interface PcCaptureSource {
  id: string
  name: string
  type: 'screen' | 'window'
  displayId?: string
  thumbnailDataUrl?: string
}

export interface UxPlayReceiverStatus {
  running: boolean
  receiverName: string
  message?: string
  messageKey?: 'device.uxPlayAlreadyRunning' | 'device.uxPlayRunningHint' | 'device.uxPlayStopped'
}

export interface ToolInstallResult {
  ok: boolean
  message: string
  detail: string
}

export interface ToolInstallLog {
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

export interface ExportProgress {
  exportId: string
  phase: 'prepare' | 'video' | 'image' | 'complete' | 'error'
  message: string
  detail?: string
  current: number
  total: number
  clipIndex: number
  clipCount: number
  remaining: number
}

export interface SessionLoadProgress {
  sessionId: string
  phase: 'load' | 'repair' | 'assets' | 'complete' | 'error'
  message: string
  detail?: string
  current: number
  total: number
}

export interface AudioAnalysisProgress {
  sessionId: string
  phase: 'prepare' | 'transcribe' | 'detect' | 'save' | 'complete' | 'error'
  message: string
  detail?: string
  current: number
  total: number
  generated: number
}

export interface AudioAnalysisResult {
  sessionId: string
  transcriptPath: string
  generated: number
  merged: number
  removedAutoMarkers: number
  segments: number
  error?: string
}

export interface DesktopApi {
  doctor():                                                        Promise<ToolCheck[]>
  app: {
    showItemInFolder(path: string):                                Promise<void>
    openPath(path: string):                                        Promise<void>
    getPlatform():                                                 Promise<string>
    openIphoneMirroring():                                         Promise<boolean>
    startUxPlayReceiver():                                         Promise<UxPlayReceiverStatus>
    stopUxPlayReceiver():                                          Promise<UxPlayReceiverStatus>
    getUxPlayReceiver():                                           Promise<UxPlayReceiverStatus>
    installTools(names: ToolCheck['name'][]):                      Promise<ToolInstallResult>
    getPrimaryScreenSource():                                      Promise<{ id: string; name: string } | null>
    listPcCaptureSources():                                        Promise<PcCaptureSource[]>
    showPcCaptureFrame(sourceId: string, color?: 'green' | 'red', displayId?: string): Promise<boolean>
    hidePcCaptureFrame():                                          Promise<void>
    readClipboardText():                                           Promise<string>
  }
  device: {
    list():                                                        Promise<Device[]>
    connect(ip: string, port?: number):                            Promise<{ ok: boolean; message: string }>
    mdnsScan():                                                    Promise<MdnsEntry[]>
    pair(args: { ipPort: string; code: string }):                  Promise<{ ok: boolean; message: string }>
    /** Fetches the user-set device name (Android Settings → About → Device name). Null if unsupported / unset. */
    getUserName(id: string):                                       Promise<string | null>
    listPackages(id: string):                                      Promise<string[]>
    listIosApps():                                                 Promise<IosAppInfo[]>
  }
  session: {
    start(args: {
      deviceId: string; connectionMode: 'usb' | 'wifi' | 'pc';
      buildVersion: string; platform?: string; project?: string; testNote: string; tester?: string; recordPcScreen?: boolean; recordMic?: boolean; pcCaptureSourceName?: string; iosLogCapture?: boolean; iosLogBundleId?: string; iosLogAppName?: string; iosLogLaunchApp?: boolean; iosLogFilter?: string; iosLogMinLevel?: string; logcatPackageName?: string; logcatTagFilter?: string; logcatMinPriority?: string; logcatLineCount?: number;
    }):                                                            Promise<Session>
    chooseVideoFile():                                             Promise<string | null>
    chooseAudioFile():                                             Promise<string | null>
    importVideo(args: { inputPath: string; audioPath?: string; audioStartOffsetMs?: number; buildVersion: string; platform?: string; project?: string; testNote: string; tester?: string; analyzeAudio?: boolean }): Promise<Session>
    markBug(args?: { severity?: BugSeverity; note?: string }):     Promise<Bug>
    stop():                                                        Promise<Session>
    discard(sessionId: string):                                    Promise<void>
    list():                                                        Promise<Session[]>
    get(id: string):                                               Promise<{ session: Session; bugs: Bug[] } | null>
    openProject():                                                 Promise<Session | null>
    updateMetadata(id: string, patch: { buildVersion: string; platform?: string; project?: string; testNote: string; tester: string }): Promise<void>
    updateMicAudioOffset(id: string, startOffsetMs: number):       Promise<Session>
    savePcRecording(args: { sessionId: string; base64: string; mimeType: string; durationMs: number }): Promise<string>
    saveMicRecording(args: { sessionId: string; base64: string; mimeType: string; durationMs: number; startOffsetMs?: number }): Promise<string>
  }
  bug: {
    addMarker(args: { sessionId: string; offsetMs: number; severity?: BugSeverity; note?: string; preSec?: number; postSec?: number }): Promise<Bug>
    getLogcatPreview(args: { sessionId: string; relPath: string; maxLines?: number }): Promise<string | null>
    update(id: string, patch: { note: string; severity: BugSeverity; preSec: number; postSec: number; mentionUserIds?: string[] }): Promise<void>
    addAnnotation(args: { bugId: string; kind?: BugAnnotation['kind']; x: number; y: number; width: number; height: number; points?: BugAnnotation['points']; text?: string; startMs: number; endMs: number }): Promise<BugAnnotation>
    updateAnnotation(id: string, patch: Partial<Pick<BugAnnotation, 'kind' | 'x' | 'y' | 'width' | 'height' | 'points' | 'text' | 'startMs' | 'endMs'>>): Promise<void>
    deleteAnnotation(id: string): Promise<void>
    saveAudio(args: { sessionId: string; bugId: string; base64: string; durationMs: number; mimeType: string }): Promise<void>
    transcribeAudio(args: { sessionId: string; bugId: string; base64: string; durationMs: number; mimeType: string }): Promise<{ text: string }>
    delete(id: string):                                            Promise<void>
    /** Extracts a clip using the bug's preSec/postSec window. Returns saved path or null if cancelled. */
    exportClip(args: { sessionId: string; bugId: string; exportId?: string; reportTitle?: string; includeLogcat?: boolean; includeMicTrack?: boolean; includeOriginalFiles?: boolean; mergeOriginalAudio?: boolean; publish?: ExportPublishOptions }): Promise<string | null>
    exportClips(args: { sessionId: string; bugIds: string[]; exportId?: string; reportTitle?: string; includeLogcat?: boolean; includeMicTrack?: boolean; includeOriginalFiles?: boolean; mergeOriginalAudio?: boolean; publish?: ExportPublishOptions }): Promise<string[] | null>
    cancelExport(exportId: string):                                Promise<void>
  }
  hotkey: {
    /** Globally enable or disable the bug-mark hotkey. Used to suppress capture while typing in the dialog. */
    setEnabled(enabled: boolean):                                  Promise<void>
  }
  settings: {
    get():                                                         Promise<AppSettings>
    setExportRoot(path: string):                                   Promise<AppSettings>
    setHotkeys(hotkeys: HotkeySettings):                           Promise<AppSettings>
    setSlack(settings: SlackPublishSettings):                       Promise<AppSettings>
    setGitLab(settings: GitLabPublishSettings):                      Promise<AppSettings>
    connectGitLabOAuth(settings: GitLabPublishSettings):              Promise<AppSettings>
    cancelGitLabOAuth():                                             Promise<void>
    listGitLabProjects(settings: GitLabPublishSettings):              Promise<GitLabProject[]>
    setGoogle(settings: GooglePublishSettings):                       Promise<AppSettings>
    connectGoogleOAuth(settings: GooglePublishSettings):              Promise<AppSettings>
    cancelGoogleOAuth():                                             Promise<void>
    listGoogleDriveFolders(settings: GooglePublishSettings):          Promise<GoogleDriveFolder[]>
    createGoogleDriveFolder(settings: GooglePublishSettings, name: string): Promise<GoogleDriveFolder>
    listGoogleSpreadsheets(settings: GooglePublishSettings):          Promise<GoogleSpreadsheet[]>
    listGoogleSheetTabs(settings: GooglePublishSettings):             Promise<GoogleSheetTab[]>
    setMentionIdentities(identities: MentionIdentity[]):             Promise<AppSettings>
    importMentionIdentities():                                       Promise<AppSettings | null>
    exportMentionIdentities():                                       Promise<string | null>
    refreshSlackUsers():                                            Promise<AppSettings>
    refreshSlackChannels():                                         Promise<AppSettings>
    startSlackUserOAuth(settings: SlackPublishSettings):             Promise<AppSettings>
    refreshGitLabUsers():                                           Promise<AppSettings>
    setLocale(locale: AppLocale):                                  Promise<AppSettings>
    setSeverities(severities: SeveritySettings):                   Promise<AppSettings>
    setAudioAnalysis(settings: AudioAnalysisSettings):             Promise<AppSettings>
    setCommonSession(settings: CommonSessionSettings):             Promise<AppSettings>
    chooseWhisperModel():                                          Promise<AppSettings | null>
    chooseExportRoot():                                            Promise<AppSettings | null>
  }
  audioAnalysis: {
    analyzeSession(sessionId: string):                             Promise<AudioAnalysisResult>
    cancel(sessionId: string):                                     Promise<void>
  }
  /** Renderer subscribes to this to know when the global bug-mark hotkey fired in main. */
  onBugMarkRequested(cb: (severity: BugSeverity) => void):         () => void   // returns unsubscribe
  /** Renderer subscribes to interrupted sessions, e.g. Android disconnect while recording. */
  onSessionInterrupted(cb: (session: Session, reason: string) => void): () => void
  /** Renderer subscribes to long-running export progress. */
  onBugExportProgress(cb: (progress: ExportProgress) => void):    () => void
  /** Renderer subscribes to potentially slow session loading/asset repair progress. */
  onSessionLoadProgress(cb: (progress: SessionLoadProgress) => void): () => void
  /** Renderer subscribes to offline mic transcription and auto-marker progress. */
  onAudioAnalysisProgress(cb: (progress: AudioAnalysisProgress) => void): () => void
  /** Renderer subscribes to live output from one-click tool installation. */
  onToolInstallLog(cb: (log: ToolInstallLog) => void): () => void
  onSlackOAuthCompleted(cb: (result: { ok: boolean; settings?: AppSettings; error?: string }) => void): () => void
  /** Resolves an asset under a session dir to its absolute path. Used by the renderer to construct loupe-file:// URLs for video.mp4, screenshots, etc. */
  _resolveAssetPath(sessionId: string, relPath: string): Promise<string>
}
