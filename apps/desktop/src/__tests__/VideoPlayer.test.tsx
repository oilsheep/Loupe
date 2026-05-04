import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { VideoPlayer } from '@/components/VideoPlayer'
import type { Bug, DesktopApi } from '@shared/types'

const bug = (over: Partial<Bug> = {}): Bug => ({
  id: 'b1', sessionId: 's1', offsetMs: 10_000, severity: 'normal', note: '',
  screenshotRel: null, logcatRel: null, createdAt: 0,
  audioRel: null, audioDurationMs: null,
  preSec: 3, postSec: 7, ...over,
})

function fakeApi(): DesktopApi {
  return {
    doctor: vi.fn() as any,
    app: {
      showItemInFolder: vi.fn() as any,
      openPath: vi.fn() as any,
      getPlatform: vi.fn().mockResolvedValue('darwin') as any,
      getVersion: vi.fn().mockResolvedValue('0.5.0') as any,
      openIphoneMirroring: vi.fn().mockResolvedValue(true) as any,
      startUxPlayReceiver: vi.fn().mockResolvedValue({ running: true, receiverName: 'Loupe iOS' }) as any,
      stopUxPlayReceiver: vi.fn().mockResolvedValue({ running: false, receiverName: 'Loupe iOS' }) as any,
      getUxPlayReceiver: vi.fn().mockResolvedValue({ running: false, receiverName: 'Loupe iOS' }) as any,
      installTools: vi.fn().mockResolvedValue({ ok: true, message: 'done', detail: '' }) as any,
      getPrimaryScreenSource: vi.fn().mockResolvedValue(null) as any,
      listPcCaptureSources: vi.fn().mockResolvedValue([]) as any,
      showPcCaptureFrame: vi.fn().mockResolvedValue(false) as any,
      hidePcCaptureFrame: vi.fn().mockResolvedValue(undefined) as any,
      readClipboardText: vi.fn().mockResolvedValue('') as any,
    },
    device: {} as any,
    session: { updateMetadata: vi.fn() as any } as any,
    bug: {} as any,
    hotkey: { setEnabled: vi.fn().mockResolvedValue(undefined) } as any,
    audioAnalysis: { analyzeSession: vi.fn() as any, cancel: vi.fn() as any },
    settings: { get: vi.fn() as any, setExportRoot: vi.fn() as any, setHotkeys: vi.fn() as any, setSlack: vi.fn() as any, setGitLab: vi.fn() as any, connectGitLabOAuth: vi.fn() as any, cancelGitLabOAuth: vi.fn() as any, listGitLabProjects: vi.fn() as any, setGoogle: vi.fn() as any, connectGoogleOAuth: vi.fn() as any, cancelGoogleOAuth: vi.fn() as any, listGoogleDriveFolders: vi.fn() as any, createGoogleDriveFolder: vi.fn() as any, listGoogleSpreadsheets: vi.fn() as any, listGoogleSheetTabs: vi.fn() as any, setMentionIdentities: vi.fn() as any, importMentionIdentities: vi.fn() as any, exportMentionIdentities: vi.fn() as any, refreshSlackUsers: vi.fn() as any, refreshSlackChannels: vi.fn() as any, startSlackUserOAuth: vi.fn() as any, refreshGitLabUsers: vi.fn() as any, setLocale: vi.fn() as any, setSeverities: vi.fn() as any, setAudioAnalysis: vi.fn() as any, setCommonSession: vi.fn() as any, setRecordingPreferences: vi.fn() as any, chooseWhisperModel: vi.fn() as any, chooseExportRoot: vi.fn() as any },
    onBugMarkRequested: () => () => {},
    onSessionInterrupted: () => () => {},
    onBugExportProgress: () => () => {},
    onSessionLoadProgress: () => () => {},
    onAudioAnalysisProgress: () => () => {},
    onToolInstallLog: () => () => {},
    onSlackOAuthCompleted: () => () => {},
    _resolveAssetPath: vi.fn().mockResolvedValue('/abs/path') as any,
  }
}

describe('VideoPlayer', () => {
  it('renders selected clip window on the timeline', () => {
    render(
      <VideoPlayer
        api={fakeApi()}
        src="file:///tmp/video.mp4"
        bugs={[bug()]}
        durationMs={20_000}
        selectedBugId="b1"
        onMarkerClick={vi.fn()}
      />
    )

    const windowEl = screen.getByTestId('selected-clip-window')
    expect(windowEl).toBeTruthy()
    expect(windowEl.getAttribute('style')).toContain('left: 35%')
    expect(windowEl.getAttribute('style')).toContain('width: 50%')
  })

  it('clicking the timeline seeks the video by percentage', () => {
    render(
      <VideoPlayer
        api={fakeApi()}
        src="file:///tmp/video.mp4"
        bugs={[bug()]}
        durationMs={20_000}
        selectedBugId={null}
        onMarkerClick={vi.fn()}
      />
    )

    const timeline = screen.getByTestId('timeline')
    const video = screen.getByTestId('video-el') as HTMLVideoElement
    video.pause = vi.fn()
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, bottom: 10, right: 200, height: 10, x: 0, y: 0, toJSON: () => {} }),
    })

    fireEvent.click(timeline, { clientX: 50 })
    expect(video.currentTime).toBe(5)
    expect(screen.getByTestId('playhead').getAttribute('style')).toContain('left: 25%')
  })

  it('marker clicks do not trigger timeline seek', () => {
    const onMarkerClick = vi.fn()
    render(
      <VideoPlayer
        api={fakeApi()}
        src="file:///tmp/video.mp4"
        bugs={[bug()]}
        durationMs={20_000}
        selectedBugId={null}
        onMarkerClick={onMarkerClick}
      />
    )

    const timeline = screen.getByTestId('timeline')
    const video = screen.getByTestId('video-el') as HTMLVideoElement
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, bottom: 10, right: 200, height: 10, x: 0, y: 0, toJSON: () => {} }),
    })

    fireEvent.click(screen.getByTestId('marker-b1'), { clientX: 50 })
    expect(onMarkerClick).toHaveBeenCalled()
    expect(video.currentTime).toBe(0)
  })

  it('dragging the selected video creates an annotation box', () => {
    const onAnnotationAdd = vi.fn()
    render(
      <VideoPlayer
        api={fakeApi()}
        src="file:///tmp/video.mp4"
        bugs={[bug({ offsetMs: 1000, preSec: 1, postSec: 7 })]}
        durationMs={20_000}
        selectedBugId="b1"
        onMarkerClick={vi.fn()}
        onAnnotationAdd={onAnnotationAdd}
      />
    )

    const video = screen.getByTestId('video-el') as HTMLVideoElement
    Object.defineProperty(video, 'videoWidth', { value: 1000 })
    Object.defineProperty(video, 'videoHeight', { value: 500 })
    Object.defineProperty(video, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 1000, top: 0, bottom: 500, right: 1000, height: 500, x: 0, y: 0, toJSON: () => {} }),
    })
    const overlay = screen.getByTestId('annotation-overlay').firstElementChild as HTMLDivElement
    overlay.setPointerCapture = vi.fn()

    fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 300, clientY: 250 })
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 300, clientY: 250 })

    expect(onAnnotationAdd).toHaveBeenCalled()
    const [, rect] = onAnnotationAdd.mock.calls[0]
    expect(rect.x).toBeCloseTo(0.1)
    expect(rect.y).toBeCloseTo(0.2)
    expect(rect.width).toBeCloseTo(0.2)
    expect(rect.height).toBeCloseTo(0.3)
  })

  it('renders selected marker annotation durations on the timeline', () => {
    render(
      <VideoPlayer
        api={fakeApi()}
        src="file:///tmp/video.mp4"
        bugs={[bug({ annotations: [{ id: 'a1', bugId: 'b1', x: 0.1, y: 0.1, width: 0.2, height: 0.2, startMs: 9000, endMs: 12000, createdAt: 1 }] })]}
        durationMs={20_000}
        selectedBugId="b1"
        selectedAnnotationId="a1"
        onMarkerClick={vi.fn()}
      />
    )

    const annotationWindow = screen.getByTestId('annotation-window-a1')
    expect(annotationWindow.getAttribute('style')).toContain('left: 45%')
    expect(annotationWindow.getAttribute('style')).toContain('width: 15%')
  })
})
