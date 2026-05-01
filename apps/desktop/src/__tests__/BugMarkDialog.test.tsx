import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BugMarkDialog } from '@/components/BugMarkDialog'
import type { DesktopApi } from '@shared/types'

function fakeApi(markBug = vi.fn().mockResolvedValue({ id: 'b1' })): DesktopApi {
  return {
    doctor: vi.fn() as any,
    app: {
      showItemInFolder: vi.fn() as any,
      openPath: vi.fn() as any,
      getPrimaryScreenSource: vi.fn().mockResolvedValue(null) as any,
      listPcCaptureSources: vi.fn().mockResolvedValue([]) as any,
      showPcCaptureFrame: vi.fn().mockResolvedValue(false) as any,
      hidePcCaptureFrame: vi.fn().mockResolvedValue(undefined) as any,
      readClipboardText: vi.fn().mockResolvedValue('') as any,
    },
    device: {} as any,
    session: { markBug, updateMetadata: vi.fn() } as any, bug: {} as any,
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

describe('BugMarkDialog', () => {
  it('Enter submits with note + severity, calls onSubmitted', async () => {
    const markBug = vi.fn().mockResolvedValue({ id: 'b1' })
    const onSubmitted = vi.fn(); const onCancel = vi.fn()
    render(<BugMarkDialog open={true} api={fakeApi(markBug)} onSubmitted={onSubmitted} onCancel={onCancel} />)
    fireEvent.click(screen.getByTestId('severity-major'))
    fireEvent.change(screen.getByTestId('bug-note'), { target: { value: 'cards stuck' } })
    fireEvent.keyDown(screen.getByTestId('bug-note'), { key: 'Enter' })
    await waitFor(() => expect(markBug).toHaveBeenCalledWith({ severity: 'major', note: 'cards stuck' }))
    expect(onSubmitted).toHaveBeenCalled()
  })

  it('Escape cancels without calling api', () => {
    const markBug = vi.fn(); const onSubmitted = vi.fn(); const onCancel = vi.fn()
    render(<BugMarkDialog open={true} api={fakeApi(markBug)} onSubmitted={onSubmitted} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByTestId('bug-note'), { key: 'Escape' })
    expect(markBug).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not submit empty note', async () => {
    const markBug = vi.fn()
    render(<BugMarkDialog open={true} api={fakeApi(markBug)} onSubmitted={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.keyDown(screen.getByTestId('bug-note'), { key: 'Enter' })
    expect(markBug).not.toHaveBeenCalled()
  })

  it('open=false renders nothing', () => {
    const { container } = render(<BugMarkDialog open={false} api={fakeApi()} onSubmitted={vi.fn()} onCancel={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})

