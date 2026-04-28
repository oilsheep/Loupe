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
    update(id: string, patch: { note: string; severity: BugSeverity }): Promise<void>
    delete(id: string):                                            Promise<void>
    /** Extracts a clip [offset-5s, offset+10s] to user-chosen path. Returns saved path or null if cancelled. */
    exportClip(args: { sessionId: string; bugId: string }):        Promise<string | null>
  }
  /** Renderer subscribes to this to know when global F8 fired in main. */
  onBugMarkRequested(cb: () => void):                              () => void   // returns unsubscribe
  /** Returns the absolute filesystem path of <sessionId>/video.mp4. Used by the renderer to construct a loupe-file:// URL. */
  _resolveVideoPath(sessionId: string): Promise<string>
}
