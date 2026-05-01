import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DevicePicker } from '@/components/DevicePicker'
import type { Device, DesktopApi, MdnsEntry } from '@shared/types'

function fakeApi(devices: Device[], connectImpl?: any, mdnsScanImpl?: any, pairImpl?: any, getUserNameImpl?: any): DesktopApi {
  return {
    doctor: vi.fn() as any,
    app: {
      showItemInFolder: vi.fn() as any,
      openPath: vi.fn() as any,
      getPrimaryScreenSource: vi.fn().mockResolvedValue({ id: 'screen:1:0', name: 'Entire screen' }) as any,
      listPcCaptureSources: vi.fn().mockResolvedValue([
        { id: 'screen:1:0', name: 'Entire screen', type: 'screen', thumbnailDataUrl: 'data:image/png;base64,screen' },
        { id: 'window:2:0', name: 'Chrome', type: 'window', thumbnailDataUrl: 'data:image/png;base64,window' },
      ]) as any,
      showPcCaptureFrame: vi.fn().mockResolvedValue(true) as any,
      hidePcCaptureFrame: vi.fn().mockResolvedValue(undefined) as any,
      readClipboardText: vi.fn().mockResolvedValue('') as any,
    },
    device: {
      list: vi.fn().mockResolvedValue(devices),
      connect: connectImpl ?? vi.fn().mockResolvedValue({ ok: true, message: 'connected' }),
      mdnsScan: mdnsScanImpl ?? vi.fn().mockResolvedValue([]),
      pair: pairImpl ?? vi.fn().mockResolvedValue({ ok: true, message: 'Successfully paired' }),
      getUserName: getUserNameImpl ?? vi.fn().mockResolvedValue(null),
      listPackages: vi.fn().mockResolvedValue([]),
    },
    session: { updateMetadata: vi.fn() as any } as any, bug: {} as any,
    hotkey: { setEnabled: vi.fn().mockResolvedValue(undefined) } as any,
    settings: { get: vi.fn() as any, setExportRoot: vi.fn() as any, setHotkeys: vi.fn() as any, setSlack: vi.fn() as any, setGitLab: vi.fn() as any, connectGitLabOAuth: vi.fn() as any, cancelGitLabOAuth: vi.fn() as any, listGitLabProjects: vi.fn() as any, setGoogle: vi.fn() as any, connectGoogleOAuth: vi.fn() as any, cancelGoogleOAuth: vi.fn() as any, listGoogleDriveFolders: vi.fn() as any, createGoogleDriveFolder: vi.fn() as any, listGoogleSpreadsheets: vi.fn() as any, listGoogleSheetTabs: vi.fn() as any, setMentionIdentities: vi.fn() as any, importMentionIdentities: vi.fn() as any, exportMentionIdentities: vi.fn() as any, refreshSlackUsers: vi.fn() as any, refreshSlackChannels: vi.fn() as any, startSlackUserOAuth: vi.fn() as any, refreshGitLabUsers: vi.fn() as any, setLocale: vi.fn() as any, setSeverities: vi.fn() as any, chooseExportRoot: vi.fn() as any },
    onBugMarkRequested: () => () => {},
    onSessionInterrupted: () => () => {},
    onBugExportProgress: () => () => {},
    onSessionLoadProgress: () => () => {},
    onSlackOAuthCompleted: () => () => {},
    _resolveAssetPath: vi.fn().mockResolvedValue('/abs/path') as any,
  }
}

describe('DevicePicker', () => {
  function openAndroidTab() {
    fireEvent.click(screen.getByRole('button', { name: 'Android devices' }))
  }

  it('renders devices and selects one', async () => {
    const onSelect = vi.fn()
    render(<DevicePicker api={fakeApi([{ id: 'ABC', type: 'usb', state: 'device', model: 'Pixel 7' }])} selectedId={null} onSelect={onSelect} />)
    openAndroidTab()
    await waitFor(() => expect(screen.getByTestId('device-ABC')).toBeTruthy())
    fireEvent.click(screen.getByTestId('device-ABC'))
    expect(onSelect).toHaveBeenCalledWith('ABC', 'usb')
  })

  it('connect Wi-Fi dispatches device.connect with entered IP', async () => {
    const connect = vi.fn().mockResolvedValue({ ok: true, message: 'connected' })
    render(<DevicePicker api={fakeApi([], connect)} selectedId={null} onSelect={vi.fn()} />)
    openAndroidTab()
    fireEvent.change(screen.getByTestId('wifi-ip'), { target: { value: '10.0.0.7' } })
    fireEvent.click(screen.getByTestId('wifi-connect'))
    await waitFor(() => expect(connect).toHaveBeenCalledWith('10.0.0.7', undefined))
  })

  it('manual Wi-Fi section warns to use the connect port', async () => {
    render(<DevicePicker api={fakeApi([])} selectedId={null} onSelect={vi.fn()} />)
    openAndroidTab()
    expect(screen.getByText(/use the connect port, not the pairing port/i)).toBeTruthy()
    expect(screen.getByPlaceholderText('ip[:connect-port]')).toBeTruthy()
  })

  it('successful manual Wi-Fi connect selects the device and shows connected feedback', async () => {
    const connect = vi.fn().mockResolvedValue({ ok: true, message: 'connected' })
    const getUserName = vi.fn().mockResolvedValue('QA Pixel')
    const onSelect = vi.fn()
    render(<DevicePicker api={fakeApi([], connect, undefined, undefined, getUserName)} selectedId={null} onSelect={onSelect} />)
    openAndroidTab()
    fireEvent.change(screen.getByTestId('wifi-ip'), { target: { value: '10.0.0.7' } })
    fireEvent.click(screen.getByTestId('wifi-connect'))
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('10.0.0.7:5555', 'wifi'))
    await waitFor(() => expect(screen.getByText('Connected: QA Pixel')).toBeTruthy())
  })

  it('selects PC screen as a recording source', async () => {
    const onSelect = vi.fn()
    render(<DevicePicker api={fakeApi([])} selectedId={null} onSelect={onSelect} />)
    await waitFor(() => expect(screen.getByTestId('source-pc-screen:1:0')).toBeTruthy())
    fireEvent.click(screen.getByTestId('source-pc-screen:1:0'))
    expect(onSelect).toHaveBeenCalledWith('screen:1:0', 'pc', 'Entire screen')
  })

  it('selects PC window as a recording source', async () => {
    const onSelect = vi.fn()
    render(<DevicePicker api={fakeApi([])} selectedId={null} onSelect={onSelect} />)
    await waitFor(() => expect(screen.getByText('Window')).toBeTruthy())
    fireEvent.click(screen.getByText('Window'))
    await waitFor(() => expect(screen.getByTestId('source-pc-window:2:0')).toBeTruthy())
    fireEvent.click(screen.getByTestId('source-pc-window:2:0'))
    expect(onSelect).toHaveBeenCalledWith('window:2:0', 'pc', 'Chrome')
  })

  it('Scan Wi-Fi calls api.device.mdnsScan and renders results', async () => {
    const entries: MdnsEntry[] = [
      { name: 'adb-ABC-xyz', type: 'connect', ipPort: '192.168.1.42:43615' },
      { name: 'adb-DEF-abc', type: 'pair',    ipPort: '192.168.1.10:39247' },
    ]
    const mdnsScan = vi.fn().mockResolvedValue(entries)
    render(<DevicePicker api={fakeApi([], undefined, mdnsScan)} selectedId={null} onSelect={vi.fn()} />)

    openAndroidTab()
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

    openAndroidTab()
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

    openAndroidTab()
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

  it('manual Android pair submits the pairing address and code, then refreshes mdns results', async () => {
    const mdnsScan = vi.fn().mockResolvedValue([])
    const pair = vi.fn().mockResolvedValue({ ok: true, message: 'Successfully paired' })
    render(<DevicePicker api={fakeApi([], undefined, mdnsScan, pair)} selectedId={null} onSelect={vi.fn()} />)

    openAndroidTab()
    fireEvent.change(screen.getByTestId('manual-pair-ip-port'), { target: { value: '192.168.1.10:37099' } })
    fireEvent.change(screen.getByTestId('manual-pair-code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('manual-pair-submit'))

    await waitFor(() => expect(pair).toHaveBeenCalledWith({ ipPort: '192.168.1.10:37099', code: '123456' }))
    await waitFor(() => expect(mdnsScan).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/Paired: 192.168.1.10:37099/i)).toBeTruthy()
  })
})
