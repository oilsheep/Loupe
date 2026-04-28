export interface Device {
  id: string                              // adb serial OR `ip:port` for wifi
  type: 'usb' | 'wifi'
  state: 'device' | 'offline' | 'unauthorized'
  model?: string
  androidVersion?: string
}

export type SessionStatus = 'recording' | 'draft'
export type BugSeverity = 'major' | 'normal'

export interface Session {
  id: string
  buildVersion: string
  testNote: string
  deviceId: string
  deviceModel: string
  androidVersion: string
  connectionMode: 'usb' | 'wifi'
  status: SessionStatus
  durationMs: number | null
  startedAt: number             // epoch ms
  endedAt: number | null
}

export interface Bug {
  id: string
  sessionId: string
  offsetMs: number              // ms since session start (= scrcpy elapsed at mark time)
  severity: BugSeverity
  note: string
  screenshotRel: string | null  // path relative to session dir, e.g. "screenshots/abc.png"
  logcatRel: string | null
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
  device: {
    list():                                                        Promise<Device[]>
    connect(ip: string, port?: number):                            Promise<{ ok: boolean; message: string }>
    mdnsScan():                                                    Promise<MdnsEntry[]>
    pair(args: { ipPort: string; code: string }):                  Promise<{ ok: boolean; message: string }>
  }
  session: {
    start(args: {
      deviceId: string; connectionMode: 'usb' | 'wifi';
      buildVersion: string; testNote: string;
    }):                                                            Promise<Session>
    markBug(args: { severity: BugSeverity; note: string }):        Promise<Bug>
    stop():                                                        Promise<Session>
    discard(sessionId: string):                                    Promise<void>
    list():                                                        Promise<Session[]>
    get(id: string):                                               Promise<{ session: Session; bugs: Bug[] } | null>
  }
  bug: {
    update(id: string, patch: { note: string; severity: BugSeverity; preSec: number; postSec: number }): Promise<void>
    delete(id: string):                                            Promise<void>
    /** Extracts a clip using the bug's preSec/postSec window. Returns saved path or null if cancelled. */
    exportClip(args: { sessionId: string; bugId: string }):        Promise<string | null>
  }
  hotkey: {
    /** Globally enable or disable the bug-mark hotkey. Used to suppress capture while typing in the dialog. */
    setEnabled(enabled: boolean):                                  Promise<void>
  }
  /** Renderer subscribes to this to know when the global bug-mark hotkey fired in main. */
  onBugMarkRequested(cb: () => void):                              () => void   // returns unsubscribe
  /** Resolves an asset under a session dir to its absolute path. Used by the renderer to construct loupe-file:// URLs for video.mp4, screenshots, etc. */
  _resolveAssetPath(sessionId: string, relPath: string): Promise<string>
}
