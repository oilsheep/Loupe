import { describe, it, expect } from 'vitest'
import { clampClipSec, formatOffset, parseOffset } from '@/components/BugList'

describe('clampClipSec', () => {
  it('clamps to [0, maxSec] at 0.1s precision', () => {
    expect(clampClipSec(-5, 30)).toBe(0)
    expect(clampClipSec(999, 30)).toBe(30)
    expect(clampClipSec(4.26, 30)).toBe(4.3)
  })

  it('allows negative values when a negative minSec is given (window on one side of the marker)', () => {
    expect(clampClipSec(-5, 30, -30)).toBe(-5)
    expect(clampClipSec(-50, 30, -30)).toBe(-30)
    expect(clampClipSec(10, 30, -30)).toBe(10)
  })
})

describe('offset format/parse', () => {
  it('round-trips mm:ss.x', () => {
    expect(formatOffset(65400)).toBe('1:05.4')
    expect(parseOffset('1:05.4')).toBe(65400)
    expect(parseOffset('12.5')).toBe(12500)
    expect(parseOffset('garbage')).toBeNull()
  })
})
