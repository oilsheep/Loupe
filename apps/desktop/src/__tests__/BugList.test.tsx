import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BugList } from '@/components/BugList'
import type { Bug, DesktopApi } from '@shared/types'

const bug = (over: Partial<Bug> = {}): Bug => ({
  id: 'b1', sessionId: 's1', offsetMs: 5000, severity: 'normal', note: 'note',
  screenshotRel: null, logcatRel: null, createdAt: 0,
  preSec: 5, postSec: 5, ...over,
})

function fakeApi(): DesktopApi {
  return {
    doctor: vi.fn() as any, device: {} as any, session: {} as any,
    bug: {
      update:     vi.fn().mockResolvedValue(undefined),
      delete:     vi.fn().mockResolvedValue(undefined),
      exportClip: vi.fn().mockResolvedValue('/path/out.mp4'),
    } as any,
    hotkey: { setEnabled: vi.fn().mockResolvedValue(undefined) } as any,
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

  it('changing pre slider saves preSec immediately', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    fireEvent.change(screen.getByTestId('pre-b1'), { target: { value: '12' } })
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ preSec: 12 })))
  })

  it('changing post slider saves postSec immediately', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    fireEvent.change(screen.getByTestId('post-b1'), { target: { value: '20' } })
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ postSec: 20 })))
  })

  it('clicking severity dot toggles between major/normal', async () => {
    const api = fakeApi()
    render(<BugList api={api} sessionId="s1" bugs={[bug({ severity: 'normal' })]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    fireEvent.click(screen.getByTestId('severity-b1'))
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', expect.objectContaining({ severity: 'major' })))
  })

  it('export-clip calls api.bug.exportClip', async () => {
    const api = fakeApi()
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={vi.fn()} />)
    fireEvent.click(screen.getByTestId('export-b1'))
    await waitFor(() => expect(api.bug.exportClip).toHaveBeenCalledWith({ sessionId: 's1', bugId: 'b1' }))
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
