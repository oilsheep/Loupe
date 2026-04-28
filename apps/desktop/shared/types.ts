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
