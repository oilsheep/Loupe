import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Bug, BugAnnotation, BugSeverity, ExportedMarkerFile, ExportPublishOptions, MarkerCustomField, MarkerFieldPreset, Session, SeveritySettings } from '@shared/types'
import { computeRenderFingerprint } from './render-fingerprint'
import { normalizeReportTitle } from '@shared/reportTitle'
import type { ExportQuality } from '@shared/exportQuality'

interface BuildExportManifestArgs {
  session: Session
  bugs: Bug[]
  files: ExportedMarkerFile[]
  outDir: string
  reportPdfPath?: string | null
  publish?: ExportPublishOptions
  severities?: SeveritySettings
  markerFieldPresets?: MarkerFieldPreset[]
  now?: number
  quality?: ExportQuality | null
}

export interface ExportManifestMarker {
  id: string
  offsetMs: number
  severity: Bug['severity']
  severityLabel: string
  severityColor: string
  note: string
  createdAt: string
  preSec: number
  postSec: number
  videoPath: string | null
  previewPath: string
  screenshotPath: string | null
  logcatPath: string | null
  mentionUserIds: string[]
  customFields: MarkerCustomField[]
  annotations: BugAnnotation[]      // v2
  renderFingerprint: string         // v2
}

export interface ExportManifest {
  version: 2
  createdAt: string
  exportDir: string
  reportPdfPath: string | null
  quality: { tier: string; preset: string; crf: number } | null   // v2
  publish: {
    target: 'local' | 'slack' | 'gitlab' | 'google-drive'
    targets: Array<'local' | 'slack' | 'gitlab' | 'google-drive'>
    slackThreadMode: 'single-thread' | 'per-marker-thread' | null
    gitlabMode: 'single-issue' | 'per-marker-issue' | null
  }
  session: {
    id: string
    buildVersion: string
    platform?: string
    project?: string
    profileId?: string | null
    testNote: string
    reportTitle?: string
    tester: string
    deviceId: string
    deviceModel: string
    androidVersion: string
    ramTotalGb: number | null
    graphicsDevice: string | null
    connectionMode: Session['connectionMode']
    startedAt: string
    endedAt: string | null
    durationMs: number | null
  }
  markers: ExportManifestMarker[]
}

function isoOrNull(ms: number | null): string | null {
  return typeof ms === 'number' ? new Date(ms).toISOString() : null
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

const DEFAULT_SEVERITY_STYLE: Record<BugSeverity, { label: string; color: string }> = {
  note: { label: 'default', color: '#a1a1aa' },
  major: { label: 'Critical', color: '#ff4d4f' },
  normal: { label: 'Bug', color: '#f59e0b' },
  minor: { label: 'Polish', color: '#22b8f0' },
  improvement: { label: 'Note', color: '#22c55e' },
  custom1: { label: 'custom 1', color: '#8b5cf6' },
  custom2: { label: 'custom 2', color: '#ec4899' },
  custom3: { label: 'custom 3', color: '#14b8a6' },
  custom4: { label: 'custom 4', color: '#eab308' },
}

export function severityStyle(severities: SeveritySettings | undefined, severity: BugSeverity): { label: string; color: string } {
  const configured = severities?.[severity]
  return {
    label: configured?.label?.trim() || DEFAULT_SEVERITY_STYLE[severity]?.label || severity,
    color: configured?.color || DEFAULT_SEVERITY_STYLE[severity]?.color || '#888888',
  }
}

export function effectiveCustomFields(bug: Bug, presets: MarkerFieldPreset[] | undefined): MarkerCustomField[] {
  const byKey = new Map<string, MarkerCustomField>()
  for (const preset of presets ?? []) {
    const key = preset.key.trim()
    if (!key) continue
    const value = preset.defaultValue ?? (preset.multi ? [] : '')
    byKey.set(key, { key, value: Array.isArray(value) ? value.filter(Boolean) : String(value).trim() })
  }
  for (const field of bug.customFields ?? []) {
    const key = field.key.trim()
    if (!key) continue
    byKey.set(key, { key, value: Array.isArray(field.value) ? field.value.filter(Boolean) : String(field.value).trim() })
  }
  return [...byKey.values()].filter(field => Array.isArray(field.value) ? field.value.length > 0 : field.value)
}

/** The image to attach/link for a marker: the high-res screenshot when present, else the contact-sheet preview. */
export function markerImagePath(marker: ExportManifest['markers'][number]): string {
  return marker.screenshotPath ?? marker.previewPath
}

export function buildExportManifest(args: BuildExportManifestArgs): ExportManifest {
  const fileByBug = new Map(args.files.map(file => [file.bugId, file]))
  const publish = args.publish ?? { target: 'local' as const }
  const targets = Array.from(new Set(publish.targets && publish.targets.length > 0 ? publish.targets : [publish.target]))
  const qualityForFingerprint = args.quality
    ? { preset: args.quality.preset, crf: args.quality.crf }
    : { preset: 'veryfast', crf: 20 }
  return {
    version: 2,
    createdAt: new Date(args.now ?? Date.now()).toISOString(),
    exportDir: args.outDir,
    reportPdfPath: args.reportPdfPath ?? null,
    quality: args.quality ? { tier: args.quality.tier, preset: args.quality.preset, crf: args.quality.crf } : null,
    publish: {
      target: publish.target,
      targets,
      slackThreadMode: targets.includes('slack') ? publish.slackThreadMode ?? 'single-thread' : null,
      gitlabMode: targets.includes('gitlab') ? publish.gitlabMode ?? 'single-issue' : null,
    },
    session: {
      id: args.session.id,
      buildVersion: args.session.buildVersion,
      platform: args.session.platform ?? '',
      project: args.session.project ?? '',
      profileId: args.session.profileId ?? null,
      testNote: args.session.testNote,
      reportTitle: normalizeReportTitle(args.session.reportTitle),
      tester: args.session.tester,
      deviceId: args.session.deviceId,
      deviceModel: args.session.deviceModel,
      androidVersion: args.session.androidVersion,
      ramTotalGb: args.session.ramTotalGb ?? null,
      graphicsDevice: args.session.graphicsDevice ?? null,
      connectionMode: args.session.connectionMode,
      startedAt: new Date(args.session.startedAt).toISOString(),
      endedAt: isoOrNull(args.session.endedAt),
      durationMs: args.session.durationMs,
    },
    markers: args.bugs.map(bug => {
      const file = fileByBug.get(bug.id)
      if (!file) throw new Error(`missing exported files for marker ${bug.id}`)
      const annotations = bug.annotations ?? []
      const { label: severityLabel, color: severityColor } = severityStyle(args.severities, bug.severity)
      return {
        id: bug.id,
        offsetMs: bug.offsetMs,
        severity: bug.severity,
        severityLabel,
        severityColor,
        note: bug.note,
        createdAt: new Date(bug.createdAt).toISOString(),
        preSec: bug.preSec,
        postSec: bug.postSec,
        videoPath: file.videoPath,
        previewPath: file.previewPath,
        screenshotPath: file.screenshotPath,
        logcatPath: file.logcatPath,
        mentionUserIds: bug.mentionUserIds ?? [],
        customFields: effectiveCustomFields(bug, args.markerFieldPresets),
        annotations,
        renderFingerprint: computeRenderFingerprint({
          sessionId: args.session.id,
          offsetMs: bug.offsetMs,
          preSec: bug.preSec,
          postSec: bug.postSec,
          quality: qualityForFingerprint,
          annotations,
          screenshotHash: file.screenshotHash ?? null,
          severityLabel,     // the same resolved label stored on this marker entry
          severityColor,     // the same resolved color stored on this marker entry
        }),
      }
    }),
  }
}

export function manifestToCsv(manifest: ExportManifest): string {
  const rows = [
    [
      'Session ID',
      'Build',
      'Platform',
      'Project',
      'Tester',
      'Test Note',
      'Device',
      'Android',
      'Connection',
      'Marker ID',
      'Severity',
      'Severity Label',
      'Note',
      'Offset MS',
      'Created At',
      'Video Path',
      'Preview Path',
      'Screenshot Path',
      'Logcat Path',
      'Report PDF Path',
      'Publish Target',
      'Publish Targets',
      'Slack Thread Mode',
      'GitLab Mode',
      'Custom Fields',
    ],
    ...manifest.markers.map(marker => [
      manifest.session.id,
      manifest.session.buildVersion,
      manifest.session.platform,
      manifest.session.project,
      manifest.session.tester,
      manifest.session.testNote,
      manifest.session.deviceModel,
      manifest.session.androidVersion,
      manifest.session.connectionMode,
      marker.id,
      marker.severity,
      marker.severityLabel,
      marker.note,
      marker.offsetMs,
      marker.createdAt,
      marker.videoPath ?? '',
      marker.previewPath,
      marker.screenshotPath ?? '',
      marker.logcatPath ?? '',
      manifest.reportPdfPath ?? '',
      manifest.publish.target,
      manifest.publish.targets.join(';'),
      manifest.publish.slackThreadMode ?? '',
      manifest.publish.gitlabMode ?? '',
      marker.customFields.map(field => `${field.key}=${Array.isArray(field.value) ? field.value.join(';') : field.value}`).join('\n'),
    ]),
  ]
  return `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`
}

function markerTitle(marker: ExportManifest['markers'][number]): string {
  const note = marker.note.trim() || 'No note'
  return `[${marker.severityLabel || marker.severity}] ${note}`
}

function markerCustomValue(marker: ExportManifest['markers'][number], key: string): string {
  const wanted = key.trim().toLocaleLowerCase()
  const field = marker.customFields.find(item => item.key === key || item.key.trim().toLocaleLowerCase() === wanted)
  if (!field) return ''
  return Array.isArray(field.value) ? field.value.join(', ') : field.value
}

function templateContext(manifest: ExportManifest, marker?: ExportManifest['markers'][number]): Record<string, string> {
  const session = manifest.session
  const ctx: Record<string, string> = {
    exportCreatedAt: manifest.createdAt,
    markerCount: String(manifest.markers.length),
    sessionId: session.id,
    buildVersion: session.buildVersion,
    platform: session.platform ?? '',
    project: session.project ?? '',
    testNote: session.testNote,
    tester: session.tester,
    deviceId: session.deviceId,
    deviceModel: session.deviceModel,
    androidVersion: session.androidVersion,
    connectionMode: session.connectionMode,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? '',
  }
  if (marker) {
    Object.assign(ctx, {
      markerId: marker.id,
      offsetMs: String(marker.offsetMs),
      offsetSeconds: String(Math.round(marker.offsetMs / 1000)),
      severity: marker.severity,
      severityLabel: marker.severityLabel,
      note: marker.note,
      markerCreatedAt: marker.createdAt,
      videoPath: marker.videoPath ?? '',
      previewPath: marker.previewPath,
      logcatPath: marker.logcatPath ?? '',
    })
    for (const field of marker.customFields) {
      const value = Array.isArray(field.value) ? field.value.join(', ') : field.value
      ctx[field.key] = value
      ctx[field.key.trim().toLocaleLowerCase()] = value
      ctx[`custom.${field.key}`] = value
      ctx[`custom.${field.key.trim().toLocaleLowerCase()}`] = value
    }
  }
  return ctx
}

export function renderPublishTemplate(template: string, manifest: ExportManifest, marker?: ExportManifest['markers'][number]): string {
  const context = templateContext(manifest, marker)
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key: string) => {
    key = key.trim()
    if (key.startsWith('custom.') && marker) return markerCustomValue(marker, key.slice('custom.'.length))
    return context[key] ?? context[key.trim().toLocaleLowerCase()] ?? ''
  }).trim()
}

export function slackSessionMessage(manifest: ExportManifest): string {
  const lines = [
    'Loupe QA Export',
    '',
    `Build: ${manifest.session.buildVersion || '(none)'}`,
    `Platform: ${manifest.session.platform || '(none)'}`,
    `Project: ${manifest.session.project || '(none)'}`,
    `Tester: ${manifest.session.tester || '(none)'}`,
    `Device: ${manifest.session.deviceModel || '(none)'} / Android ${manifest.session.androidVersion || '(none)'}`,
    `Markers: ${manifest.markers.length}`,
    '',
    ...manifest.markers.map((marker, index) => `${index + 1}. ${markerTitle(marker)}`),
    '',
    'Files:',
    '- export-manifest.json',
    '- export-manifest.csv',
    ...(manifest.reportPdfPath ? ['- Detailed PDF report'] : []),
  ]
  return `${lines.join('\n')}\n`
}

export function slackThreadPayload(manifest: ExportManifest): {
  mode: 'single-thread' | 'per-marker-thread' | null
  sessionMessage: string
  reportPdfPath: string | null
  markers: Array<{ markerId: string; text: string; files: string[] }>
} {
  return {
    mode: manifest.publish.slackThreadMode,
    sessionMessage: slackSessionMessage(manifest).trimEnd(),
    reportPdfPath: manifest.reportPdfPath,
    markers: manifest.markers.map(marker => ({
      markerId: marker.id,
      text: markerTitle(marker),
      files: [marker.videoPath].filter((p): p is string => p != null),
    })),
  }
}

export function writeExportManifests(args: BuildExportManifestArgs): { manifest: ExportManifest; jsonPath: string; csvPath: string; slackPlanPath: string | null } {
  const manifest = buildExportManifest(args)
  const jsonPath = join(args.outDir, 'export-manifest.json')
  const csvPath = join(args.outDir, 'export-manifest.csv')
  let slackPlanPath: string | null = null
  writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  writeFileSync(csvPath, manifestToCsv(manifest), 'utf8')
  if (manifest.publish.targets.includes('slack')) {
    slackPlanPath = join(args.outDir, 'slack-publish-plan.json')
    writeFileSync(slackPlanPath, `${JSON.stringify(slackThreadPayload(manifest), null, 2)}\n`, 'utf8')
  }
  return { manifest, jsonPath, csvPath, slackPlanPath }
}
