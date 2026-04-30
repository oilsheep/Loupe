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

function fakeApi(): DesktopApi {
  return {
    doctor: vi.fn() as any,
    app: {
      showItemInFolder: vi.fn().mockResolvedValue(undefined),
      openPath: vi.fn().mockResolvedValue(undefined),
      getPrimaryScreenSource: vi.fn().mockResolvedValue(null),
      listPcCaptureSources: vi.fn().mockResolvedValue([]),
      showPcCaptureFrame: vi.fn().mockResolvedValue(false),
      hidePcCaptureFrame: vi.fn().mockResolvedValue(undefined),
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
      get: vi.fn().mockResolvedValue({ exportRoot: '/path', hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }, locale: 'en', severities, slack: { botToken: '', channelId: '' } }) as any,
      setExportRoot: vi.fn().mockResolvedValue({ exportRoot: '/path', hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' }, locale: 'en', severities, slack: { botToken: '', channelId: '' } }) as any,
      setHotkeys: vi.fn() as any,
      setSlack: vi.fn() as any,
      refreshSlackUsers: vi.fn() as any,
      setLocale: vi.fn() as any,
      setSeverities: vi.fn() as any,
      chooseExportRoot: vi.fn() as any,
    },
    onBugMarkRequested: () => () => {},
    onSessionInterrupted: () => () => {},
    onBugExportProgress: () => () => {},
    onSessionLoadProgress: () => () => {},
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
    expect(select.textContent).toContain('network')
    expect(select.textContent).not.toContain('custom2')
  })

  it('export-clip calls api.bug.exportClip', async () => {
    const api = fakeApi()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} buildVersion="1.2.3" tester="Avery" testNote="smoke" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    const logcatToggle = screen.getByLabelText('Export marker logcat as sidecar text files') as HTMLInputElement
    expect(logcatToggle.checked).toBe(false)
    fireEvent.click(screen.getByText('Export'))
    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      bugId: 'b1',
      includeLogcat: false,
      publish: { target: 'local', slackThreadMode: 'single-thread' },
      exportId: expect.any(String),
    })))
    expect(api.session.updateMetadata).toHaveBeenCalledWith('s1', { buildVersion: '1.2.3', tester: 'Avery', testNote: 'smoke' })
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
    fireEvent.click(screen.getByText('Export'))
    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      bugId: 'b1',
      includeLogcat: false,
      publish: { target: 'local', slackThreadMode: 'single-thread' },
    })))
  })

  it('passes Slack thread layout through publish options', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByText('Slack'))
    fireEvent.click(screen.getByText('Every marker per thread'))
    fireEvent.click(screen.getByText('Export'))
    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith(expect.objectContaining({
      publish: { target: 'slack', slackThreadMode: 'per-marker-thread' },
    })))
  })

  it('keeps the publish dialog open when Slack publish fails', async () => {
    const api = fakeApi()
    api.bug.exportClip = vi.fn().mockRejectedValue(new Error('Slack channel ID is missing')) as any
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByText('Slack'))
    fireEvent.click(screen.getByText('Export'))
    await screen.findByText('Slack channel ID is missing')
    expect(screen.getByTestId('export-dialog')).toBeTruthy()
  })

  it('opens exported item location when export completion prompt is accepted', async () => {
    const api = fakeApi()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} tester="Avery" />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await screen.findByTestId('export-dialog')
    fireEvent.click(screen.getByText('Export'))
    await waitFor(() => expect(api.app.openPath).toHaveBeenCalledWith('/path'))
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

  it('renders a collapsible logcat preview when bug has logcatRel', async () => {
    const api = fakeApi()
    api.bug.getLogcatPreview = vi.fn().mockResolvedValue(Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n')) as any
    render(<BugList api={api} sessionId="s1" bugs={[bug({ logcatRel: 'logcat/b1.txt' })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    await waitFor(() => expect(api.bug.getLogcatPreview).toHaveBeenCalledWith({ sessionId: 's1', relPath: 'logcat/b1.txt' }))
    const preview = screen.getByTestId('logcat-preview-b1')
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
