import { describe, it, expect } from 'vitest'
import { computeExportStatus, type CurrentMarkerState } from '../export-status'
import { computeRenderFingerprint } from '../render-fingerprint'
import type { ExportManifest, ExportManifestMarker } from '../export-manifest'
import type { Bug } from '@shared/types'

function marker(over: Partial<ExportManifestMarker> = {}): ExportManifestMarker {
  return {
    id: 'm1', offsetMs: 1000, severity: 'normal', severityLabel: 'Bug', severityColor: '#f00',
    note: 'n', createdAt: '', preSec: 5, postSec: 5, videoPath: 'records/01.mp4',
    previewPath: 'records/01.jpg', screenshotPath: null, logcatPath: null,
    mentionUserIds: [], customFields: [], annotations: [], renderFingerprint: 'sha256:aaa', ...over,
  }
}
function bug(over: Partial<Bug> = {}): Bug {
  return {
    id: 'm1', sessionId: 's1', offsetMs: 1000, originalOffsetMs: 1000, severity: 'normal',
    note: 'n', screenshotRel: null, originalScreenshotRel: null, logcatRel: null, audioRel: null,
    audioDurationMs: null, createdAt: 0, preSec: 5, postSec: 5, mentionUserIds: [], customFields: [], annotations: [], ...over,
  }
}
function manifest(markers: ExportManifestMarker[], over: Partial<ExportManifest> = {}): ExportManifest {
  return {
    version: 2, createdAt: '', exportDir: '/x', reportPdfPath: null, quality: null,
    publish: { target: 'local', targets: ['local'], slackThreadMode: null, gitlabMode: null },
    session: { id: 's1', buildVersion: '1.0', testNote: '', tester: 't', deviceId: '', deviceModel: 'd', androidVersion: '', ramTotalGb: null, graphicsDevice: null, connectionMode: 'scrcpy' as any, startedAt: '', endedAt: null, durationMs: null, platform: 'android', project: 'p' },
    markers, ...over,
  }
}
const allFiles = new Set(['records/01.mp4', 'records/01.jpg'])
const cur = (b: Bug, screenshotHash: string | null = null, labelOver: { severityLabel?: string; severityColor?: string; effectiveCustomFields?: import('@shared/types').MarkerCustomField[] } = {}): CurrentMarkerState => ({
  bug: b,
  screenshotHash,
  severityLabel: labelOver.severityLabel ?? 'Bug',
  severityColor: labelOver.severityColor ?? '#f59e0b',
  effectiveCustomFields: labelOver.effectiveCustomFields ?? b.customFields ?? [],
})
const sessionFields = (over: Partial<{ buildVersion: string; tester: string; deviceModel: string; platform: string; project: string; reportTitle: string }> = {}) =>
  ({ buildVersion: '1.0', tester: 't', deviceModel: 'd', platform: 'android', project: 'p', ...over })
const q = { preset: 'veryfast', crf: 20 }

describe('computeExportStatus (non-fingerprint)', () => {
  it('v1 manifest → stale with no-fingerprint', () => {
    const m = manifest([marker()], { version: 1 as any })
    const r = computeExportStatus({ manifest: m, current: [cur(bug())], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r.status).toBe('stale')
    expect(r.reasons).toContainEqual({ kind: 'no-fingerprint' })
  })

  it('identical state → fully clean', () => {
    const b = bug()
    const fp = computeRenderFingerprint({ sessionId: 's1', offsetMs: b.offsetMs, preSec: b.preSec, postSec: b.postSec, quality: q, annotations: [], screenshotHash: 'sh1', severityLabel: 'Bug', severityColor: '#f59e0b' })
    const r = computeExportStatus({ manifest: manifest([marker({ renderFingerprint: fp })]), current: [cur(b, 'sh1')], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r).toEqual({ status: 'clean', reasons: [] })
  })

  it('marker added in DB → stale marker-added', () => {
    const r = computeExportStatus({ manifest: manifest([marker()]), current: [cur(bug()), cur(bug({ id: 'm2' }))], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r.reasons).toContainEqual({ kind: 'marker-added', markerId: 'm2' })
    expect(r.status).toBe('stale')
  })

  it('marker removed from DB → stale marker-removed', () => {
    const r = computeExportStatus({ manifest: manifest([marker(), marker({ id: 'm2' })]), current: [cur(bug())], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r.reasons).toContainEqual({ kind: 'marker-removed', markerId: 'm2' })
  })

  it('severity/note/mentions/customFields change → metadata-changed with field names', () => {
    const r = computeExportStatus({ manifest: manifest([marker()]), current: [cur(bug({ note: 'edited', severity: 'major' }))], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    const md = r.reasons.find(x => x.kind === 'metadata-changed') as any
    expect(md.markerId).toBe('m1')
    expect(md.fields.sort()).toEqual(['note', 'severity'])
  })

  it('does NOT report time (preSec) as metadata — that is the fingerprint\'s job', () => {
    const r = computeExportStatus({ manifest: manifest([marker()]), current: [cur(bug({ preSec: 9 }))], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r.reasons.some(x => x.kind === 'metadata-changed')).toBe(false)
  })

  it('missing referenced file → stale file-missing', () => {
    const r = computeExportStatus({ manifest: manifest([marker()]), current: [cur(bug())], currentQuality: q, currentSession: sessionFields(), folderFiles: new Set(['records/01.jpg']) })
    expect(r.reasons).toContainEqual({ kind: 'file-missing', path: 'records/01.mp4' })
  })

  it('mentionUserIds same ids different order → NO metadata-changed', () => {
    const m = marker({ mentionUserIds: ['u1', 'u2'] })
    const b = bug({ mentionUserIds: ['u2', 'u1'] })
    const fp = computeRenderFingerprint({ sessionId: 's1', offsetMs: b.offsetMs, preSec: b.preSec, postSec: b.postSec, quality: q, annotations: [], screenshotHash: null, severityLabel: 'Bug', severityColor: '#f59e0b' })
    const r = computeExportStatus({ manifest: manifest([{ ...m, renderFingerprint: fp }]), current: [cur(b, null)], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r.reasons.some(x => x.kind === 'metadata-changed')).toBe(false)
  })

  it('logcatPath missing from folder → file-missing', () => {
    const m = marker({ logcatPath: 'records/01.logcat' })
    const filesWithoutLogcat = new Set(['records/01.mp4', 'records/01.jpg'])
    const r = computeExportStatus({ manifest: manifest([m]), current: [cur(bug())], currentQuality: q, currentSession: sessionFields(), folderFiles: filesWithoutLogcat })
    expect(r.reasons).toContainEqual({ kind: 'file-missing', path: 'records/01.logcat' })
  })
})

describe('computeExportStatus (absolute manifest paths)', () => {
  it('absolute videoPath/previewPath in manifest → still clean (no false file-missing)', () => {
    // Regression: manifest stores absolute paths; folderFiles has relative paths.
    // The comparison must relativize before checking.
    const b = bug()
    const fp = computeRenderFingerprint({ sessionId: 's1', offsetMs: b.offsetMs, preSec: b.preSec, postSec: b.postSec, quality: q, annotations: [], screenshotHash: null, severityLabel: 'Bug', severityColor: '#f59e0b' })
    const m = marker({ renderFingerprint: fp, videoPath: '/x/records/01.mp4', previewPath: '/x/records/01.jpg' })
    const folderFiles = new Set(['records/01.mp4', 'records/01.jpg'])
    const r = computeExportStatus({
      manifest: manifest([m], { exportDir: '/x' }),
      current: [cur(b, null)],
      currentQuality: q,
      currentSession: sessionFields(),
      folderFiles,
    })
    expect(r.reasons.filter(x => x.kind === 'file-missing')).toEqual([])
    expect(r.status).toBe('clean')
  })
})

describe('computeExportStatus (fingerprint clip-stale)', () => {
  // Build a marker whose stored fingerprint matches bug b at quality q + screenshotHash sh + label/color.
  function syncedMarker(b: Bug, sh: string | null, quality = q, over: Partial<ExportManifestMarker> = {}, severityLabel = 'Bug', severityColor = '#f59e0b'): ExportManifestMarker {
    const fp = computeRenderFingerprint({ sessionId: 's1', offsetMs: b.offsetMs, preSec: b.preSec, postSec: b.postSec, quality, annotations: b.annotations ?? [], screenshotHash: sh, severityLabel, severityColor })
    return marker({ id: b.id, renderFingerprint: fp, ...over })
  }

  it('identical render inputs → clean', () => {
    const b = bug()
    const r = computeExportStatus({ manifest: manifest([syncedMarker(b, 'sh1')]), current: [cur(b, 'sh1')], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r.status).toBe('clean')
    expect(r.reasons).toEqual([])
  })

  it('current quality differs from export-time → clip-stale', () => {
    const b = bug()
    const m = syncedMarker(b, 'sh1', { preset: 'veryfast', crf: 20 })   // stored at balanced
    const r = computeExportStatus({ manifest: manifest([m]), current: [cur(b, 'sh1')], currentQuality: { preset: 'slow', crf: 16 }, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r.reasons).toContainEqual({ kind: 'clip-stale', markerId: 'm1' })
  })

  it('time window change → clip-stale', () => {
    const b = bug()
    const m = syncedMarker(b, 'sh1')
    const r = computeExportStatus({ manifest: manifest([m]), current: [cur(bug({ preSec: 9 }), 'sh1')], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r.reasons).toContainEqual({ kind: 'clip-stale', markerId: 'm1' })
  })

  it('screenshot change → clip-stale', () => {
    const b = bug()
    const m = syncedMarker(b, 'sh1')
    const r = computeExportStatus({ manifest: manifest([m]), current: [cur(b, 'sh2')], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r.reasons).toContainEqual({ kind: 'clip-stale', markerId: 'm1' })
  })

  it('annotation change → clip-stale', () => {
    const ann = { id: 'a', bugId: 'm1', x: 0, y: 0, width: 1, height: 1, startMs: 0, endMs: 1, createdAt: 0 }
    const b = bug({ annotations: [ann] })
    const m = syncedMarker(b, 'sh1')
    const r = computeExportStatus({ manifest: manifest([m]), current: [cur(bug({ annotations: [{ ...ann, x: 0.9 }] }), 'sh1')], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r.reasons).toContainEqual({ kind: 'clip-stale', markerId: 'm1' })
  })

  it('severity label change (settings relabel) → clip-stale', () => {
    const b = bug()
    const m = syncedMarker(b, 'sh1')
    const r = computeExportStatus({
      manifest: manifest([m]),
      current: [cur(b, 'sh1', { severityLabel: 'Critical', severityColor: '#f59e0b' })],
      currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles,
    })
    expect(r.reasons).toContainEqual({ kind: 'clip-stale', markerId: 'm1' })
  })

  it('session field change (buildVersion) → session-changed with field names', () => {
    const b = bug()
    const m = syncedMarker(b, 'sh1')
    const r = computeExportStatus({
      manifest: manifest([m]),
      current: [cur(b, 'sh1')],
      currentQuality: q, currentSession: sessionFields({ buildVersion: '2.0' }), folderFiles: allFiles,
    })
    expect(r.reasons).toContainEqual({ kind: 'session-changed', fields: ['buildVersion'] })
  })

  it('report title change → session-changed (report title is persisted per session)', () => {
    const b = bug()
    const m = syncedMarker(b, 'sh1')
    const r = computeExportStatus({
      manifest: manifest([m]),
      current: [cur(b, 'sh1')],
      currentQuality: q, currentSession: sessionFields({ reportTitle: 'Different Title' }), folderFiles: allFiles,
    })
    expect(r.reasons).toContainEqual({ kind: 'session-changed', fields: ['reportTitle'] })
  })

  it('unchanged session + label/color → clean', () => {
    const b = bug()
    const m = syncedMarker(b, 'sh1')
    const r = computeExportStatus({ manifest: manifest([m]), current: [cur(b, 'sh1')], currentQuality: q, currentSession: sessionFields(), folderFiles: allFiles })
    expect(r).toEqual({ status: 'clean', reasons: [] })
  })
})

describe('computeExportStatus (customFields preset-fill regression)', () => {
  // Reproduces the false-stale bug:
  // DB customFields = [] (raw), but manifest stores preset-filled values.
  // The dirty-check must compare effectiveCustomFields (same normalization) against the manifest,
  // not bug.customFields (raw), so a freshly-exported session is clean.
  const presetFilled: import('@shared/types').MarkerCustomField[] = [
    { key: '分類', value: 'List' },
    { key: '回報人', value: '內部回報' },
    { key: '優先級', value: '一般' },
    { key: '狀態', value: ':zzz: 等待分配' },
  ]

  function syncedMarkerCustom(b: Bug, sh: string | null, customFields: import('@shared/types').MarkerCustomField[]): ExportManifestMarker {
    const fp = computeRenderFingerprint({ sessionId: 's1', offsetMs: b.offsetMs, preSec: b.preSec, postSec: b.postSec, quality: q, annotations: b.annotations ?? [], screenshotHash: sh, severityLabel: 'Bug', severityColor: '#f59e0b' })
    return marker({ id: b.id, renderFingerprint: fp, customFields })
  }

  it('bug.customFields=[] but effectiveCustomFields matches manifest → NO metadata-changed (false-stale regression)', () => {
    // The bug: manifest stores preset-filled fields; DB has []; current effectiveCustomFields = preset-filled.
    // After fix: compare effectiveCustomFields vs manifest.customFields → equal → no diff.
    const b = bug({ customFields: [] })
    const m = syncedMarkerCustom(b, null, presetFilled)
    // CurrentMarkerState now carries effectiveCustomFields = preset-filled (normalized by caller)
    const r = computeExportStatus({
      manifest: manifest([m]),
      current: [cur(b, null, { effectiveCustomFields: presetFilled })],
      currentQuality: q,
      currentSession: sessionFields(),
      folderFiles: allFiles,
    })
    expect(r.reasons.some(x => x.kind === 'metadata-changed')).toBe(false)
    expect(r.status).toBe('clean')
  })

  it('effectiveCustomFields differs from manifest.customFields → metadata-changed with customFields', () => {
    // A real value change: user edited the field after export.
    const b = bug({ customFields: [] })
    const changedFields: import('@shared/types').MarkerCustomField[] = [
      ...presetFilled.slice(0, 3),
      { key: '狀態', value: ':white_check_mark: 已修正' }, // changed
    ]
    const m = syncedMarkerCustom(b, null, presetFilled)
    const r = computeExportStatus({
      manifest: manifest([m]),
      current: [cur(b, null, { effectiveCustomFields: changedFields })],
      currentQuality: q,
      currentSession: sessionFields(),
      folderFiles: allFiles,
    })
    const md = r.reasons.find(x => x.kind === 'metadata-changed') as any
    expect(md).toBeDefined()
    expect(md.fields).toContain('customFields')
  })
})
