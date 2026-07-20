import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from '@shared/types'

const recover = vi.fn(() => Promise.resolve())

import { showAlert, showConfirm, showPrompt } from '@/lib/nativeDialog'

describe('native dialog gateway', () => {
  const browserWindow = window as unknown as { api?: DesktopApi }
  const originalApi = browserWindow.api

  beforeEach(() => {
    recover.mockClear()
    browserWindow.api = { app: { recoverFocusAfterNativeDialog: recover } } as unknown as DesktopApi
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    browserWindow.api = originalApi
  })

  it('requests recovery after alert', () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})

    showAlert('message')

    expect(window.alert).toHaveBeenCalledWith('message')
    expect(recover).toHaveBeenCalledOnce()
  })

  it('treats a missing alert function as a no-op', () => {
    vi.stubGlobal('alert', undefined)

    expect(() => showAlert('message')).not.toThrow()
    expect(recover).toHaveBeenCalledOnce()
  })

  it.each([true, false])('preserves confirm result %s', result => {
    vi.spyOn(window, 'confirm').mockReturnValue(result)

    expect(showConfirm('continue?')).toBe(result)
    expect(recover).toHaveBeenCalledOnce()
  })

  it('preserves confirm result when the preload bridge is unavailable', () => {
    browserWindow.api = undefined
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    expect(showConfirm('continue?')).toBe(false)
  })

  it('preserves confirm result when focus recovery throws synchronously', () => {
    browserWindow.api = {
      app: { recoverFocusAfterNativeDialog: vi.fn(() => { throw new Error('bridge failed') }) },
    } as unknown as DesktopApi
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    expect(showConfirm('continue?')).toBe(false)
  })

  it('treats a missing confirm function as accepted', () => {
    vi.stubGlobal('confirm', undefined)

    expect(showConfirm('continue?')).toBe(true)
    expect(recover).toHaveBeenCalledOnce()
  })

  it.each(['renamed', null])('preserves prompt result %s', result => {
    vi.spyOn(window, 'prompt').mockReturnValue(result)

    expect(showPrompt('name', 'old')).toBe(result)
    expect(recover).toHaveBeenCalledOnce()
  })

  it('treats a missing prompt function as cancelled', () => {
    vi.stubGlobal('prompt', undefined)

    expect(showPrompt('name', 'old')).toBeNull()
    expect(recover).toHaveBeenCalledOnce()
  })

  it('requests recovery when a native dialog throws', () => {
    vi.spyOn(window, 'alert').mockImplementation(() => { throw new Error('dialog failed') })

    expect(() => showAlert('message')).toThrow('dialog failed')
    expect(recover).toHaveBeenCalledOnce()
  })

  it('keeps recovery rejection from becoming dialog failure', async () => {
    recover.mockRejectedValueOnce(new Error('IPC unavailable'))
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    expect(showConfirm('continue?')).toBe(false)
    await Promise.resolve()
  })
})
