import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DevicePicker } from '@/components/DevicePicker'
import type { Device, DesktopApi } from '@shared/types'

function fakeApi(devices: Device[], connectImpl?: any): DesktopApi {
  return {
    doctor: vi.fn() as any,
    device: { list: vi.fn().mockResolvedValue(devices), connect: connectImpl ?? vi.fn().mockResolvedValue({ ok: true, message: 'connected' }) },
    session: {} as any, bug: {} as any, onBugMarkRequested: () => () => {}, _resolveVideoPath: vi.fn() as any,
  }
}

describe('DevicePicker', () => {
  it('renders devices and selects one', async () => {
    const onSelect = vi.fn()
    render(<DevicePicker api={fakeApi([{ id: 'ABC', type: 'usb', state: 'device', model: 'Pixel 7' }])} selectedId={null} onSelect={onSelect} />)
    await waitFor(() => expect(screen.getByTestId('device-ABC')).toBeTruthy())
    fireEvent.click(screen.getByTestId('device-ABC'))
    expect(onSelect).toHaveBeenCalledWith('ABC', 'usb')
  })

  it('connect Wi-Fi dispatches device.connect with entered IP', async () => {
    const connect = vi.fn().mockResolvedValue({ ok: true, message: 'connected' })
    render(<DevicePicker api={fakeApi([], connect)} selectedId={null} onSelect={vi.fn()} />)
    fireEvent.change(screen.getByTestId('wifi-ip'), { target: { value: '10.0.0.7' } })
    fireEvent.click(screen.getByTestId('wifi-connect'))
    await waitFor(() => expect(connect).toHaveBeenCalledWith('10.0.0.7', undefined))
  })
})
