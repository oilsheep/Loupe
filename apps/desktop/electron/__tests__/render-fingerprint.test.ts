import { describe, it, expect } from 'vitest'
import { computeRenderFingerprint, FINGERPRINT_ALGO_VERSION } from '../render-fingerprint'
import type { BugAnnotation } from '@shared/types'

const base = {
  sessionId: 's1', offsetMs: 1000, preSec: 5, postSec: 5,
  quality: { preset: 'veryfast', crf: 20 }, annotations: [] as BugAnnotation[], screenshotHash: 'abc',
  severityLabel: 'Bug', severityColor: '#f59e0b',
}

describe('computeRenderFingerprint', () => {
  it('algo version is 2', () => {
    expect(FINGERPRINT_ALGO_VERSION).toBe(2)
  })
  it('changes when severityLabel changes', () => {
    expect(computeRenderFingerprint(base)).not.toBe(computeRenderFingerprint({ ...base, severityLabel: 'Critical' }))
  })
  it('changes when severityColor changes', () => {
    expect(computeRenderFingerprint(base)).not.toBe(computeRenderFingerprint({ ...base, severityColor: '#ff0000' }))
  })
  it('is stable for identical input and prefixed sha256:', () => {
    const a = computeRenderFingerprint(base)
    const b = computeRenderFingerprint({ ...base })
    expect(a).toBe(b)
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
  it('changes when quality changes', () => {
    expect(computeRenderFingerprint(base))
      .not.toBe(computeRenderFingerprint({ ...base, quality: { preset: 'slow', crf: 16 } }))
  })
  it('changes when the time window changes', () => {
    expect(computeRenderFingerprint(base)).not.toBe(computeRenderFingerprint({ ...base, preSec: 8 }))
    expect(computeRenderFingerprint(base)).not.toBe(computeRenderFingerprint({ ...base, offsetMs: 2000 }))
  })
  it('changes when the screenshot hash changes', () => {
    expect(computeRenderFingerprint(base)).not.toBe(computeRenderFingerprint({ ...base, screenshotHash: 'xyz' }))
  })
  it('is independent of annotation array order (sorted by id)', () => {
    const a1: BugAnnotation = { id: 'a', bugId: 'b', x: 0, y: 0, width: 1, height: 1, startMs: 0, endMs: 1, createdAt: 0 }
    const a2: BugAnnotation = { id: 'b', bugId: 'b', x: 0.5, y: 0.5, width: 1, height: 1, startMs: 0, endMs: 1, createdAt: 0 }
    expect(computeRenderFingerprint({ ...base, annotations: [a1, a2] }))
      .toBe(computeRenderFingerprint({ ...base, annotations: [a2, a1] }))
  })
  it('changes when an annotation geometry changes', () => {
    const a1: BugAnnotation = { id: 'a', bugId: 'b', x: 0, y: 0, width: 1, height: 1, startMs: 0, endMs: 1, createdAt: 0 }
    expect(computeRenderFingerprint({ ...base, annotations: [a1] }))
      .not.toBe(computeRenderFingerprint({ ...base, annotations: [{ ...a1, x: 0.9 }] }))
  })
})
