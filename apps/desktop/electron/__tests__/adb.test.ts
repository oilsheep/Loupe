import { describe, it, expect, vi } from 'vitest'
import { Adb, parseDevicesOutput, parseGraphicsDevice, parseMdnsOutput, parseMemTotalGb, parsePackageListOutput } from '../adb'
import type { IProcessRunner } from '../process-runner'

describe('parseDevicesOutput', () => {
  it('parses USB device line with model', () => {
    const out = `List of devices attached\nABC123  device usb:1-2 product:foo model:Pixel_7 device:panther transport_id:1\n\n`
    const devs = parseDevicesOutput(out)
    expect(devs).toEqual([
      { id: 'ABC123', type: 'usb', state: 'device', model: 'Pixel 7' }
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
    expect(r.message).toContain('same network')
  })

  it('connect adds pairing-port guidance for non-default ports', async () => {
    const adb = new Adb({
      async run() { return { stdout: '', stderr: 'failed to connect to 10.0.4.50:42213', code: 1 } },
      spawn: vi.fn() as any,
    })
    const r = await adb.connect('10.0.4.50', 42213)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('failed to connect to 10.0.4.50:42213')
    expect(r.message).toContain('pairing port')
  })

  it('getDeviceInfo combines model + version', async () => {
    const adb = new Adb(fake({
      '-s ABC shell getprop ro.product.model':         'Pixel 7',
      '-s ABC shell getprop ro.build.version.release': '14',
      '-s ABC shell cat /proc/meminfo':                'MemTotal:        7832152 kB\n',
      '-s ABC shell dumpsys SurfaceFlinger':           'GLES: Qualcomm, Adreno (TM) 740, OpenGL ES 3.2\n',
    }))
    const info = await adb.getDeviceInfo('ABC')
    expect(info).toEqual({
      model: 'Pixel 7',
      androidVersion: '14',
      ramTotalGb: 7.5,
      graphicsDevice: 'Qualcomm Adreno (TM) 740',
    })
  })

  it('parses memory and graphics details', () => {
    expect(parseMemTotalGb('MemTotal:        8388608 kB\n')).toBe(8)
    expect(parseGraphicsDevice('GLES: Qualcomm, Adreno (TM) 740, OpenGL ES 3.2\n')).toBe('Qualcomm Adreno (TM) 740')
  })

  it('listPackages returns sorted package names', async () => {
    const adb = new Adb(fake({
      '-s ABC shell pm list packages -3': 'package:com.zeta\npackage:com.example.app\n',
    }))
    await expect(adb.listPackages('ABC')).resolves.toEqual(['com.example.app', 'com.zeta'])
  })

  it('listPackages falls back to all packages when third-party list is empty', async () => {
    const adb = new Adb(fake({
      '-s ABC shell pm list packages -3': '',
      '-s ABC shell pm list packages': 'package:android\npackage:com.example.app\n',
    }))
    await expect(adb.listPackages('ABC')).resolves.toEqual(['android', 'com.example.app'])
  })

  it('mdnsServices calls adb mdns services and returns parsed list', async () => {
    const adb = new Adb(fake({
      'mdns services': [
        'List of discovered mdns services',
        'adb-ABC123-zxcvbn  _adb-tls-pairing._tcp.  192.168.1.42:39247',
      ].join('\n'),
    }))
    const entries = await adb.mdnsServices()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({ name: 'adb-ABC123-zxcvbn', type: 'pair', ipPort: '192.168.1.42:39247' })
  })

  it('pair returns ok=true on successfully paired output', async () => {
    const adb = new Adb({
      async run() { return { stdout: 'Successfully paired to 192.168.1.42:39247', stderr: '', code: 0 } },
      spawn: vi.fn() as any,
    })
    const r = await adb.pair('192.168.1.42:39247', '123456')
    expect(r.ok).toBe(true)
  })

  it('pair returns ok=false on failure output', async () => {
    const adb = new Adb({
      async run() { return { stdout: '', stderr: 'Failed to pair: incorrect code', code: 1 } },
      spawn: vi.fn() as any,
    })
    const r = await adb.pair('192.168.1.42:39247', '000000')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('incorrect code')
  })
})

describe('parsePackageListOutput', () => {
  it('parses package list output', () => {
    expect(parsePackageListOutput('package:com.example.app\npackage:com.unity.game\n')).toEqual([
      'com.example.app',
      'com.unity.game',
    ])
  })

  it('deduplicates and accepts raw package names', () => {
    expect(parsePackageListOutput('com.example.app\npackage:com.example.app\n')).toEqual(['com.example.app'])
  })
})

describe('parseMdnsOutput', () => {
  it('parses pairing and connect entries', () => {
    const out = [
      'List of discovered mdns services',
      'adb-ABC123-zxcvbn  _adb-tls-pairing._tcp.  192.168.1.42:39247',
      'adb-ABC123-zxcvbn  _adb-tls-connect._tcp.  192.168.1.42:43615',
    ].join('\n')
    const entries = parseMdnsOutput(out)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({ name: 'adb-ABC123-zxcvbn', type: 'pair', ipPort: '192.168.1.42:39247' })
    expect(entries[1]).toEqual({ name: 'adb-ABC123-zxcvbn', type: 'connect', ipPort: '192.168.1.42:43615' })
  })

  it('skips the header line', () => {
    const out = 'List of discovered mdns services\nadb-XYZ  _adb-tls-connect._tcp.  10.0.0.1:5555'
    const entries = parseMdnsOutput(out)
    expect(entries).toHaveLength(1)
    expect(entries[0].ipPort).toBe('10.0.0.1:5555')
  })

  it('skips malformed lines (2-column and invalid ip:port)', () => {
    const out = [
      'List of discovered mdns services',
      'adb-ABC123  _adb-tls-pairing._tcp.',          // only 2 columns
      'adb-ABC123  _adb-tls-pairing._tcp.  notanip',  // invalid ip:port
      'adb-ABC123  _adb-tls-connect._tcp.  192.168.1.1:5555',  // valid
    ].join('\n')
    const entries = parseMdnsOutput(out)
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('connect')
  })

  it('parses adb mdns output with extra columns', () => {
    const out = [
      'List of discovered mdns services',
      'adb-ABC123-zxcvbn  _adb-tls-pairing._tcp.  local.  192.168.1.42:39247',
      'adb-ABC123-zxcvbn  if4  _adb-tls-connect._tcp.  local.  192.168.1.42:43615',
    ].join('\n')
    const entries = parseMdnsOutput(out)
    expect(entries).toEqual([
      { name: 'adb-ABC123-zxcvbn', type: 'pair', ipPort: '192.168.1.42:39247' },
      { name: 'adb-ABC123-zxcvbn', type: 'connect', ipPort: '192.168.1.42:43615' },
    ])
  })

  it('returns empty for header-only output', () => {
    expect(parseMdnsOutput('List of discovered mdns services\n')).toEqual([])
  })
})
