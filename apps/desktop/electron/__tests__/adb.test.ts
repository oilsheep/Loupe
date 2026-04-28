import { describe, it, expect, vi } from 'vitest'
import { Adb, parseDevicesOutput } from '../adb'
import type { IProcessRunner } from '../process-runner'

describe('parseDevicesOutput', () => {
  it('parses USB device line with model', () => {
    const out = `List of devices attached\nABC123  device usb:1-2 product:foo model:Pixel_7 device:panther transport_id:1\n\n`
    const devs = parseDevicesOutput(out)
    expect(devs).toEqual([
      { id: 'ABC123', type: 'usb', state: 'device' }
    ])
  })

  it('parses ip:port as wifi', () => {
    const out = `List of devices attached\n192.168.1.42:5555 device product:foo model:Galaxy_S22\n`
    const devs = parseDevicesOutput(out)
    expect(devs[0]).toMatchObject({ id: '192.168.1.42:5555', type: 'wifi', state: 'device' })
  })

  it('parses offline / unauthorized states', () => {
    const out = `List of devices attached\nABC offline\nDEF unauthorized\n`
    const devs = parseDevicesOutput(out)
    expect(devs.map(d => d.state)).toEqual(['offline', 'unauthorized'])
  })

  it('returns empty for header-only output', () => {
    expect(parseDevicesOutput('List of devices attached\n')).toEqual([])
  })
})

function fake(map: Record<string, string>): IProcessRunner {
  return {
    async run(_cmd, args) {
      const key = args.join(' ')
      const stdout = map[key] ?? ''
      return { stdout, stderr: '', code: 0 }
    },
    spawn: vi.fn() as any,
  }
}

describe('Adb', () => {
  it('listDevices returns parsed list', async () => {
    const adb = new Adb(fake({
      'devices -l': 'List of devices attached\nABC device\n',
    }))
    const ds = await adb.listDevices()
    expect(ds).toHaveLength(1)
    expect(ds[0].id).toBe('ABC')
  })

  it('connect returns ok=true when output contains "connected"', async () => {
    const adb = new Adb({
      async run() { return { stdout: 'connected to 192.168.1.42:5555', stderr: '', code: 0 } },
      spawn: vi.fn() as any,
    })
    const r = await adb.connect('192.168.1.42')
    expect(r.ok).toBe(true)
  })

  it('connect returns ok=false on failure message', async () => {
    const adb = new Adb({
      async run() { return { stdout: '', stderr: 'unable to connect', code: 1 } },
      spawn: vi.fn() as any,
    })
    const r = await adb.connect('1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('unable')
  })

  it('getDeviceInfo combines model + version', async () => {
    const adb = new Adb(fake({
      '-s ABC shell getprop ro.product.model':         'Pixel 7',
      '-s ABC shell getprop ro.build.version.release': '14',
    }))
    const info = await adb.getDeviceInfo('ABC')
    expect(info).toEqual({ model: 'Pixel 7', androidVersion: '14' })
  })
})
