import { createRef } from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BugList, type BugListHandle } from '@/components/BugList'
import type { Bug, DesktopApi, MentionIdentity } from '@shared/types'
import { DEFAULT_EXPORT_QUALITY } from '@shared/exportQuality'

const bug = (over: Partial<Bug> = {}): Bug => ({
  id: 'b1', sessionId: 's1', offsetMs: 5000, originalOffsetMs: 5000, severity: 'normal', note: 'note',
  screenshotRel: null, originalScreenshotRel: null, logcatRel: null, createdAt: 0,
  audioRel: null, audioDurationMs: null,
  preSec: 5, postSec: 5, ...over,
})

const severities = {
  note: { label: 'note', color: '#a1a1aa' },
  major: { label: 'major', color: '#ff4d4f' },
  normal: { label: 'normal', color: '#f59e0b' },
  minor: { label: 'minor', color: '#22b8f0' },
  improvement: { label: 'improvement', color: '#22c55e' },
  custom1: { label: 'network', color: '#8b5cf6' },
  custom2: { label: '', color: '#ec4899' },
  custom3: { label: '', color: '#14b8a6' },
  custom4: { label: '', color: '#eab308' },
}

const gitlab = { baseUrl: 'https://gitlab.com', token: '', projectId: '', mode: 'single-issue' as const, labels: [], confidential: false, mentionUsernames: [] }
const google = { token: '', refreshToken: '', tokenExpiresAt: null, accountEmail: '', oauthClientId: '', oauthClientSecret: '', oauthRedirectUri: '', driveFolderId: '', driveFolderName: '', updateSheet: false, spreadsheetId: '', spreadsheetName: '' , sheetName: '' }
const mentionIdentities: MentionIdentity[] = []

function mockLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => { store.delete(key) }),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value) }),
  }
}

function fakeApi(options: { slack?: any; gitlab?: any; google?: any } = {}): DesktopApi {
  const slack = options.slack ?? { botToken: '', channelId: '' }
  const gitlabSettings = options.gitlab ?? gitlab
  const googleSettings = options.google ?? google
  const settings = { exportRoot: '/path', exportQuality: DEFAULT_EXPORT_QUALITY, hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }, locale: 'en', severities, mentionIdentities, activeProfileId: 'p1', profiles: [{ id: 'p1', name: 'Default', slack, gitlab, google, markerFieldPresets: [] }] }
  const settingsWithOptions = { ...settings, profiles: [{ id: 'p1', name: 'Default', slack, gitlab: gitlabSettings, google: googleSettings, markerFieldPresets: [] }] }
  return {
    doctor: vi.fn() as any,
    app: {
      showItemInFolder: vi.fn().mockResolvedValue(undefined),
      openPath: vi.fn().mockResolvedValue(undefined),
      getPlatform: vi.fn().mockResolvedValue('darwin'),
      getVersion: vi.fn().mockResolvedValue('0.5.0'),
      recoverFocusAfterNativeDialog: vi.fn().mockResolvedValue(undefined),
      checkForUpdates: vi.fn().mockResolvedValue({ currentVersion: '0.5.0', updateAvailable: false, releaseUrl: 'https://github.com/oilsheep/Loupe/releases/latest' }),
      openUpdateDownload: vi.fn().mockResolvedValue(undefined),
      downloadUpdate: vi.fn().mockResolvedValue(undefined),
      installUpdate: vi.fn().mockResolvedValue(undefined),
      openIphoneMirroring: vi.fn().mockResolvedValue(true),
      startUxPlayReceiver: vi.fn().mockResolvedValue({ running: true, receiverName: 'Loupe iOS' }),
      stopUxPlayReceiver: vi.fn().mockResolvedValue({ running: false, receiverName: 'Loupe iOS' }),
      getUxPlayReceiver: vi.fn().mockResolvedValue({ running: false, receiverName: 'Loupe iOS' }),
      installTools: vi.fn().mockResolvedValue({ ok: true, message: 'done', detail: '' }),
      resetFasterWhisper: vi.fn().mockResolvedValue({ ok: true, message: 'done', detail: '' }),
      getPrimaryScreenSource: vi.fn().mockResolvedValue(null),
      listPcCaptureSources: vi.fn().mockResolvedValue([]),
      showPcCaptureFrame: vi.fn().mockResolvedValue(false),
      hidePcCaptureFrame: vi.fn().mockResolvedValue(undefined),
      readClipboardText: vi.fn().mockResolvedValue(''),
    },
    device: {} as any, session: { updateMetadata: vi.fn() as any } as any,
    bug: {
      addMarker:  vi.fn().mockResolvedValue(bug()),
      getLogcatPreview: vi.fn().mockResolvedValue(null),
      update:     vi.fn().mockResolvedValue(undefined),
      saveAudio:  vi.fn().mockResolvedValue(undefined),
      delete:     vi.fn().mockResolvedValue(undefined),
      exportClip: vi.fn().mockResolvedValue('/path/out.mp4'),
      exportClips: vi.fn().mockResolvedValue(['/path/out.mp4']),
      cancelExport: vi.fn().mockResolvedValue(undefined),
    } as any,
    hotkey: { setEnabled: vi.fn().mockResolvedValue(undefined) } as any,
    settings: {
      get: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      setExportRoot: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      setExportQuality: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      setHotkeys: vi.fn() as any,
      setAudioAnalysis: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      setCommonSession: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      setRecordingPreferences: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      chooseWhisperModel: vi.fn().mockResolvedValue('') as any,
      setSlack: vi.fn().mockImplementation((_projectId, nextSlack) => Promise.resolve({ ...settingsWithOptions, profiles: [{ ...settingsWithOptions.profiles[0], slack: nextSlack }] })) as any,
      setGitLab: vi.fn().mockImplementation((_projectId, nextGitLab) => Promise.resolve({ ...settingsWithOptions, profiles: [{ ...settingsWithOptions.profiles[0], gitlab: nextGitLab }] })) as any,
      connectGitLabOAuth: vi.fn() as any,
      cancelGitLabOAuth: vi.fn() as any,
      getBundledGitLabOAuthInstances: vi.fn().mockResolvedValue([]) as any,
      listGitLabProjects: vi.fn().mockResolvedValue([{ id: 7, name: 'App', nameWithNamespace: 'QA / App', pathWithNamespace: 'qa/app', webUrl: 'https://gitlab.example.com/qa/app' }]) as any,
      setGoogle: vi.fn() as any,
      connectGoogleOAuth: vi.fn() as any,
      cancelGoogleOAuth: vi.fn() as any,
      listGoogleDriveFolders: vi.fn() as any,
      createGoogleDriveFolder: vi.fn() as any,
      listGoogleSpreadsheets: vi.fn() as any,
      listGoogleSheetTabs: vi.fn() as any,
      setMentionIdentities: vi.fn() as any,
      setMarkerFieldPresets: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      setPublishTemplates: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      importMentionIdentities: vi.fn() as any,
      exportMentionIdentities: vi.fn() as any,
      refreshSlackUsers: vi.fn() as any,
      refreshSlackChannels: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      startSlackUserOAuth: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      disconnectService: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      refreshGitLabUsers: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      validateConnections: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      setLocale: vi.fn() as any,
      setSeverities: vi.fn() as any,
      addProfile: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      renameProfile: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      deleteProfile: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      setActiveProfile: vi.fn().mockResolvedValue(settingsWithOptions) as any,
      chooseExportRoot: vi.fn() as any,
    },
    audioAnalysis: { analyzeSession: vi.fn(), cancel: vi.fn() } as any,
    export: { listForSession: vi.fn().mockResolvedValue([]) as any, republish: vi.fn().mockResolvedValue({ ok: true }) as any },
    onBugMarkRequested: () => () => {},
    onSessionInterrupted: () => () => {},
    onBugExportProgress: () => () => {},
    onSessionLoadProgress: () => () => {},
    onAudioAnalysisProgress: () => () => {},
    onToolInstallLog: () => () => {},
    onAppUpdateEvent: () => () => {},
    onSlackOAuthCompleted: () => () => {},
    onAppSettingsUpdated: () => () => {},
    _resolveAssetPath: vi.fn().mockResolvedValue('/abs/path') as any,
  }
}

describe('BugList', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clicking the timestamp triggers onSelect', () => {
    const onSelect = vi.fn()
    render(<BugList api={fakeApi()} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={onSelect} onMutated={vi.fn()} />)
    fireEvent.click(screen.getByText(/0:05/))
    expect(onSelect).toHaveBeenCalled()
  })

  it('clicking anywhere on the row triggers onSelect', () => {
    const onSelect = vi.fn()
    render(<BugList api={fakeApi()} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={onSelect} onMutated={vi.fn()} />)
    fireEvent.click(screen.getByTestId('bug-row-b1'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }))
  })

  it('interactive controls do not trigger row select', () => {
    const onSelect = vi.fn()
    render(<BugList api={fakeApi()} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={onSelect} onMutated={vi.fn()} />)
    fireEvent.change(screen.getByTestId('severity-select-b1'), { target: { value: 'minor' } })
    fireEvent.click(screen.getByTestId('export-b1'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows annotation boxes and allows selecting/updating/deleting them', () => {
    const onSelectAnnotation = vi.fn()
    const onUpdateAnnotation = vi.fn()
    const onDeleteAnnotation = vi.fn()
    render(
      <BugList
        api={fakeApi()}
        sessionId="s1"
        bugs={[bug({ annotations: [{ id: 'a1', bugId: 'b1', x: 0.1, y: 0.2, width: 0.3, height: 0.4, startMs: 4000, endMs: 6500, createdAt: 1 }] })]}
        selectedBugId="b1"
        selectedAnnotationId="a1"
        onSelect={vi.fn()}
        onMutated={vi.fn()}
        onAnnotationSelect={onSelectAnnotation}
        onAnnotationUpdate={onUpdateAnnotation}
        onAnnotationDelete={onDeleteAnnotation}
      />
    )
    fireEvent.click(screen.getByText('-1.0s → +1.5s'))
    expect(onSelectAnnotation).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }), expect.objectContaining({ id: 'a1' }))
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.blur(inputs[0], { target: { value: '-2' } })
    expect(onUpdateAnnotation).toHaveBeenCalledWith('a1', expect.objectContaining({ startMs: 3000 }))
    fireEvent.click(screen.getByTitle('Delete annotation'))
    expect(onDeleteAnnotation).toHaveBeenCalledWith('a1')
  })

  it('typing in note + blur saves via api.bug.update', async () => {
    const api = fakeApi(); const onMutated = vi.fn()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={onMutated} />)
    const input = screen.getByTestId('note-b1')
    fireEvent.change(input, { target: { value: 'updated' } })
    fireEvent.blur(input)
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({
      note: 'updated', severity: 'normal', preSec: 5, postSec: 5,
    })))
    expect(onMutated).toHaveBeenCalled()
  })

  it('note field supports multiline text', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    const input = screen.getByTestId('note-b1')
    fireEvent.change(input, { target: { value: 'line 1\nline 2' } })
    fireEvent.blur(input)
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ note: 'line 1\nline 2' })))
  })

  it('exports all markers by default through the list handle', async () => {
    const api = fakeApi()
    const ref = createRef<BugListHandle>()
    render(
      <BugList
        ref={ref}
        api={api}
        sessionId="s1"
        bugs={[bug(), bug({ id: 'b2', offsetMs: 8000 })]}
        selectedBugId={null}
        onSelect={vi.fn()}
        onMutated={vi.fn()}
        tester="Avery"
      />
    )
    await waitFor(() => expect(ref.current).toBeTruthy())
    ref.current!.exportAll()
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    fireEvent.click(screen.getByTestId('confirm-export'))
    await waitFor(() => expect(api.bug.exportClips).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      bugIds: ['b1', 'b2'],
    })))
  })

  it('re-checks dirty status after the export quality changes (quality is in the fingerprint)', async () => {
    const listForSession = vi.fn().mockResolvedValue([{
      folderPath: '/out/f1', folderName: 'f1', createdAt: '2026-05-12T19:09:00',
      markerCount: 1, status: { status: 'clean', reasons: [] }, publishState: null,
    }])
    const api = fakeApi()
    api.export = { listForSession, republish: vi.fn().mockResolvedValue({ ok: true }) } as any
    const ref = createRef<BugListHandle>()
    render(<BugList ref={ref} api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)

    await waitFor(() => expect(listForSession).toHaveBeenCalled())
    const callsBefore = listForSession.mock.calls.length
    ref.current!.exportAll()
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('quality-tier-quick'))

    await waitFor(() => expect(api.settings.setExportQuality).toHaveBeenCalled())
    // quality changed → dirty must be re-evaluated, so listForSession runs again
    await waitFor(() => expect(listForSession.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('shows export progress in the always-visible footer, not buried in the scrollable body', async () => {
    const api = fakeApi()
    // Keep the export pending so `busy` (and therefore the progress UI) stays mounted.
    api.bug.exportClips = vi.fn().mockReturnValue(new Promise(() => {})) as any
    const ref = createRef<BugListHandle>()
    render(
      <BugList
        ref={ref}
        api={api}
        sessionId="s1"
        bugs={[bug(), bug({ id: 'b2', offsetMs: 8000 })]}
        selectedBugId={null}
        onSelect={vi.fn()}
        onMutated={vi.fn()}
        tester="Avery"
      />
    )
    await waitFor(() => expect(ref.current).toBeTruthy())
    ref.current!.exportAll()
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    fireEvent.click(screen.getByTestId('confirm-export'))

    const progress = await screen.findByTestId('export-progress')
    const footer = screen.getByTestId('export-footer')
    const scrollBody = screen.getByTestId('export-scroll-body')
    // The progress indicator must live in the pinned footer so it stays visible
    // during export — not inside the scrollable form body where it can scroll
    // out of view on shorter windows.
    expect(footer.contains(progress)).toBe(true)
    expect(scrollBody.contains(progress)).toBe(false)
  })

  it('changing pre input saves preSec immediately', async () => {
    const api = fakeApi()
    // offsetMs=30000ms → maxPreSec=30; value 12 is within range and passes through unchanged
    render(<BugList api={api} sessionId="s1" bugs={[bug({ offsetMs: 30000 })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" durationMs={60000} />)
    fireEvent.change(screen.getByTestId('pre-b1'), { target: { value: '12' } })
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ preSec: 12 })))
  })

  it('changing post input saves postSec immediately', async () => {
    const api = fakeApi()
    // offsetMs=5000ms, durationMs=60000ms → maxPostSec=55; value 20 is within range
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" durationMs={60000} />)
    fireEvent.change(screen.getByTestId('post-b1'), { target: { value: '20' } })
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ postSec: 20 })))
  })

  it('changing the severity select saves that type', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug({ severity: 'normal' })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    fireEvent.change(screen.getByTestId('severity-select-b1'), { target: { value: 'minor' } })
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ severity: 'minor' })))
  })

  it('shows custom severity labels only after they are named', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug({ severity: 'normal' })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    const select = await screen.findByTestId('severity-select-b1')
    await waitFor(() => expect(select.textContent).toContain('network'))
    expect(select.textContent).not.toContain('custom2')
  })

  it('keeps deleted custom severities visible when existing markers still use them', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug({ severity: 'custom2' })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    const select = await screen.findByTestId('severity-select-b1')
    expect(select.textContent).toContain('custom2')
    expect(screen.getByTestId('severity-button-b1').textContent).toContain('custom2')
    fireEvent.change(select, { target: { value: 'normal' } })
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ severity: 'normal' })))
  })

  it('export-clip calls api.bug.exportClip', async () => {
    const api = fakeApi()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onCommitMetadata = vi.fn()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} buildVersion="1.2.3" tester="Avery" testNote="smoke" onCommitMetadata={onCommitMetadata} />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    const logcatToggle = screen.getByLabelText('Export marker logcat as sidecar text files') as HTMLInputElement
    expect(logcatToggle.checked).toBe(false)
    fireEvent.click(screen.getByTestId('export-next'))
    fireEvent.click(screen.getByTestId('confirm-export'))
    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      bugId: 'b1',
      includeLogcat: false,
      publish: expect.objectContaining({ target: 'local', slackThreadMode: 'per-marker-thread' }),
      exportId: expect.any(String),
    })))
    // Metadata is owned by the parent now; the export flow commits it via onCommitMetadata.
    await waitFor(() => expect(onCommitMetadata).toHaveBeenCalled())
    expect(alertSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('enables logcat sidecar export when requested', async () => {
    const api = fakeApi()
    api.bug.getLogcatPreview = vi.fn().mockResolvedValue('FATAL EXCEPTION: main') as any
    render(<BugList api={api} sessionId="s1" bugs={[bug({ logcatRel: 'logcat/b1.txt' })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    const logcatToggle = screen.getByLabelText('Export marker logcat as sidecar text files') as HTMLInputElement
    expect(logcatToggle.checked).toBe(true)
    fireEvent.click(logcatToggle)
    fireEvent.click(screen.getByTestId('export-next'))
    fireEvent.click(screen.getByTestId('confirm-export'))
    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      bugId: 'b1',
      includeLogcat: false,
      publish: expect.objectContaining({ target: 'local', slackThreadMode: 'per-marker-thread' }),
    })))
  })

  it('shows a connect button instead of a Slack checkbox when Slack is not connected', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    fireEvent.click(screen.getByText('Connect Slack'))
    await waitFor(() => expect(api.settings.startSlackUserOAuth).toHaveBeenCalled())
    expect(api.bug.exportClip).not.toHaveBeenCalled()
  })

  it('does not allow disconnected GitLab or Google Drive publish targets', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    expect(screen.getAllByText('Connect GitLab')).toHaveLength(1)
    expect(screen.getAllByText('Connect Google')).toHaveLength(1)
    expect(screen.queryByRole('switch', { name: 'GitLab' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Google Drive' })).toBeNull()
    fireEvent.click(screen.getByTestId('confirm-export'))
    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith(expect.objectContaining({
      publish: expect.objectContaining({ target: 'local', targets: ['local'] }),
    })))
  })

  it('passes Slack thread layout through publish options', async () => {
    const api = fakeApi({ slack: { publishIdentity: 'bot', botToken: 'xoxb-test', userToken: '', channelId: 'C123', channels: [{ id: 'C123', name: 'qa', isArchived: false }], mentionUserIds: [], mentionAliases: {} } })
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    const publish = screen.getByRole('switch', { name: 'Slack' })
    fireEvent.click(publish)
    await waitFor(() => expect(publish.getAttribute('aria-checked')).toBe('true'))
    fireEvent.click(screen.getByTestId('confirm-export'))
    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith(expect.objectContaining({
      publish: expect.objectContaining({ target: 'slack', slackThreadMode: 'per-marker-thread' }),
    })))
  })

  it('does not treat a bot token as connected while OAuth mode is selected', async () => {
    const api = fakeApi({ slack: { publishIdentity: 'user', botToken: 'xoxb-test', userToken: '', channelId: 'C123', channels: [{ id: 'C123', name: 'qa', isArchived: false }], mentionUserIds: [], mentionAliases: {} } })
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    expect(screen.getByText('Slack OAuth is selected, but no user token is connected.')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Slack' })).toBeNull()
  })

  it('does not treat a user token as connected while bot token mode is selected', async () => {
    const api = fakeApi({ slack: { publishIdentity: 'bot', botToken: '', userToken: 'xoxp-test', channelId: 'C123', channels: [{ id: 'C123', name: 'qa', isArchived: false }], mentionUserIds: [], mentionAliases: {} } })
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    expect(screen.getByText('Slack bot token mode is selected, but no bot token is saved.')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Slack' })).toBeNull()
  })

  it('saves the selected GitLab project before publishing', async () => {
    const api = fakeApi({ gitlab: { ...gitlab, token: 'glpat-test', projectId: 'old/project' } })
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    const gitlabToggle = screen.getByRole('switch', { name: 'GitLab' })
    fireEvent.click(gitlabToggle)
    fireEvent.click(await screen.findByText('old/project'))
    const projectInput = await screen.findByPlaceholderText('Search or enter group/project')
    fireEvent.change(projectInput, { target: { value: 'qa/app' } })
    fireEvent.keyDown(projectInput, { key: 'Enter' })
    fireEvent.click(screen.getByText('Issue per marker'))
    fireEvent.click(screen.getByTestId('confirm-export'))

    await waitFor(() => expect(api.settings.setGitLab).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      projectId: 'qa/app',
      mode: 'per-marker-issue',
    })))
    expect(api.bug.exportClip).toHaveBeenCalledWith(expect.objectContaining({
      publish: expect.objectContaining({ target: 'gitlab', gitlabMode: 'per-marker-issue' }),
    }))
  })

  it('persists the Slack thread mode immediately on change, without exporting', async () => {
    const api = fakeApi({ slack: { publishIdentity: 'bot', botToken: 'xoxb-test', userToken: '', channelId: 'C123', channels: [{ id: 'C123', name: 'qa', isArchived: false }], mentionUserIds: [], mentionAliases: {}, threadMode: 'per-marker-thread' } })
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    fireEvent.click(screen.getByRole('switch', { name: 'Slack' }))
    fireEvent.click(await screen.findByText('All markers in one thread'))

    // Saved to the profile the moment it changes — no confirm-export click.
    await waitFor(() => expect(api.settings.setSlack).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ threadMode: 'single-thread' })))
    expect(api.bug.exportClip).not.toHaveBeenCalled()
  })

  it('persists the GitLab issue mode immediately on change, without exporting', async () => {
    const api = fakeApi({ gitlab: { ...gitlab, token: 'glpat-test', projectId: 'qa/app' } })
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    fireEvent.click(screen.getByRole('switch', { name: 'GitLab' }))
    fireEvent.click(await screen.findByText('Issue per marker'))

    await waitFor(() => expect(api.settings.setGitLab).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mode: 'per-marker-issue' })))
    expect(api.bug.exportClip).not.toHaveBeenCalled()
  })

  it('keeps an in-progress GitLab project when a mode change persists (seed-once guard)', async () => {
    // The settings-updated event our on-change persist fires must NOT reseed
    // (revert) fields the user is actively editing. Wire a real listener registry
    // so setSlack emits, then prove an unsaved project survives a thread toggle.
    // Without the seed-once guard, apply() would reset gitlabProjectId to the
    // profile value and this test would fail.
    const listeners = new Set<(s: any) => void>()
    const api = fakeApi({
      slack: { publishIdentity: 'bot', botToken: 'xoxb-test', userToken: '', channelId: 'C123', channels: [{ id: 'C123', name: 'qa', isArchived: false }], mentionUserIds: [], mentionAliases: {}, threadMode: 'per-marker-thread' },
      gitlab: { ...gitlab, token: 'glpat-test', projectId: 'old/project' },
    })
    api.onAppSettingsUpdated = ((cb: any) => { listeners.add(cb); return () => { listeners.delete(cb) } }) as any
    const origSetSlack = api.settings.setSlack
    api.settings.setSlack = vi.fn(async (id: string, s: any) => {
      const r = await origSetSlack(id, s)
      listeners.forEach(cb => cb(r))
      return r
    }) as any

    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))

    // Enable GitLab and pick an in-progress custom project (not yet persisted).
    fireEvent.click(screen.getByRole('switch', { name: 'GitLab' }))
    fireEvent.click(await screen.findByText('old/project'))
    const projectInput = await screen.findByPlaceholderText('Search or enter group/project')
    fireEvent.change(projectInput, { target: { value: 'my/wip-project' } })
    fireEvent.keyDown(projectInput, { key: 'Enter' })
    await screen.findByText('my/wip-project')

    // Toggle Slack thread mode -> persist -> emits settings-updated -> apply().
    fireEvent.click(screen.getByRole('switch', { name: 'Slack' }))
    fireEvent.click(await screen.findByText('All markers in one thread'))
    await waitFor(() => expect(api.settings.setSlack).toHaveBeenCalled())

    // The guard held: the in-progress project was not reverted to 'old/project'.
    expect(screen.getByText('my/wip-project')).toBeTruthy()
    expect(screen.queryByText('old/project')).toBeNull()
  })

  it('confirms large original attachments and passes merge audio options', async () => {
    localStorage.setItem('loupe.skipOriginalFilesWarning', '0')
    const api = fakeApi()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" hasSessionMicTrack />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    const includeOriginalFiles = screen.getByTestId('include-original-files') as HTMLInputElement
    fireEvent.click(includeOriginalFiles)
    await waitFor(() => expect(includeOriginalFiles.checked).toBe(true))
    const mergeOriginalAudio = await screen.findByTestId('merge-original-audio') as HTMLInputElement
    fireEvent.click(mergeOriginalAudio)
    await waitFor(() => expect(mergeOriginalAudio.checked).toBe(true))
    fireEvent.click(screen.getByTestId('export-next'))
    fireEvent.click(screen.getByTestId('confirm-export'))

    await screen.findByTestId('original-files-warning')
    expect(api.bug.exportClip).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Continue export'))

    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith(expect.objectContaining({
      includeOriginalFiles: true,
      mergeOriginalAudio: true,
    })))
    localStorage.removeItem('loupe.skipOriginalFilesWarning')
  })

  it('keeps the publish dialog open when Slack publish fails', async () => {
    const api = fakeApi({ slack: { publishIdentity: 'bot', botToken: 'xoxb-test', userToken: '', channelId: 'C123', channels: [{ id: 'C123', name: 'qa', isArchived: false }], mentionUserIds: [], mentionAliases: {} } })
    api.bug.exportClip = vi.fn().mockRejectedValue(new Error('Slack channel ID is missing')) as any
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    const publish = screen.getByRole('switch', { name: 'Slack' })
    fireEvent.click(publish)
    await waitFor(() => expect(publish.getAttribute('aria-checked')).toBe('true'))
    fireEvent.click(screen.getByTestId('confirm-export'))
    await screen.findByText('Slack channel ID is missing')
    expect(screen.getByTestId('export-dialog')).toBeTruthy()
  })

  it('opens exported item location when export completion prompt is accepted', async () => {
    const api = fakeApi()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))
    fireEvent.click(screen.getByTestId('confirm-export'))
    await waitFor(() => expect(api.app.openPath).toHaveBeenCalledWith('/path'))
  })

  it('exports the full recording when there are no markers', async () => {
    const api = fakeApi()
    const ref = createRef<BugListHandle>()
    api.bug.exportClips = vi.fn().mockResolvedValue(['/path/records/full-recording.mp4', '/path/records/session-mic.webm']) as any
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BugList ref={ref} api={api} sessionId="s1" bugs={[]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    await waitFor(() => expect(ref.current).toBeTruthy())
    ref.current!.exportAll()
    await screen.findByTestId('export-dialog')
    expect(screen.getByText('Export full recording')).toBeTruthy()
    fireEvent.click(screen.getByTestId('export-next'))
    fireEvent.click(screen.getByTestId('confirm-export'))
    await waitFor(() => expect(api.bug.exportClips).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      bugIds: [],
    })))
    expect(api.app.openPath).toHaveBeenCalledWith('/path/records')
  })

  it('does not export when export dialog is cancelled', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug({ note: '' })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByText('Cancel'))
    expect(api.bug.exportClip).not.toHaveBeenCalled()
  })

  it('export button hidden when allowExport=false', () => {
    render(<BugList api={fakeApi()} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} allowExport={false} />)
    expect(screen.queryByTestId('export-b1')).toBeNull()
  })

  it('renders thumbnail when bug has screenshotRel', async () => {
    render(<BugList api={fakeApi()} sessionId="s1" bugs={[bug({ screenshotRel: 'screenshots/b1.png' })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('thumb-b1')).toBeTruthy())
  })

  it('shows a Profile dropdown in the export dialog with all profiles', async () => {
    const slackA = { publishIdentity: 'bot' as const, botToken: 'xoxb-A', userToken: '', channelId: 'C-A', channels: [{ id: 'C-A', name: 'team-a', isArchived: false }], mentionUserIds: [], mentionAliases: {} }
    const slackB = { publishIdentity: 'bot' as const, botToken: 'xoxb-B', userToken: '', channelId: 'C-B', channels: [{ id: 'C-B', name: 'team-b', isArchived: false }], mentionUserIds: [], mentionAliases: {} }
    const settings = {
      exportRoot: '/path', exportQuality: DEFAULT_EXPORT_QUALITY, hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }, locale: 'en', severities, mentionIdentities,
      activeProfileId: 'pA',
      profiles: [
        { id: 'pA', name: 'Cytus', slack: slackA, gitlab, google, markerFieldPresets: [] },
        { id: 'pB', name: 'Deemo', slack: slackB, gitlab, google, markerFieldPresets: [] },
      ],
    }
    const api = fakeApi()
    api.settings.get = vi.fn().mockResolvedValue(settings) as any
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))

    const profileSelect = await screen.findByLabelText(/profile/i) as HTMLSelectElement
    expect(profileSelect.tagName).toBe('SELECT')
    const options = Array.from(profileSelect.querySelectorAll('option')).map(o => o.textContent)
    expect(options).toContain('Cytus')
    expect(options).toContain('Deemo')
  })

  it('switching the Profile dropdown does not call api.settings.setActiveProfile', async () => {
    const slackA = { publishIdentity: 'bot' as const, botToken: 'xoxb-A', userToken: '', channelId: 'C-A', channels: [{ id: 'C-A', name: 'team-a', isArchived: false }], mentionUserIds: [], mentionAliases: {} }
    const slackB = { publishIdentity: 'bot' as const, botToken: 'xoxb-B', userToken: '', channelId: 'C-B', channels: [{ id: 'C-B', name: 'team-b', isArchived: false }], mentionUserIds: [], mentionAliases: {} }
    const settings = {
      exportRoot: '/path', exportQuality: DEFAULT_EXPORT_QUALITY, hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }, locale: 'en', severities, mentionIdentities,
      activeProfileId: 'pA',
      profiles: [
        { id: 'pA', name: 'Cytus', slack: slackA, gitlab, google, markerFieldPresets: [] },
        { id: 'pB', name: 'Deemo', slack: slackB, gitlab, google, markerFieldPresets: [] },
      ],
    }
    const api = fakeApi()
    api.settings.get = vi.fn().mockResolvedValue(settings) as any
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))

    const profileSelect = await screen.findByLabelText(/profile/i) as HTMLSelectElement
    fireEvent.change(profileSelect, { target: { value: 'pB' } })

    expect(api.settings.setActiveProfile).not.toHaveBeenCalled()
  })

  it('publishing after switching the dropdown writes to the override profile, not the global active', async () => {
    const slackA = { publishIdentity: 'bot' as const, botToken: 'xoxb-A', userToken: '', channelId: 'C-A', channels: [{ id: 'C-A', name: 'team-a', isArchived: false }], mentionUserIds: [], mentionAliases: {} }
    const slackB = { publishIdentity: 'bot' as const, botToken: 'xoxb-B', userToken: '', channelId: 'C-B', channels: [{ id: 'C-B', name: 'team-b', isArchived: false }], mentionUserIds: [], mentionAliases: {} }
    const settings = {
      exportRoot: '/path', exportQuality: DEFAULT_EXPORT_QUALITY, hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }, locale: 'en', severities, mentionIdentities,
      activeProfileId: 'pA',
      profiles: [
        { id: 'pA', name: 'Cytus', slack: slackA, gitlab, google, markerFieldPresets: [] },
        { id: 'pB', name: 'Deemo', slack: slackB, gitlab, google, markerFieldPresets: [] },
      ],
    }
    const api = fakeApi()
    api.settings.get = vi.fn().mockResolvedValue(settings) as any
    api.settings.setSlack = vi.fn().mockImplementation((profileId: string, nextSlack: any) => {
      const profile = settings.profiles.find(p => p.id === profileId)!
      const updatedProfile = { ...profile, slack: nextSlack }
      return Promise.resolve({
        ...settings,
        profiles: settings.profiles.map(p => p.id === profileId ? updatedProfile : p),
      })
    }) as any
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))

    const profileSelect = await screen.findByLabelText(/profile/i) as HTMLSelectElement
    fireEvent.change(profileSelect, { target: { value: 'pB' } })

    // Now toggle Slack on (pB has slackB connected) and publish
    await waitFor(() => {
      const publishToggle = screen.queryByRole('switch', { name: 'Slack' })
      expect(publishToggle).toBeTruthy()
    })
    const publishToggle = screen.getByRole('switch', { name: 'Slack' })
    fireEvent.click(publishToggle)
    fireEvent.click(screen.getByTestId('confirm-export'))

    await waitFor(() => expect(api.settings.setSlack).toHaveBeenCalled())
    // The setSlack write must target pB (the dropdown override), not pA (active).
    expect((api.settings.setSlack as any).mock.calls[0][0]).toBe('pB')
  })

  it('does not clobber local Profile dropdown choice when overrideProfile prop reference changes but id is the same', async () => {
    const slackA = { publishIdentity: 'bot' as const, botToken: 'xoxb-A', userToken: '', channelId: 'C-A', channels: [{ id: 'C-A', name: 'team-a', isArchived: false }], mentionUserIds: [], mentionAliases: {} }
    const slackB = { publishIdentity: 'bot' as const, botToken: 'xoxb-B', userToken: '', channelId: 'C-B', channels: [{ id: 'C-B', name: 'team-b', isArchived: false }], mentionUserIds: [], mentionAliases: {} }
    const profileA = { id: 'pA', name: 'Cytus', slack: slackA, gitlab, google, markerFieldPresets: [] }
    const profileB = { id: 'pB', name: 'Deemo', slack: slackB, gitlab, google, markerFieldPresets: [] }
    const settings = {
      exportRoot: '/path', exportQuality: DEFAULT_EXPORT_QUALITY, hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }, locale: 'en', severities, mentionIdentities,
      activeProfileId: 'pA',
      profiles: [profileA, profileB],
    }
    const api = fakeApi()
    api.settings.get = vi.fn().mockResolvedValue(settings) as any
    const { rerender } = render(
      <BugList
        api={api}
        sessionId="s1"
        bugs={[bug()]}
        selectedBugId={null}
        onSelect={vi.fn()}
        onMutated={vi.fn()}
        tester="Avery"
        overrideProfile={profileA}
      />
    )
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByTestId('export-next'))

    const profileSelect = await screen.findByLabelText(/profile/i) as HTMLSelectElement
    // User manually switches the dropdown from pA → pB.
    fireEvent.change(profileSelect, { target: { value: 'pB' } })
    await waitFor(() => expect(profileSelect.value).toBe('pB'))

    // Simulate Draft re-resolving the session (e.g. via reloadSettings or
    // onAppSettingsUpdated): useMemo recomputes profileLookup.profile and
    // returns a NEW object reference for pA — same id, fresh object.
    rerender(
      <BugList
        api={api}
        sessionId="s1"
        bugs={[bug()]}
        selectedBugId={null}
        onSelect={vi.fn()}
        onMutated={vi.fn()}
        tester="Avery"
        overrideProfile={{ ...profileA }}
      />
    )

    // The user's pB choice must be preserved despite the new prop reference.
    expect(profileSelect.value).toBe('pB')
  })

  it('reports dirty status up and republishes with overrides when the panel is open', async () => {
    const listForSession = vi.fn().mockResolvedValue([{
      folderPath: '/out/f1', folderName: 'f1', createdAt: '2026-05-12T19:09:00',
      markerCount: 1, status: { status: 'stale', reasons: ['clip-stale'] }, publishState: null,
    }])
    const republish = vi.fn().mockResolvedValue({ ok: true })
    const onExportsDirtyChange = vi.fn()
    const api = fakeApi({ slack: { publishIdentity: 'bot', botToken: 'xoxb-test', userToken: '', channelId: 'C123', channels: [{ id: 'C123', name: 'qa', isArchived: false }], mentionUserIds: [], mentionAliases: {} } })
    api.export = { listForSession, republish } as any
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    // The 輸出/發布 buttons + dirty dot live in the Draft header; BugList reports
    // dirty status up via onExportsDirtyChange and renders the panel when
    // publishPanelOpen is set (both controlled by the header).
    render(<BugList api={api} sessionId="s1" publishPanelOpen onExportsDirtyChange={onExportsDirtyChange} bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)

    // Newest export is stale → dirty reported up so the header dot can show:
    await waitFor(() => expect(onExportsDirtyChange).toHaveBeenCalledWith(true))

    // Panel is open (prop-controlled); enable Slack (channel C123 seeded from the profile), republish:
    const slackToggle = await screen.findByRole('switch', { name: 'Slack' })
    fireEvent.click(slackToggle)
    await waitFor(() => expect(slackToggle.getAttribute('aria-checked')).toBe('true'))

    fireEvent.click(screen.getByTestId('republish-button'))
    await waitFor(() => expect(republish).toHaveBeenCalled())
    const arg = republish.mock.calls[0][0]
    expect(arg.folderPath).toBe('/out/f1')
    expect(arg.targets).toContain('slack')
    expect(arg.overrides.slack.channelId).toBe('C123')
  })

  it('shows an indeterminate progress bar while a republish is in flight', async () => {
    const listForSession = vi.fn().mockResolvedValue([{
      folderPath: '/out/f1', folderName: 'f1', createdAt: '2026-05-12T19:09:00',
      markerCount: 1, status: { status: 'stale', reasons: ['clip-stale'] }, publishState: null,
    }])
    let resolveRepublish: (v: { ok: boolean }) => void = () => {}
    const republish = vi.fn().mockReturnValue(new Promise(res => { resolveRepublish = res }))
    const api = fakeApi({ slack: { publishIdentity: 'bot', botToken: 'xoxb-test', userToken: '', channelId: 'C123', channels: [{ id: 'C123', name: 'qa', isArchived: false }], mentionUserIds: [], mentionAliases: {} } })
    api.export = { listForSession, republish } as any
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BugList api={api} sessionId="s1" publishPanelOpen onExportsDirtyChange={vi.fn()} bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)

    const slackToggle = await screen.findByRole('switch', { name: 'Slack' })
    fireEvent.click(slackToggle)
    await waitFor(() => expect(slackToggle.getAttribute('aria-checked')).toBe('true'))

    expect(screen.queryByTestId('republish-progress')).toBeNull()
    fireEvent.click(screen.getByTestId('republish-button'))
    // bar appears while the republish promise is pending...
    expect(await screen.findByTestId('republish-progress')).toBeTruthy()
    // ...and clears once it resolves.
    resolveRepublish({ ok: true })
    await waitFor(() => expect(screen.queryByTestId('republish-progress')).toBeNull())
  })

  it('renders a collapsible logcat preview when bug has logcatRel', async () => {
    const api = fakeApi()
    api.bug.getLogcatPreview = vi.fn().mockResolvedValue(Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n')) as any
    render(<BugList api={api} sessionId="s1" bugs={[bug({ logcatRel: 'logcat/b1.txt' })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    await waitFor(() => expect(api.bug.getLogcatPreview).toHaveBeenCalledWith({ sessionId: 's1', relPath: 'logcat/b1.txt' }))
    const preview = await screen.findByTestId('logcat-preview-b1')
    const pre = preview.querySelector('pre')!
    await waitFor(() => expect(pre.textContent).toContain('line 12'))
    expect(pre.textContent).toBe('line 11\nline 12')
    expect(pre.style.maxHeight).toBe('2rem')
    expect(pre.className).toContain('overflow-y-hidden')
    fireEvent.click(screen.getByText('expand'))
    expect(pre.textContent).toContain('line 1')
    expect(pre.textContent).toContain('line 12')
    expect(pre.style.maxHeight).toBe('10rem')
    expect(pre.className).toContain('overflow-y-auto')
  })
})
