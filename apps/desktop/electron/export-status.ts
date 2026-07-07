import { relative } from 'node:path'
import type { Bug, MarkerCustomField } from '@shared/types'
import type { ExportManifest } from './export-manifest'
import { computeRenderFingerprint } from './render-fingerprint'
import { normalizeReportTitle } from '@shared/reportTitle'

export type ExportDiffReason =
  | { kind: 'no-fingerprint' }
  | { kind: 'marker-added'; markerId: string }
  | { kind: 'marker-removed'; markerId: string }
  | { kind: 'metadata-changed'; markerId: string; fields: string[] }
  | { kind: 'clip-stale'; markerId: string }
  | { kind: 'file-missing'; path: string }
  | { kind: 'session-changed'; fields: string[] }

export interface CurrentMarkerState {
  bug: Bug
  screenshotHash: string | null   // sha256 hex of bug.screenshotRel SOURCE bytes (caller computes), or null
  severityLabel: string
  severityColor: string
  effectiveCustomFields: MarkerCustomField[]  // bug.customFields after preset-fill normalization (caller computes)
}

export interface ExportStatus {
  status: 'clean' | 'stale'
  reasons: ExportDiffReason[]
}

export interface ComputeExportStatusInput {
  manifest: ExportManifest
  current: CurrentMarkerState[]
  currentQuality: { preset: string; crf: number }
  currentSession: { buildVersion: string; tester: string; deviceModel: string; platform?: string; project?: string; reportTitle?: string }
  folderFiles: Set<string>
}

function jsonEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function isPresent(folderFiles: Set<string>, exportDir: string, p: string): boolean {
  if (folderFiles.has(p)) return true
  const rel = relative(exportDir, p).split(/[\\/]/).join('/')
  return folderFiles.has(rel)
}

// Report/caption fields owned by the metadata-diff. Time window, annotations,
// quality and screenshot are owned by the fingerprint (clip-stale) — not here.
function changedMetadataFields(
  marker: { severity: string; note: string; mentionUserIds: string[]; customFields: unknown[] },
  c: CurrentMarkerState,
): string[] {
  const fields: string[] = []
  if (c.bug.severity !== marker.severity) fields.push('severity')
  if (c.bug.note !== marker.note) fields.push('note')
  if (!jsonEq([...(c.bug.mentionUserIds ?? [])].sort(), [...(marker.mentionUserIds ?? [])].sort())) fields.push('mentionUserIds')
  // Compare effectiveCustomFields (preset-normalized) against the manifest's stored (also preset-normalized) value.
  // Comparing raw bug.customFields [] vs preset-filled manifest fields always differed → false stale.
  if (!jsonEq(c.effectiveCustomFields ?? [], marker.customFields ?? [])) fields.push('customFields')
  return fields
}

export function computeExportStatus(input: ComputeExportStatusInput): ExportStatus {
  const { manifest, current, folderFiles } = input
  const reasons: ExportDiffReason[] = []

  // v1 (or any non-v2) manifest: cannot fingerprint-compare → wholesale stale.
  if (manifest.version !== 2) {
    return { status: 'stale', reasons: [{ kind: 'no-fingerprint' }] }
  }

  // session-field drift (checked once, not per marker)
  const s = manifest.session
  const cs = input.currentSession
  const sessionChangedFields: string[] = []
  if (s.buildVersion !== cs.buildVersion) sessionChangedFields.push('buildVersion')
  if (s.tester !== cs.tester) sessionChangedFields.push('tester')
  if (s.deviceModel !== cs.deviceModel) sessionChangedFields.push('deviceModel')
  if ((s.platform ?? '') !== (cs.platform ?? '')) sessionChangedFields.push('platform')
  if ((s.project ?? '') !== (cs.project ?? '')) sessionChangedFields.push('project')
  if (normalizeReportTitle(s.reportTitle) !== normalizeReportTitle(cs.reportTitle)) sessionChangedFields.push('reportTitle')
  if (sessionChangedFields.length) reasons.push({ kind: 'session-changed', fields: sessionChangedFields })

  const manifestById = new Map(manifest.markers.map(m => [m.id, m]))
  const currentById = new Map(current.map(c => [c.bug.id, c]))

  // marker set diff
  for (const c of current) if (!manifestById.has(c.bug.id)) reasons.push({ kind: 'marker-added', markerId: c.bug.id })
  for (const m of manifest.markers) if (!currentById.has(m.id)) reasons.push({ kind: 'marker-removed', markerId: m.id })

  // per common marker
  for (const m of manifest.markers) {
    const c = currentById.get(m.id)
    if (!c) continue
    // A marker with no stored fingerprint (shouldn't happen in v2, but be safe) → stale.
    if (!m.renderFingerprint) { reasons.push({ kind: 'no-fingerprint' }); continue }
    const fields = changedMetadataFields(m, c)
    if (fields.length) reasons.push({ kind: 'metadata-changed', markerId: m.id, fields })
    const expected = computeRenderFingerprint({
      sessionId: manifest.session.id,
      offsetMs: c.bug.offsetMs,
      preSec: c.bug.preSec,
      postSec: c.bug.postSec,
      quality: input.currentQuality,
      annotations: c.bug.annotations ?? [],
      screenshotHash: c.screenshotHash,
      severityLabel: c.severityLabel,
      severityColor: c.severityColor,
    })
    if (expected !== m.renderFingerprint) reasons.push({ kind: 'clip-stale', markerId: m.id })
  }

  // referenced-file existence: manifest may store absolute paths; folderFiles has relative posix paths.
  // isPresent() handles both forms by relativizing against manifest.exportDir when needed.
  for (const m of manifest.markers) {
    for (const p of [m.videoPath, m.previewPath, m.screenshotPath, m.logcatPath]) {
      if (p && !isPresent(folderFiles, manifest.exportDir, p)) reasons.push({ kind: 'file-missing', path: p })
    }
  }

  return { status: reasons.length ? 'stale' : 'clean', reasons }
}
