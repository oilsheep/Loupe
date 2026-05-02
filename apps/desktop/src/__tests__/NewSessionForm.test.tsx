import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AppSettings, DesktopApi, Session } from '@shared/types'
import { NewSessionForm } from '@/components/NewSessionForm'

const { fakeApi, settings, goRecording, pushRecentBuild } = vi.hoisted(() => {
  const settings: AppSettings = {
    exportRoot: '/exports',
    hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' },
    locale: 'en',
    severities: {
      note: { label: 'Note', color: '#a1a1aa' },
      major: { label: 'Critical', color: '#ff4d4f' },
      normal: { label: 'Bug', color: '#f59e0b' },
      minor: { label: 'Polish', color: '#22b8f0' },
      improvement: { label: 'Note', color: '#22c55e' },
      custom1: { label: '', color: '#8b5cf6' },
      custom2: { label: '', color: '#ec4899' },
      custom3: { label: '', color: '#14b8a6' },
      custom4: { label: '', color: '#eab308' },
    },
    audioAnalysis: {
      enabled: true,
      engine: 'faster-whisper',
      modelPath: 'small',
      language: 'zh',
      triggerKeywords: '記錄, 紀錄, 记录, 標記',
      showTriggerWords: false,
    },
    slack: { botToken: '', channelId: '', channels: [], mentionUserIds: [], mentionAliases: {} },
    gitlab: { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
    google: {
      token: '',
      refreshToken: '',
      tokenExpiresAt: null,
      accountEmail: '',
      oauthClientId: '',
      oauthClientSecret: '',
      oauthRedirectUri: '',
      driveFolderId: '',
      driveFolderName: '',
      updateSheet: false,
      spreadsheetId: '',
      spreadsheetName: '',
      sheetName: '',
    },
    mentionIdentities: [],
  }
  const session: Session = {
    id: 's1',
    deviceId: 'screen:1',
    deviceModel: 'Screen 1',
    androidVersion: 'Windows',
    connectionMode: 'pc',
    status: 'recording',
    buildVersion: 'MR',
    testNote: '',
    tester: '',
    startedAt: 1,
    endedAt: null,
    durationMs: null,
    videoPath: null,
    pcRecordingEnabled: true,
    pcVideoPath: null,
    micRecordingRequested: true,
    micAudioPath: null,
    micAudioDurationMs: null,
    micAudioStartOffsetMs: null,
  }
  const fakeApi: DesktopApi = {
    doctor: vi.fn() as any,
    app: {} as any,
    device: { listPackages: vi.fn().mockResolvedValue([]) } as any,
    session: {
      start: vi.fn().mockResolvedValue(session),
    } as any,
    bug: {} as any,
    hotkey: {} as any,
    settings: {
      get: vi.fn().mockResolvedValue(settings),
      setAudioAnalysis: vi.fn().mockImplementation(async audioAnalysis => ({ ...settings, audioAnalysis })),
    } as any,
    audioAnalysis: { analyzeSession: vi.fn(), cancel: vi.fn() } as any,
    onBugMarkRequested: () => () => {},
    onSessionInterrupted: () => () => {},
    onBugExportProgress: () => () => {},
    onSessionLoadProgress: () => () => {},
    onAudioAnalysisProgress: () => () => {},
    onToolInstallLog: () => () => {},
    onSlackOAuthCompleted: () => () => {},
    _resolveAssetPath: vi.fn() as any,
  }
  return {
    fakeApi,
    settings,
    goRecording: vi.fn(),
    pushRecentBuild: vi.fn(),
  }
})

vi.mock('@/lib/store', () => ({
  useApp: (selector: any) => selector({
    recentBuilds: ['MR'],
    pushRecentBuild,
    goRecording,
  }),
}))

describe('NewSessionForm audio trigger settings', () => {
  it('shows compact voice settings only when microphone recording is enabled', async () => {
    render(<NewSessionForm api={fakeApi} deviceId="screen:1" connectionMode="pc" sourceName="Screen 1" />)

    expect(await screen.findByLabelText('Speech language')).toBeTruthy()
    expect(screen.getByLabelText('Trigger words')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Record QA microphone for audio auto-markers'))

    expect(screen.queryByLabelText('Speech language')).toBeNull()
    expect(screen.queryByLabelText('Trigger words')).toBeNull()
  })

  it('updates suggested trigger words on language change unless the user customized them', async () => {
    render(<NewSessionForm api={fakeApi} deviceId="screen:1" connectionMode="pc" sourceName="Screen 1" />)

    const language = await screen.findByLabelText('Speech language') as HTMLSelectElement
    const triggers = screen.getByLabelText('Trigger words') as HTMLInputElement

    fireEvent.change(language, { target: { value: 'en' } })
    expect(triggers.value).toBe('record, mark, log')

    fireEvent.change(triggers, { target: { value: 'capture' } })
    fireEvent.change(language, { target: { value: 'ja' } })
    expect(triggers.value).toBe('capture')

    fireEvent.click(screen.getByRole('button', { name: 'Use suggested' }))
    expect(triggers.value).toBe('記録, マーク, ログ')
  })

  it('persists audio language and trigger words before starting the session', async () => {
    render(<NewSessionForm api={fakeApi} deviceId="screen:1" connectionMode="pc" sourceName="Screen 1" />)

    fireEvent.change(await screen.findByLabelText('Speech language'), { target: { value: 'en' } })
    fireEvent.change(screen.getByLabelText('Trigger words'), { target: { value: 'record, capture' } })
    fireEvent.click(screen.getByTestId('start-session'))

    await waitFor(() => {
      expect(fakeApi.settings.setAudioAnalysis).toHaveBeenCalledWith({
        ...settings.audioAnalysis,
        language: 'en',
        triggerKeywords: 'record, capture',
      })
    })
    expect(fakeApi.session.start).toHaveBeenCalledWith(expect.objectContaining({ recordMic: true }))
  })
})
