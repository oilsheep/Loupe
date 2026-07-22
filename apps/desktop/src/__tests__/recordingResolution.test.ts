import { describe, expect, it } from 'vitest'
import { buildDesktopVideoConstraints } from '@/lib/recordingResolution'

describe('buildDesktopVideoConstraints', () => {
  it.each([1280, 1080, 720] as const)('caps both dimensions at %i px', maxSize => {
    expect(buildDesktopVideoConstraints('screen:1', maxSize)).toEqual({
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: 'screen:1',
        minFrameRate: 30,
        maxFrameRate: 30,
        maxWidth: maxSize,
        maxHeight: maxSize,
      },
    })
  })

  it('omits dimension caps for original-size recording', () => {
    expect(buildDesktopVideoConstraints('screen:1', 'original')).toEqual({
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: 'screen:1',
        minFrameRate: 30,
        maxFrameRate: 30,
      },
    })
  })
})
