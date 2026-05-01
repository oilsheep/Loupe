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
      getPrimaryScreenSource: vi.fn().mockResolvedValue(null) as any,
      listPcCaptureSources: vi.fn().mockResolvedValue([]) as any,
      showPcCaptureFrame: vi.fn().mockResolvedValue(false) as any,
      hidePcCaptureFrame: vi.fn().mockResolvedValue(undefined) as any,
    },
    device: {} as any,
    session: { updateMetadata: vi.fn() as any } as any,
    bug: {} as any,
    hotkey: { setEnabled: vi.fn().mockResolvedValue(undefined) } as any,
    audioAnalysis: { analyzeSession: vi.fn() as any, cancel: vi.fn() as any },
    settings: { get: vi.fn() as any, setExportRoot: vi.fn() as any, setHotkeys: vi.fn() as any, setSlack: vi.fn() as any, setGitLab: vi.fn() as any, connectGitLabOAuth: vi.fn() as any, cancelGitLabOAuth: vi.fn() as any, listGitLabProjects: vi.fn() as any, setGoogle: vi.fn() as any, connectGoogleOAuth: vi.fn() as any, cancelGoogleOAuth: vi.fn() as any, listGoogleDriveFolders: vi.fn() as any, createGoogleDriveFolder: vi.fn() as any, listGoogleSpreadsheets: vi.fn() as any, listGoogleSheetTabs: vi.fn() as any, setMentionIdentities: vi.fn() as any, importMentionIdentities: vi.fn() as any, exportMentionIdentities: vi.fn() as any, refreshSlackUsers: vi.fn() as any, refreshSlackChannels: vi.fn() as any, startSlackUserOAuth: vi.fn() as any, refreshGitLabUsers: vi.fn() as any, setLocale: vi.fn() as any, setSeverities: vi.fn() as any, setAudioAnalysis: vi.fn() as any, chooseWhisperModel: vi.fn() as any, chooseExportRoot: vi.fn() as any },
    onBugMarkRequested: () => () => {},
    onSessionInterrupted: () => () => {},
    onBugExportProgress: () => () => {},
    onSessionLoadProgress: () => () => {},
    onAudioAnalysisProgress: () => () => {},
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
})

