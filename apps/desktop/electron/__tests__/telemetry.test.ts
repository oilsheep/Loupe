import { describe, expect, it } from 'vitest'
import { formatTelemetryLine, nearestTelemetrySample, parseBatteryDump, parseMemInfo } from '../telemetry'

describe('telemetry parsing', () => {
  it('formats compact Android telemetry for exported captions', () => {
    const battery = parseBatteryDump(`
      AC powered: false
      USB powered: true
      status: 2
      level: 73
      temperature: 382
    `)
    const mem = parseMemInfo(`
MemTotal:        8388608 kB
MemAvailable:   3984589 kB
    `)

    expect(formatTelemetryLine({ offsetMs: 0, capturedAt: 1, ...battery, ...mem }))
      .toBe('RAM 4.2/8.0G, 73% charging / 38.2°C')
  })

  it('uses the nearest sample to the marker offset', () => {
    const sample = nearestTelemetrySample([
      { offsetMs: 0, capturedAt: 1, batteryLevel: 60 },
      { offsetMs: 10_000, capturedAt: 2, batteryLevel: 61 },
      { offsetMs: 20_000, capturedAt: 3, batteryLevel: 62 },
    ], 13_500)

    expect(sample?.batteryLevel).toBe(61)
  })
})
