import type { IProcessRunner, SpawnedProcess } from './process-runner'
import type { Device, MdnsEntry } from '@shared/types'

const IP_PORT = /^\d{1,3}(\.\d{1,3}){3}:\d+$/

function connectFailureHint(port: number): string | null {
  if (port === 5555) return 'Make sure the phone and this Mac are on the same network and that Wireless debugging is enabled on the device.'
  return 'This port may be the pairing port shown by Android Wireless debugging. Pair first, then connect to the ready/connect port from the Scan Wi-Fi devices list.'
}

export function parseDevicesOutput(stdout: string): Device[] {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean)
  const devs: Device[] = []
  for (const line of lines) {
    if (line.toLowerCase().startsWith('list of devices')) continue
    const parts = line.split(/\s+/)
    if (parts.length < 2) continue
    const [id, state] = parts
    if (state !== 'device' && state !== 'offline' && state !== 'unauthorized') continue
    const modelToken = parts.find(p => p.startsWith('model:'))
    const model = modelToken?.slice('model:'.length).replace(/_/g, ' ')
    devs.push({
      id,
      type: IP_PORT.test(id) ? 'wifi' : 'usb',
      state: state as Device['state'],
      model,
    })
  }
  return devs
}

export function parseMdnsOutput(stdout: string): MdnsEntry[] {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean)
  const entries: MdnsEntry[] = []
  for (const line of lines) {
    if (line.toLowerCase().startsWith('list of discovered mdns services')) continue
    const parts = line.split(/\s+/)
    const rawType = parts.find(p => {
      const t = p.replace(/\.$/, '')
      return t === '_adb-tls-pairing._tcp' || t === '_adb-tls-connect._tcp'
    })
    const ipPort = parts.find(p => IP_PORT.test(p))
    if (!rawType || !ipPort) continue
    const type = rawType.replace(/\.$/, '')
    const name = parts.find(p => p !== rawType && p !== ipPort && !p.includes(':')) ?? ipPort
    let entryType: 'pair' | 'connect'
    if (type === '_adb-tls-pairing._tcp') entryType = 'pair'
    else if (type === '_adb-tls-connect._tcp') entryType = 'connect'
    else continue
    entries.push({ name, type: entryType, ipPort })
  }
  return entries
}

export class Adb {
  constructor(private runner: IProcessRunner) {}

  async listDevices(): Promise<Device[]> {
    const r = await this.runner.run('adb', ['devices', '-l'])
    return parseDevicesOutput(r.stdout)
  }

  async connect(ip: string, port = 5555): Promise<{ ok: boolean; message: string }> {
    const r = await this.runner.run('adb', ['connect', `${ip}:${port}`])
    const out = (r.stdout + r.stderr).trim()
    const ok = out.toLowerCase().includes('connected') && r.code === 0
    if (ok) return { ok, message: out }
    const hint = connectFailureHint(port)
    return { ok, message: hint ? `${out}. ${hint}` : out }
  }

  async disconnect(idOrIp: string): Promise<void> {
    await this.runner.run('adb', ['disconnect', idOrIp])
  }

  async getProp(deviceId: string, prop: string): Promise<string> {
    const r = await this.runner.run('adb', ['-s', deviceId, 'shell', 'getprop', prop])
    return r.stdout.trim()
  }

  async shell(deviceId: string, args: string[]): Promise<string> {
    const r = await this.runner.run('adb', ['-s', deviceId, 'shell', ...args])
    if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `adb shell failed with code ${r.code}`)
    return r.stdout.trim()
  }

  async getDeviceInfo(deviceId: string): Promise<{ model: string; androidVersion: string }> {
    const [model, androidVersion] = await Promise.all([
      this.getProp(deviceId, 'ro.product.model'),
      this.getProp(deviceId, 'ro.build.version.release'),
    ])
    return { model, androidVersion }
  }

  async getUserDeviceName(deviceId: string): Promise<string | null> {
    const candidates = [
      ['settings', 'get', 'global', 'device_name'],
      ['settings', 'get', 'system', 'device_name'],
      ['settings', 'get', 'secure', 'bluetooth_name'],
    ]
    for (const args of candidates) {
      const r = await this.runner.run('adb', ['-s', deviceId, 'shell', ...args])
      const value = r.stdout.trim()
      if (r.code === 0 && value && value !== 'null') return value
    }
    return null
  }

  async mdnsServices(): Promise<MdnsEntry[]> {
    const r = await this.runner.run('adb', ['mdns', 'services'])
    return parseMdnsOutput([r.stdout, r.stderr].filter(Boolean).join('\n'))
  }

  async pair(ipPort: string, code: string): Promise<{ ok: boolean; message: string }> {
    const r = await this.runner.run('adb', ['pair', ipPort, code])
    const out = (r.stdout + r.stderr).trim()
    return { ok: out.toLowerCase().includes('successfully paired') && r.code === 0, message: out }
  }

  /** Spawns a long-running process for streaming (used by logcat + screenshot binary streams). */
  spawnRaw(args: string[]): SpawnedProcess {
    return this.runner.spawn('adb', args)
  }
}
