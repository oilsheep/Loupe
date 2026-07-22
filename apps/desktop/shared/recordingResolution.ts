import type { RecordingMaxSize } from './types'

export const RECORDING_MAX_SIZES = [1280, 1080, 720, 'original'] as const
export const DEFAULT_RECORDING_MAX_SIZE: RecordingMaxSize = 1280

export function normalizeRecordingMaxSize(value: unknown): RecordingMaxSize {
  return RECORDING_MAX_SIZES.includes(value as RecordingMaxSize)
    ? value as RecordingMaxSize
    : DEFAULT_RECORDING_MAX_SIZE
}
