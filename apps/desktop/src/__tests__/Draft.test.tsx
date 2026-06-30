import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AppSettings, Bug, DesktopApi, Session } from '@shared/types'
import { Draft } from '@/routes/Draft'

const { fakeApi, settings } = vi.hoisted(() => {
  const settings: AppSettings = {
    exportRoot: '/exports',
    hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' },
    locale: 'en',
    severities: {
      note: { label: 'Note', color: '#22c55e' },
      major: { label: 'Critical', color: '#ff4d4f' },
      normal: { label: 'Bug', color: '#f59e0b' },
      minor: { label: 'Polish', color: '#22b8f0' },
      improvement: { label: 'Note', color: '#22c55e' },
      custom1: { label: '', color: '#8b5cf6' },
      custom2: { label: '', color: '#ec4899' },
      custom3: { label: '', color: '#14b8a6' },
      custom4: { label: '', color: '#eab308' },
    },
    audioAnalysis: { enabled: true, engine: 'whisper-cpp', modelPath: '', language: 'auto', triggerKeywords: '記錄, 紀錄, record, mark', showTriggerWords: false },
    mentionIdentities: [],
    profiles: [{
      id: 'test-project',
      name: 'Default',
      slack: { botToken: '', channelId: '', channels: [], mentionUserIds: [], mentionAliases: {} },
      gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
      google: { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: '', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '', sheetName: '' },
    }],
    activeProfileId: 'test-project',
  }

  const session: Session = {
    id: 's1',
    deviceId: 'device-1',
    deviceModel: 'Pixel 7',
    androidVersion: 'Android 16',
    connectionMode: 'usb',
    status: 'draft',
    buildVersion: 'MR',
    testNote: '',
    tester: '',
    startedAt: 1,
    endedAt: 2,
    durationMs: 88_000,
    videoPath: '/recording/video.mp4',
    pcRecordingEnabled: false,
    pcVideoPath: null,
    micAudioPath: '/recording/session-mic.webm',
    micAudioDurationMs: 88_000,
    micAudioStartOffsetMs: 0,
  }

  const fakeApi: DesktopApi = {
    doctor: vi.fn() as any,
    app: {} as any,
    device: {} as any,
    session: {
      get: vi.fn().mockResolvedValue({ session, bugs: [] }),
      updateMetadata: vi.fn().mockResolvedValue(undefined),
    } as any,
    bug: { addMarker: vi.fn() } as any,
    hotkey: { setEnabled: vi.fn() } as any,
    settings: {
      get: vi.fn().mockResolvedValue(settings),
      setAudioAnalysis: vi.fn().mockImplementation(async (next) => ({ ...settings, audioAnalysis: next })),
      setActiveProfile: vi.fn().mockImplementation(async (id: string) => ({ ...settings, activeProfileId: id })),
      getBundledGitLabOAuthInstances: vi.fn().mockResolvedValue([]),
    } as any,
    audioAnalysis: { analyzeSession: vi.fn(), cancel: vi.fn() } as any,
    onBugMarkRequested: () => () => {},
    onSessionInterrupted: () => () => {},
    onBugExportProgress: () => () => {},
    onSessionLoadProgress: () => () => {},
    onAudioAnalysisProgress: () => () => {},
    onToolInstallLog: () => () => {},
    onAppUpdateEvent: () => () => {},
    onSlackOAuthCompleted: () => () => {},
    onAppSettingsUpdated: () => () => {},
    _resolveAssetPath: vi.fn().mockResolvedValue('/abs/video.mp4') as any,
  }

  return { fakeApi, settings }
})

vi.mock('@/lib/api', () => ({
  api: fakeApi,
  assetUrl: vi.fn().mockResolvedValue('file:///abs/video.mp4'),
}))

vi.mock('@/components/VideoPlayer', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    VideoPlayer: React.forwardRef((_props: unknown, ref) => {
      React.useImperativeHandle(ref, () => ({
        currentTimeMs: () => 0,
        playWindow: () => {},
        seekToMs: () => {},
      }))
      return <div data-testid="video-player" />
    }),
  }
})

const bugListProps = vi.fn()
vi.mock('@/components/BugList', () => ({
  BugList: (props: Record<string, unknown>) => {
    bugListProps(props)
    return <div data-testid="bug-list" />
  },
}))

describe('Draft audio analysis settings', () => {
  it('lets the review panel choose the audio analysis language', async () => {
    render(<Draft sessionId="s1" />)

    fireEvent.click(await screen.findByRole('button', { name: /Audio auto-markers/i }))
    const select = await screen.findByLabelText('Audio analysis language')
    expect((select as HTMLSelectElement).value).toBe('auto')

    fireEvent.change(select, { target: { value: 'zh' } })

    await waitFor(() => {
      expect(fakeApi.settings.setAudioAnalysis).toHaveBeenCalledWith({
        ...settings.audioAnalysis,
        language: 'zh',
      })
    })
  })

  it('keeps live audio-auto markers until the user explicitly runs full analysis', async () => {
    const liveMarker: Bug = {
      id: 'audio-1',
      sessionId: 's1',
      offsetMs: 13_000,
      originalOffsetMs: 13_000,
      severity: 'normal',
      note: 'live preview',
      preSec: 10,
      postSec: 10,
      source: 'audio-auto',
      screenshotRel: null,
      originalScreenshotRel: null,
      logcatRel: null,
      audioRel: null,
      audioDurationMs: null,
      createdAt: 1,
      mentionUserIds: [],
    }
    fakeApi.session.get = vi.fn().mockResolvedValue({ session: {
      id: 's1',
      deviceId: 'device-1',
      deviceModel: 'Pixel 7',
      androidVersion: 'Android 16',
      connectionMode: 'usb',
      status: 'draft',
      buildVersion: 'MR',
      testNote: '',
      tester: '',
      startedAt: 1,
      endedAt: 2,
      durationMs: 88_000,
      videoPath: '/recording/video.mp4',
      pcRecordingEnabled: false,
      pcVideoPath: null,
      micAudioPath: '/recording/session-mic.webm',
      micAudioDurationMs: 88_000,
      micAudioStartOffsetMs: 0,
    }, bugs: [liveMarker] })
    fakeApi.audioAnalysis.analyzeSession = vi.fn().mockResolvedValue({
      sessionId: 's1',
      transcriptPath: '/analysis/audio-transcript.json',
      generated: 6,
      merged: 0,
      removedAutoMarkers: 1,
      segments: 7,
    }) as any

    render(<Draft sessionId="s1" />)

    await screen.findByTestId('video-player')
    expect(fakeApi.audioAnalysis.analyzeSession).not.toHaveBeenCalled()
  })
})

describe('Draft project resolution', () => {
  function buildSession(project?: string): Session {
    return {
      id: 's1',
      deviceId: 'device-1',
      deviceModel: 'Pixel 7',
      androidVersion: 'Android 16',
      connectionMode: 'usb',
      status: 'draft',
      buildVersion: 'MR',
      testNote: '',
      tester: '',
      project,
      startedAt: 1,
      endedAt: 2,
      durationMs: 88_000,
      videoPath: '/recording/video.mp4',
      pcRecordingEnabled: false,
      pcVideoPath: null,
      micAudioPath: '/recording/session-mic.webm',
      micAudioDurationMs: 88_000,
      micAudioStartOffsetMs: 0,
    }
  }

  it('passes the matched session project to BugList as overrideProfile without mutating active', async () => {
    const multiProjectSettings = {
      ...settings,
      profiles: [
        ...settings.profiles,
        { id: 'cytus-id', name: 'Cytus', slack: { botToken: '', channelId: '' }, gitlab: { baseUrl: '', token: '', projectId: '', mode: 'single-issue' as const }, google: { token: '' } },
      ],
      activeProfileId: 'test-project',
    }
    fakeApi.settings.get = vi.fn().mockResolvedValue(multiProjectSettings)
    fakeApi.settings.setActiveProfile = vi.fn().mockImplementation(async (id: string) => ({ ...multiProjectSettings, activeProfileId: id }))
    fakeApi.session.get = vi.fn().mockResolvedValue({ session: buildSession('Cytus'), bugs: [] })
    bugListProps.mockClear()

    render(<Draft sessionId="s1" />)
    await screen.findByTestId('video-player')

    await waitFor(() => {
      expect(bugListProps).toHaveBeenCalledWith(expect.objectContaining({
        overrideProfile: expect.objectContaining({ id: 'cytus-id', name: 'Cytus' }),
      }))
    })
    expect(fakeApi.settings.setActiveProfile).not.toHaveBeenCalled()
    expect(screen.queryByText(/no longer exists/)).toBeNull()
  })

  it('shows a dismissible warning banner when the session project no longer exists', async () => {
    fakeApi.settings.get = vi.fn().mockResolvedValue(settings)
    fakeApi.session.get = vi.fn().mockResolvedValue({ session: buildSession('Cytus'), bugs: [] })

    render(<Draft sessionId="s1" />)
    await screen.findByTestId('video-player')

    const banner = await screen.findByText(/no longer exists/i)
    expect(banner).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByText(/no longer exists/i)).toBeNull())
  })

  it('does not show the banner when the session profileId still matches a profile (reason=id)', async () => {
    const multiProjectSettings = {
      ...settings,
      profiles: [
        ...settings.profiles,
        { id: 'cytus-id', name: 'Cytus', slack: { botToken: '', channelId: '' }, gitlab: { baseUrl: '', token: '', projectId: '', mode: 'single-issue' as const }, google: { token: '' } },
      ],
      activeProfileId: 'test-project',
    }
    // Session has a stale `project` name that no longer exists, but its
    // `profileId` still resolves — banner should not show because reason is 'id'.
    fakeApi.settings.get = vi.fn().mockResolvedValue(multiProjectSettings)
    fakeApi.session.get = vi.fn().mockResolvedValue({ session: { ...buildSession('OldRenamedName'), profileId: 'cytus-id' }, bugs: [] })

    render(<Draft sessionId="s1" />)
    await screen.findByTestId('video-player')
    await waitFor(() => expect(bugListProps).toHaveBeenCalled())

    expect(screen.queryByText(/no longer exists/i)).toBeNull()
  })

  it('does not show the banner when the session project name matches a profile (reason=name)', async () => {
    const multiProjectSettings = {
      ...settings,
      profiles: [
        ...settings.profiles,
        { id: 'cytus-id', name: 'Cytus', slack: { botToken: '', channelId: '' }, gitlab: { baseUrl: '', token: '', projectId: '', mode: 'single-issue' as const }, google: { token: '' } },
      ],
      activeProfileId: 'test-project',
    }
    fakeApi.settings.get = vi.fn().mockResolvedValue(multiProjectSettings)
    fakeApi.session.get = vi.fn().mockResolvedValue({ session: buildSession('Cytus'), bugs: [] })

    render(<Draft sessionId="s1" />)
    await screen.findByTestId('video-player')
    await waitFor(() => expect(bugListProps).toHaveBeenCalled())

    expect(screen.queryByText(/no longer exists/i)).toBeNull()
  })
})
