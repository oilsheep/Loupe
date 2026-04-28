import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BugMarkDialog } from '@/components/BugMarkDialog'
import type { DesktopApi } from '@shared/types'

function fakeApi(markBug = vi.fn().mockResolvedValue({ id: 'b1' })): DesktopApi {
  return {
    doctor: vi.fn() as any, device: {} as any,
    session: { markBug } as any, bug: {} as any,
    hotkey: { setEnabled: vi.fn().mockResolvedValue(undefined) } as any,
    onBugMarkRequested: () => () => {},
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

  it('disables global hotkey on open and re-enables on unmount/close', async () => {
    const setEnabled = vi.fn().mockResolvedValue(undefined)
    const apiObj = { ...fakeApi(), hotkey: { setEnabled } } as any
    const { unmount } = render(<BugMarkDialog open={true} api={apiObj} onSubmitted={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(false))
    unmount()
    expect(setEnabled).toHaveBeenCalledWith(true)
  })
})
