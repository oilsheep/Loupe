import { createHash } from 'node:crypto'
import type { BugAnnotation } from '@shared/types'

// Bump when the ffmpeg render template changes in a way that alters output for
// unchanged inputs — makes every prior export read as stale.
export const FINGERPRINT_ALGO_VERSION = 2

export interface RenderFingerprintInput {
  sessionId: string
  offsetMs: number
  preSec: number
  postSec: number
  quality: { preset: string; crf: number }
  annotations: BugAnnotation[]
  screenshotHash: string | null
  severityLabel: string
  severityColor: string
}

// Normalize one annotation to the fields that affect the rendered overlay,
// in a fixed key order, so serialization is deterministic.
function normalizeAnnotation(a: BugAnnotation) {
  return {
    id: a.id,
    kind: a.kind ?? null,
    x: a.x, y: a.y, width: a.width, height: a.height,
    points: a.points ?? null,
    text: a.text ?? null,
    startMs: a.startMs, endMs: a.endMs,
  }
}

export function computeRenderFingerprint(input: RenderFingerprintInput): string {
  // Every field here is a burned-in render input. Add new overlay-affecting fields (styling, caption text) HERE and bump FINGERPRINT_ALGO_VERSION.
  const canonical = {
    algo: FINGERPRINT_ALGO_VERSION,
    sessionId: input.sessionId,
    offsetMs: input.offsetMs,
    preSec: input.preSec,
    postSec: input.postSec,
    quality: { preset: input.quality.preset, crf: input.quality.crf },
    annotations: [...input.annotations].sort((a, b) => a.id.localeCompare(b.id)).map(normalizeAnnotation),
    screenshotHash: input.screenshotHash,
    severityLabel: input.severityLabel,
    severityColor: input.severityColor,
  }
  const hex = createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
  return `sha256:${hex}`
}
