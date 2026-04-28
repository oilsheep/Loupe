import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DevicePicker } from '@/components/DevicePicker'
import type { Device, DesktopApi, MdnsEntry } from '@shared/types'

function fakeApi(devices: Device[], connectImpl?: any, mdnsScanImpl?: any, pairImpl?: any, getUserNameImpl?: any): DesktopApi {
  return {
    doctor: vi.fn() as any,
    app: { showItemInFolder: vi.fn() as any, openPath: vi.fn() as any },
    device: {
      list: vi.fn().mockResolvedValue(devices),
      connect: connectImpl ?? vi.fn().mockResolvedValue({ ok: true, message: 'connected' }),
      mdnsScan: mdnsScanImpl ?? vi.fn().mockResolvedValue([]),
      pair: pairImpl ?? vi.fn().mockResolvedValue({ ok: true, message: 'Successfully paired' }),
      getUserName: getUserNameImpl ?? vi.fn().mockResolvedValue(null),
    },
    session: { updateMetadata: vi.fn() as any } as any, bug: {} as any,
    hotkey: { setEnabled: vi.fn().mockResolvedValue(undefined) } as any,
    settings: { get: vi.fn() as any, setExportRoot: vi.fn() as any, setHotkeys: vi.fn() as any, chooseExportRoot: vi.fn() as any },
    onBugMarkRequested: () => () => {},
    _resolveAssetPath: vi.fn().mockResolvedValue('/abs/path') as any,
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

  it('successful manual Wi-Fi connect selects the device and shows connected feedback', async () => {
    const connect = vi.fn().mockResolvedValue({ ok: true, message: 'connected' })
    const getUserName = vi.fn().mockResolvedValue('QA Pixel')
    const onSelect = vi.fn()
    render(<DevicePicker api={fakeApi([], connect, undefined, undefined, getUserName)} selectedId={null} onSelect={onSelect} />)
    fireEvent.change(screen.getByTestId('wifi-ip'), { target: { value: '10.0.0.7' } })
    fireEvent.click(screen.getByTestId('wifi-connect'))
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('10.0.0.7:5555', 'wifi'))
    await waitFor(() => expect(screen.getByText('已連接：QA Pixel')).toBeTruthy())
  })

  it('Scan Wi-Fi calls api.device.mdnsScan and renders results', async () => {
    const entries: MdnsEntry[] = [
      { name: 'adb-ABC-xyz', type: 'connect', ipPort: '192.168.1.42:43615' },
      { name: 'adb-DEF-abc', type: 'pair',    ipPort: '192.168.1.10:39247' },
    ]
    const mdnsScan = vi.fn().mockResolvedValue(entries)
    render(<DevicePicker api={fakeApi([], undefined, mdnsScan)} selectedId={null} onSelect={vi.fn()} />)

    fireEvent.click(screen.getByTestId('mdns-scan-button'))
    await waitFor(() => expect(mdnsScan).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('mdns-entry-192.168.1.42:43615')).toBeTruthy())
    expect(screen.getByTestId('mdns-entry-192.168.1.10:39247')).toBeTruthy()
    expect(screen.getByTestId('mdns-connect-button-192.168.1.42:43615')).toBeTruthy()
    expect(screen.getByTestId('mdns-pair-button-192.168.1.10:39247')).toBeTruthy()
  })

  it('Connect entry click calls api.device.connect with parsed ip + port', async () => {
    const entries: MdnsEntry[] = [
      { name: 'adb-ABC-xyz', type: 'connect', ipPort: '192.168.1.42:43615' },
    ]
    const mdnsScan = vi.fn().mockResolvedValue(entries)
    const connect = vi.fn().mockResolvedValue({ ok: true, message: 'connected' })
    const onSelect = vi.fn()
    render(<DevicePicker api={fakeApi([], connect, mdnsScan)} selectedId={null} onSelect={onSelect} />)

    fireEvent.click(screen.getByTestId('mdns-scan-button'))
    await waitFor(() => expect(screen.getByTestId('mdns-connect-button-192.168.1.42:43615')).toBeTruthy())
    fireEvent.click(screen.getByTestId('mdns-connect-button-192.168.1.42:43615'))
    await waitFor(() => expect(connect).toHaveBeenCalledWith('192.168.1.42', 43615))
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('192.168.1.42:43615', 'wifi'))
  })

  it('Pair flow: pair button reveals code input, submit calls api.device.pair, then mdnsScan re-runs', async () => {
    const entries: MdnsEntry[] = [
      { name: 'adb-DEF-abc', type: 'pair', ipPort: '192.168.1.10:39247' },
    ]
    const mdnsScan = vi.fn().mockResolvedValue(entries)
    const pair = vi.fn().mockResolvedValue({ ok: true, message: 'Successfully paired' })
    render(<DevicePicker api={fakeApi([], undefined, mdnsScan, pair)} selectedId={null} onSelect={vi.fn()} />)

    fireEvent.click(screen.getByTestId('mdns-scan-button'))
    await waitFor(() => expect(screen.getByTestId('mdns-pair-button-192.168.1.10:39247')).toBeTruthy())

    // Click pair button to reveal code input
    fireEvent.click(screen.getByTestId('mdns-pair-button-192.168.1.10:39247'))
    await waitFor(() => expect(screen.getByTestId('mdns-pair-code-192.168.1.10:39247')).toBeTruthy())

    // Enter code and submit
    fireEvent.change(screen.getByTestId('mdns-pair-code-192.168.1.10:39247'), { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('mdns-pair-submit-192.168.1.10:39247'))
    await waitFor(() => expect(pair).toHaveBeenCalledWith({ ipPort: '192.168.1.10:39247', code: '123456' }))

    // mdnsScan re-runs after successful pair
    await waitFor(() => expect(mdnsScan).toHaveBeenCalledTimes(2))
  })
})
