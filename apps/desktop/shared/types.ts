export interface Device {
  id: string                              // adb serial OR `ip:port` for wifi
  type: 'usb' | 'wifi'
  state: 'device' | 'offline' | 'unauthorized'
  model?: string
  androidVersion?: string
  /** User-set device name from Android Settings (Android 12+). May be unavailable on older devices. */
  userDeviceName?: string
}

export type SessionStatus = 'recording' | 'draft'
export type BugSeverity =
  | 'note'
  | 'major'
  | 'normal'
  | 'minor'
  | 'improvement'
  | 'custom1'
  | 'custom2'
  | 'custom3'
  | 'custom4'
export type HotkeySeverity = 'improvement' | 'minor' | 'normal' | 'major'
export type AppLocale = 'system' | 'en' | 'zh-TW' | 'zh-CN' | 'ja' | 'ko' | 'es'
export type SeveritySettings = Record<BugSeverity, { label: string; color: string }>

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

export type GitLabPublishMode = 'single-issue' | 'per-marker-issue'

export interface GitLabPublishSettings {
  baseUrl: string
  token: string
  projectId: string
  mode: GitLabPublishMode
  labels?: string[]
  confidential?: boolean
  mentionUsernames?: string[]
}

export interface AppSettings {
  exportRoot: string
  hotkeys: HotkeySettings
  locale: AppLocale
  severities: SeveritySettings
  slack: SlackPublishSettings
  gitlab: GitLabPublishSettings
}

export interface Session {
  id: string
  buildVersion: string
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
  /** Slack user IDs to mention when this marker is published. */
  mentionUserIds?: string[]
}

export type PublishTarget = 'local' | 'slack' | 'gitlab'
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

export interface DesktopApi {
  doctor():                                                        Promise<ToolCheck[]>
  app: {
    showItemInFolder(path: string):                                Promise<void>
    openPath(path: string):                                        Promise<void>
    getPrimaryScreenSource():                                      Promise<{ id: string; name: string } | null>
    listPcCaptureSources():                                        Promise<PcCaptureSource[]>
    showPcCaptureFrame(sourceId: string, color?: 'green' | 'red', displayId?: string): Promise<boolean>
    hidePcCaptureFrame():                                          Promise<void>
  }
  device: {
    list():                                                        Promise<Device[]>
    connect(ip: string, port?: number):                            Promise<{ ok: boolean; message: string }>
    mdnsScan():                                                    Promise<MdnsEntry[]>
    pair(args: { ipPort: string; code: string }):                  Promise<{ ok: boolean; message: string }>
    /** Fetches the user-set device name (Android Settings → About → Device name). Null if unsupported / unset. */
    getUserName(id: string):                                       Promise<string | null>
    listPackages(id: string):                                      Promise<string[]>
  }
  session: {
    start(args: {
      deviceId: string; connectionMode: 'usb' | 'wifi' | 'pc';
      buildVersion: string; testNote: string; tester?: string; recordPcScreen?: boolean; pcCaptureSourceName?: string; logcatPackageName?: string; logcatTagFilter?: string; logcatMinPriority?: string; logcatLineCount?: number;
    }):                                                            Promise<Session>
    markBug(args?: { severity?: BugSeverity; note?: string }):     Promise<Bug>
    stop():                                                        Promise<Session>
    discard(sessionId: string):                                    Promise<void>
    list():                                                        Promise<Session[]>
    get(id: string):                                               Promise<{ session: Session; bugs: Bug[] } | null>
    openProject():                                                 Promise<Session | null>
    updateMetadata(id: string, patch: { buildVersion: string; testNote: string; tester: string }): Promise<void>
    savePcRecording(args: { sessionId: string; base64: string; mimeType: string; durationMs: number }): Promise<string>
    saveMicRecording(args: { sessionId: string; base64: string; mimeType: string; durationMs: number }): Promise<string>
  }
  bug: {
    addMarker(args: { sessionId: string; offsetMs: number; severity?: BugSeverity; note?: string }): Promise<Bug>
    getLogcatPreview(args: { sessionId: string; relPath: string; maxLines?: number }): Promise<string | null>
    update(id: string, patch: { note: string; severity: BugSeverity; preSec: number; postSec: number; mentionUserIds?: string[] }): Promise<void>
    saveAudio(args: { sessionId: string; bugId: string; base64: string; durationMs: number; mimeType: string }): Promise<void>
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
    refreshSlackUsers():                                            Promise<AppSettings>
    refreshSlackChannels():                                         Promise<AppSettings>
    startSlackUserOAuth(settings: SlackPublishSettings):             Promise<AppSettings>
    setLocale(locale: AppLocale):                                  Promise<AppSettings>
    setSeverities(severities: SeveritySettings):                   Promise<AppSettings>
    chooseExportRoot():                                            Promise<AppSettings | null>
  }
  /** Renderer subscribes to this to know when the global bug-mark hotkey fired in main. */
  onBugMarkRequested(cb: (severity: BugSeverity) => void):         () => void   // returns unsubscribe
  /** Renderer subscribes to interrupted sessions, e.g. Android disconnect while recording. */
  onSessionInterrupted(cb: (session: Session, reason: string) => void): () => void
  /** Renderer subscribes to long-running export progress. */
  onBugExportProgress(cb: (progress: ExportProgress) => void):    () => void
  /** Renderer subscribes to potentially slow session loading/asset repair progress. */
  onSessionLoadProgress(cb: (progress: SessionLoadProgress) => void): () => void
  onSlackOAuthCompleted(cb: (result: { ok: boolean; settings?: AppSettings; error?: string }) => void): () => void
  /** Resolves an asset under a session dir to its absolute path. Used by the renderer to construct loupe-file:// URLs for video.mp4, screenshots, etc. */
  _resolveAssetPath(sessionId: string, relPath: string): Promise<string>
}
