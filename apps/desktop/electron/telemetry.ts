import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import type { Adb } from './adb'

export interface TelemetrySample {
  offsetMs: number
  capturedAt: number
  ramUsedGb?: number
  ramTotalGb?: number
  batteryLevel?: number
  charging?: boolean
  temperatureC?: number
}

export interface TelemetrySamplerStartArgs {
  adb: Adb
  deviceId: string
  sessionStartedAt: number
  outputPath: string
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function parseBatteryDump(text: string): Pick<TelemetrySample, 'batteryLevel' | 'charging' | 'temperatureC'> {
  const getInt = (name: string) => {
    const match = text.match(new RegExp(`^\\s*${name}:\\s*(-?\\d+)`, 'im'))
    return match ? Number(match[1]) : undefined
  }
  const level = getInt('level')
  const status = getInt('status')
  const tempTenths = getInt('temperature')
  const powered = /^(?:\s*)(?:AC|USB|Wireless) powered:\s*true/im.test(text)
  return {
    batteryLevel: Number.isFinite(level) ? level : undefined,
    charging: powered || status === 2 || status === 5,
    temperatureC: Number.isFinite(tempTenths) ? round1((tempTenths as number) / 10) : undefined,
  }
}

export function parseMemInfo(text: string): Pick<TelemetrySample, 'ramUsedGb' | 'ramTotalGb'> {
  const getKb = (name: string) => {
    const match = text.match(new RegExp(`^${name}:\\s*(\\d+)\\s+kB`, 'im'))
    return match ? Number(match[1]) : undefined
  }
  const totalKb = getKb('MemTotal')
  const availableKb = getKb('MemAvailable')
  if (!Number.isFinite(totalKb) || !Number.isFinite(availableKb)) return {}
  const totalGb = (totalKb as number) / 1024 / 1024
  const usedGb = Math.max(0, ((totalKb as number) - (availableKb as number)) / 1024 / 1024)
  return { ramUsedGb: round1(usedGb), ramTotalGb: round1(totalGb) }
}

export function formatTelemetryLine(sample: TelemetrySample | null | undefined): string | null {
  if (!sample) return null
  const parts: string[] = []
  if (sample.ramUsedGb != null && sample.ramTotalGb != null) {
    parts.push(`RAM ${sample.ramUsedGb.toFixed(1)}/${sample.ramTotalGb.toFixed(1)}G`)
  }
  const battery = sample.batteryLevel != null
    ? `${sample.batteryLevel}%${sample.charging ? ' charging' : ''}`
    : null
  const temp = sample.temperatureC != null ? `${sample.temperatureC.toFixed(1)}°C` : null
  if (battery || temp) parts.push([battery, temp].filter(Boolean).join(' / '))
  return parts.length > 0 ? parts.join(', ') : null
}

export function readTelemetrySamples(filePath: string): TelemetrySample[] {
  if (!existsSync(filePath)) return []
  const samples: TelemetrySample[] = []
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const raw = JSON.parse(trimmed) as TelemetrySample
      if (Number.isFinite(raw.offsetMs) && Number.isFinite(raw.capturedAt)) samples.push(raw)
    } catch {
      // Ignore partial lines if the app was closed while appending telemetry.
    }
  }
  return samples
}

export function nearestTelemetrySample(samples: TelemetrySample[], offsetMs: number): TelemetrySample | null {
  let best: TelemetrySample | null = null
  let bestDistance = Infinity
  for (const sample of samples) {
    const distance = Math.abs(sample.offsetMs - offsetMs)
    if (distance < bestDistance) {
      best = sample
      bestDistance = distance
    }
  }
  return best
}

export class TelemetrySampler {
  private timer: NodeJS.Timeout | null = null
  private running = false

  start(args: TelemetrySamplerStartArgs): void {
    this.stop()
    const tick = () => {
      if (this.running) return
      this.running = true
      void this.capture(args).finally(() => { this.running = false })
    }
    tick()
    this.timer = setInterval(tick, 10_000)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async capture(args: TelemetrySamplerStartArgs): Promise<void> {
    const now = Date.now()
    try {
      const [batteryResult, memResult] = await Promise.allSettled([
        args.adb.shell(args.deviceId, ['dumpsys', 'battery']),
        args.adb.shell(args.deviceId, ['cat', '/proc/meminfo']),
      ])
      const sample: TelemetrySample = {
        offsetMs: Math.max(0, now - args.sessionStartedAt),
        capturedAt: now,
      }
      if (batteryResult.status === 'fulfilled') Object.assign(sample, parseBatteryDump(batteryResult.value))
      if (memResult.status === 'fulfilled') Object.assign(sample, parseMemInfo(memResult.value))
      if (formatTelemetryLine(sample)) appendFileSync(args.outputPath, `${JSON.stringify(sample)}\n`, 'utf8')
    } catch (err) {
      console.warn('Loupe: telemetry sample failed', err)
    }
  }
}
