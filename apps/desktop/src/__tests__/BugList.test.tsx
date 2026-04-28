import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BugList } from '@/components/BugList'
import type { Bug, DesktopApi } from '@shared/types'

const bug = (over: Partial<Bug> = {}): Bug => ({
  id: 'b1', sessionId: 's1', offsetMs: 5000, severity: 'normal', note: 'note',
  screenshotRel: null, logcatRel: null, createdAt: 0,
  audioRel: null, audioDurationMs: null,
  preSec: 5, postSec: 5, ...over,
})

function fakeApi(): DesktopApi {
  return {
    doctor: vi.fn() as any,
    app: { showItemInFolder: vi.fn().mockResolvedValue(undefined), openPath: vi.fn().mockResolvedValue(undefined) },
    device: {} as any, session: { updateMetadata: vi.fn() as any } as any,
    bug: {
      addMarker:  vi.fn().mockResolvedValue(bug()),
      update:     vi.fn().mockResolvedValue(undefined),
      saveAudio:  vi.fn().mockResolvedValue(undefined),
      delete:     vi.fn().mockResolvedValue(undefined),
      exportClip: vi.fn().mockResolvedValue('/path/out.mp4'),
      exportClips: vi.fn().mockResolvedValue(['/path/out.mp4']),
    } as any,
    hotkey: { setEnabled: vi.fn().mockResolvedValue(undefined) } as any,
    settings: {
      get: vi.fn().mockResolvedValue({ exportRoot: '/path', hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' } }) as any,
      setExportRoot: vi.fn().mockResolvedValue({ exportRoot: '/path', hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' } }) as any,
      setHotkeys: vi.fn() as any,
      chooseExportRoot: vi.fn() as any,
    },
    onBugMarkRequested: () => () => {},
    _resolveAssetPath: vi.fn().mockResolvedValue('/abs/path') as any,
  }
}

describe('BugList', () => {
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
    fireEvent.click(screen.getByLabelText('Select marker 0:05'))
    fireEvent.click(screen.getByTestId('export-b1'))
    expect(onSelect).not.toHaveBeenCalled()
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

  it('checks markers by default for export', async () => {
    render(<BugList api={fakeApi()} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    const checkbox = await screen.findByLabelText('Select marker 0:05') as HTMLInputElement
    await waitFor(() => expect(checkbox.checked).toBe(true))
  })

  it('changing pre slider saves preSec immediately', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.change(screen.getByTestId('pre-b1'), { target: { value: '12' } })
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ preSec: 12 })))
  })

  it('changing post slider saves postSec immediately', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.change(screen.getByTestId('post-b1'), { target: { value: '20' } })
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ postSec: 20 })))
  })

  it('clicking a severity label saves that type', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug({ severity: 'normal' })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    fireEvent.click(screen.getByTestId('severity-minor-b1'))
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ severity: 'minor' })))
  })

  it('export-clip calls api.bug.exportClip', async () => {
    const api = fakeApi()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" testNote="smoke" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByText('Export'))
    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith({ sessionId: 's1', bugId: 'b1' }))
    expect(api.session.updateMetadata).toHaveBeenCalledWith('s1', { tester: 'Avery', testNote: 'smoke' })
    expect(alertSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('opens exported item location when export completion prompt is accepted', async () => {
    const api = fakeApi()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByText('Export'))
    await waitFor(() => expect(api.app.showItemInFolder).toHaveBeenCalledWith('/path/out.mp4'))
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
})
