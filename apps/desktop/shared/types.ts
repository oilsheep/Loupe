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
export type BugSeverity = 'note' | 'major' | 'normal' | 'minor' | 'improvement'
export type HotkeySeverity = 'improvement' | 'minor' | 'normal' | 'major'

export interface HotkeySettings {
  improvement: string
  minor: string
  normal: string
  major: string
}

export interface Session {
  id: string
  buildVersion: string
  testNote: string
  tester: string
  deviceId: string
  deviceModel: string
  androidVersion: string
  connectionMode: 'usb' | 'wifi'
  status: SessionStatus
  durationMs: number | null
  startedAt: number             // epoch ms
  endedAt: number | null
  videoPath: string | null
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
}

import type { ToolCheck } from '../electron/doctor'    // type-only import is fine across boundaries
export type { ToolCheck }

export interface MdnsEntry {
  name: string                  // service name token
  type: 'pair' | 'connect'      // pair → needs `adb pair` first; connect → ready for `adb connect`
  ipPort: string                // e.g. '192.168.1.42:43615'
}

export interface DesktopApi {
  doctor():                                                        Promise<ToolCheck[]>
  app: {
    showItemInFolder(path: string):                                Promise<void>
    openPath(path: string):                                        Promise<void>
  }
  device: {
    list():                                                        Promise<Device[]>
    connect(ip: string, port?: number):                            Promise<{ ok: boolean; message: string }>
    mdnsScan():                                                    Promise<MdnsEntry[]>
    pair(args: { ipPort: string; code: string }):                  Promise<{ ok: boolean; message: string }>
    /** Fetches the user-set device name (Android Settings → About → Device name). Null if unsupported / unset. */
    getUserName(id: string):                                       Promise<string | null>
  }
  session: {
    start(args: {
      deviceId: string; connectionMode: 'usb' | 'wifi';
      buildVersion: string; testNote: string; tester?: string;
    }):                                                            Promise<Session>
    markBug(args?: { severity?: BugSeverity; note?: string }):     Promise<Bug>
    stop():                                                        Promise<Session>
    discard(sessionId: string):                                    Promise<void>
    list():                                                        Promise<Session[]>
    get(id: string):                                               Promise<{ session: Session; bugs: Bug[] } | null>
    openProject():                                                 Promise<Session | null>
    updateMetadata(id: string, patch: { testNote: string; tester: string }): Promise<void>
  }
  bug: {
    addMarker(args: { sessionId: string; offsetMs: number; severity?: BugSeverity; note?: string }): Promise<Bug>
    update(id: string, patch: { note: string; severity: BugSeverity; preSec: number; postSec: number }): Promise<void>
    saveAudio(args: { sessionId: string; bugId: string; base64: string; durationMs: number; mimeType: string }): Promise<void>
    delete(id: string):                                            Promise<void>
    /** Extracts a clip using the bug's preSec/postSec window. Returns saved path or null if cancelled. */
    exportClip(args: { sessionId: string; bugId: string }):        Promise<string | null>
    exportClips(args: { sessionId: string; bugIds: string[] }):    Promise<string[] | null>
  }
  hotkey: {
    /** Globally enable or disable the bug-mark hotkey. Used to suppress capture while typing in the dialog. */
    setEnabled(enabled: boolean):                                  Promise<void>
  }
  settings: {
    get():                                                         Promise<{ exportRoot: string; hotkeys: HotkeySettings }>
    setExportRoot(path: string):                                   Promise<{ exportRoot: string; hotkeys: HotkeySettings }>
    setHotkeys(hotkeys: HotkeySettings):                           Promise<{ exportRoot: string; hotkeys: HotkeySettings }>
    chooseExportRoot():                                            Promise<{ exportRoot: string; hotkeys: HotkeySettings } | null>
  }
  /** Renderer subscribes to this to know when the global bug-mark hotkey fired in main. */
  onBugMarkRequested(cb: (severity: BugSeverity) => void):         () => void   // returns unsubscribe
  /** Resolves an asset under a session dir to its absolute path. Used by the renderer to construct loupe-file:// URLs for video.mp4, screenshots, etc. */
  _resolveAssetPath(sessionId: string, relPath: string): Promise<string>
}
