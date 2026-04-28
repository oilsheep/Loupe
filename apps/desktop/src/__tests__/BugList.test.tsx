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
  it('clicking a row triggers onSelect', () => {
    const onSelect = vi.fn()
    render(<BugList api={fakeApi()} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={onSelect} onMutated={vi.fn()} />)
    fireEvent.click(screen.getByText('note'))
    expect(onSelect).toHaveBeenCalled()
  })

  it('edit + save calls api.bug.update with note, severity, preSec, postSec', async () => {
    const api = fakeApi(); const onMutated = vi.fn()
    render(<BugList api={api} sessionId="s1" bugs={[bug()]} selectedBugId={null} onSelect={vi.fn()} onMutated={onMutated} />)
    fireEvent.click(screen.getByTestId('edit-b1'))
    fireEvent.change(screen.getByTestId('edit-note-b1'), { target: { value: 'updated' } })
    fireEvent.change(screen.getByTestId('edit-pre-b1'), { target: { value: '10' } })
    fireEvent.change(screen.getByTestId('edit-post-b1'), { target: { value: '7' } })
    fireEvent.click(screen.getByTestId('save-b1'))
    await waitFor(() => expect(api.bug.update).toHaveBeenCalledWith('b1', {
      note: 'updated', severity: 'normal', preSec: 10, postSec: 7,
    }))
    expect(onMutated).toHaveBeenCalled()
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
