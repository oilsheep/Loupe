import type { IProcessRunner, SpawnedProcess } from './process-runner'
import type { Device, MdnsEntry } from '@shared/types'

const IP_PORT = /^\d{1,3}(\.\d{1,3}){3}:\d+$/

export function parseDevicesOutput(stdout: string): Device[] {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean)
  const devs: Device[] = []
  for (const line of lines) {
    if (line.toLowerCase().startsWith('list of devices')) continue
    const parts = line.split(/\s+/)
    if (parts.length < 2) continue
    const [id, state] = parts
    if (state !== 'device' && state !== 'offline' && state !== 'unauthorized') continue
    devs.push({
      id,
      type: IP_PORT.test(id) ? 'wifi' : 'usb',
      state: state as Device['state'],
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
    if (parts.length !== 3) continue
    const [name, rawType, ipPort] = parts
    const type = rawType.replace(/\.$/, '')
    let entryType: 'pair' | 'connect'
    if (type === '_adb-tls-pairing._tcp') entryType = 'pair'
    else if (type === '_adb-tls-connect._tcp') entryType = 'connect'
    else continue
    if (!IP_PORT.test(ipPort)) continue
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
    return { ok: out.toLowerCase().includes('connected') && r.code === 0, message: out }
  }

  async disconnect(idOrIp: string): Promise<void> {
    await this.runner.run('adb', ['disconnect', idOrIp])
  }

  async getProp(deviceId: string, prop: string): Promise<string> {
    const r = await this.runner.run('adb', ['-s', deviceId, 'shell', 'getprop', prop])
    return r.stdout.trim()
  }

  async getDeviceInfo(deviceId: string): Promise<{ model: string; androidVersion: string }> {
    const [model, androidVersion] = await Promise.all([
      this.getProp(deviceId, 'ro.product.model'),
      this.getProp(deviceId, 'ro.build.version.release'),
    ])
    return { model, androidVersion }
  }

  async mdnsServices(): Promise<MdnsEntry[]> {
    const r = await this.runner.run('adb', ['mdns', 'services'])
    return parseMdnsOutput(r.stdout)
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
