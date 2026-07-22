import type { RecordingMaxSize } from '@shared/types'

export function buildDesktopVideoConstraints(sourceId: string, maxSize: RecordingMaxSize) {
  return {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
      minFrameRate: 30,
      maxFrameRate: 30,
      ...(maxSize === 'original' ? {} : {
        maxWidth: maxSize,
        maxHeight: maxSize,
      }),
    },
  }
}
