export type RecordingConnectionMode = 'usb' | 'wifi' | 'pc'

export interface RecordingSourceSelection {
  id: string
  mode: RecordingConnectionMode
  label?: string
}

export type SelectRecordingSource = (id: string, mode: RecordingConnectionMode, label?: string) => void
