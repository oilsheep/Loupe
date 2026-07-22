import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@shared/types'
import { Recording } from '@/routes/Recording'

const { apiMock, goDraft } = vi.hoisted(() => ({
  goDraft: vi.fn(),
  apiMock: {
    session: {
      get: vi.fn().mockResolvedValue(null),
      markBug: vi.fn(),
      appendPcRecordingChunk: vi.fn(),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' },
        severities: {
          note: { label: 'default', color: '#a1a1aa' },
          major: { label: 'Critical', color: '#ff4d4f' },
          normal: { label: 'Bug', color: '#f59e0b' },
          minor: { label: 'Polish', color: '#22b8f0' },
          improvement: { label: 'Note', color: '#22c55e' },
        },
      }),
    },
    app: {
      readClipboardText: vi.fn().mockResolvedValue(''),
    },
    audioAnalysis: {},
    onBugMarkRequested: vi.fn(() => () => {}),
    onSessionInterrupted: vi.fn(() => () => {}),
    onAudioAnalysisProgress: vi.fn(() => () => {}),
  },
}))

vi.mock('@/lib/api', () => ({ api: apiMock }))
vi.mock('@/lib/store', () => ({ useApp: (selector: any) => selector({ goDraft }) }))
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/BugList', () => ({ BugList: () => null }))
vi.mock('@/components/AudioAnalysisWaitDialog', () => ({ AudioAnalysisWaitDialog: () => null }))

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true)
  state = 'recording'
  mimeType: string
  ondataavailable: ((event: BlobEvent) => void) | null = null
  start = vi.fn()

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? 'video/webm'
  }
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    buildVersion: '1.0',
    testNote: '',
    tester: '',
    deviceId: 'screen:1',
    deviceModel: 'Screen 1',
    androidVersion: 'Windows',
    connectionMode: 'pc',
    status: 'recording',
    durationMs: null,
    startedAt: Date.now(),
    endedAt: null,
    videoPath: null,
    pcRecordingEnabled: true,
    pcVideoPath: null,
    micAudioPath: null,
    micAudioDurationMs: null,
    micAudioStartOffsetMs: null,
    micRecordingRequested: false,
    systemAudioRecordingRequested: false,
    recordingMaxSize: 1280,
    ...overrides,
  }
}

describe('Recording desktop capture constraints', () => {
  const stream = {
    getTracks: vi.fn(() => [{ stop: vi.fn() }]),
    getAudioTracks: vi.fn(() => []),
  } as unknown as MediaStream
  const getUserMedia = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.session.get.mockResolvedValue(null)
    apiMock.settings.get.mockResolvedValue({
      hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' },
      severities: {
        note: { label: 'default', color: '#a1a1aa' },
        major: { label: 'Critical', color: '#ff4d4f' },
        normal: { label: 'Bug', color: '#f59e0b' },
        minor: { label: 'Polish', color: '#22b8f0' },
        improvement: { label: 'Note', color: '#22c55e' },
      },
    })
    apiMock.app.readClipboardText.mockResolvedValue('')
    apiMock.onBugMarkRequested.mockImplementation(() => () => {})
    apiMock.onSessionInterrupted.mockImplementation(() => () => {})
    apiMock.onAudioAnalysisProgress.mockImplementation(() => () => {})
    getUserMedia.mockResolvedValue(stream)
    Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'Win32' })
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: MockMediaRecorder })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('passes the selected limit to a Windows screen capture', async () => {
    render(<Recording session={session({ recordingMaxSize: 1080 })} />)

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        mandatory: expect.objectContaining({
          chromeMediaSourceId: 'screen:1',
          maxWidth: 1080,
          maxHeight: 1080,
        }),
      },
    }))
  })

  it('passes the selected limit to a macOS iOS-mirroring window capture', async () => {
    Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'MacIntel' })
    render(<Recording session={session({ deviceId: 'window:42', androidVersion: 'macOS', recordingMaxSize: 720 })} />)

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        mandatory: expect.objectContaining({
          chromeMediaSourceId: 'window:42',
          maxWidth: 720,
          maxHeight: 720,
        }),
      },
    }))
  })

  it('omits dimension caps for original-size desktop capture', async () => {
    render(<Recording session={session({ recordingMaxSize: 'original' })} />)

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    const mandatory = getUserMedia.mock.calls[0][0].video.mandatory
    expect(mandatory).not.toHaveProperty('maxWidth')
    expect(mandatory).not.toHaveProperty('maxHeight')
  })

  it('reuses the bounded video constraints when Windows system audio falls back', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('loopback unavailable')).mockResolvedValueOnce(stream)
    render(<Recording session={session({ systemAudioRecordingRequested: true, recordingMaxSize: 1280 })} />)

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
    const firstVideo = getUserMedia.mock.calls[0][0].video
    const fallbackVideo = getUserMedia.mock.calls[1][0].video
    expect(firstVideo).toEqual(expect.objectContaining({
      mandatory: expect.objectContaining({ maxWidth: 1280, maxHeight: 1280 }),
    }))
    expect(fallbackVideo).toEqual(firstVideo)
    expect(getUserMedia.mock.calls[1][0].audio).toBe(false)
  })
})
