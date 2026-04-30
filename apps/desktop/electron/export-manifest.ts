import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Bug, BugSeverity, ExportedMarkerFile, ExportPublishOptions, Session, SeveritySettings } from '@shared/types'

interface BuildExportManifestArgs {
  session: Session
  bugs: Bug[]
  files: ExportedMarkerFile[]
  outDir: string
  reportPdfPath?: string | null
  publish?: ExportPublishOptions
  severities?: SeveritySettings
  now?: number
}

export interface ExportManifest {
  version: 1
  createdAt: string
  exportDir: string
  reportPdfPath: string | null
  publish: {
    target: 'local' | 'slack' | 'gitlab' | 'google-drive'
    targets: Array<'local' | 'slack' | 'gitlab' | 'google-drive'>
    slackThreadMode: 'single-thread' | 'per-marker-thread' | null
    gitlabMode: 'single-issue' | 'per-marker-issue' | null
  }
  session: {
    id: string
    buildVersion: string
    testNote: string
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
  markers: Array<{
    id: string
    offsetMs: number
    severity: Bug['severity']
    severityLabel: string
    severityColor: string
    note: string
    createdAt: string
    preSec: number
    postSec: number
    videoPath: string
    previewPath: string
    logcatPath: string | null
    mentionUserIds: string[]
  }>
}

function isoOrNull(ms: number | null): string | null {
  return typeof ms === 'number' ? new Date(ms).toISOString() : null
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

const DEFAULT_SEVERITY_STYLE: Record<BugSeverity, { label: string; color: string }> = {
  note: { label: 'note', color: '#a1a1aa' },
  major: { label: 'Critical', color: '#ff4d4f' },
  normal: { label: 'Bug', color: '#f59e0b' },
  minor: { label: 'Polish', color: '#22b8f0' },
  improvement: { label: 'Note', color: '#22c55e' },
  custom1: { label: 'custom 1', color: '#8b5cf6' },
  custom2: { label: 'custom 2', color: '#ec4899' },
  custom3: { label: 'custom 3', color: '#14b8a6' },
  custom4: { label: 'custom 4', color: '#eab308' },
}

function severityStyle(severities: SeveritySettings | undefined, severity: BugSeverity): { label: string; color: string } {
  const configured = severities?.[severity]
  return {
    label: configured?.label?.trim() || DEFAULT_SEVERITY_STYLE[severity]?.label || severity,
    color: configured?.color || DEFAULT_SEVERITY_STYLE[severity]?.color || '#888888',
  }
}

export function buildExportManifest(args: BuildExportManifestArgs): ExportManifest {
  const fileByBug = new Map(args.files.map(file => [file.bugId, file]))
  const publish = args.publish ?? { target: 'local' as const }
  const targets = Array.from(new Set(publish.targets && publish.targets.length > 0 ? publish.targets : [publish.target]))
  return {
    version: 1,
    createdAt: new Date(args.now ?? Date.now()).toISOString(),
    exportDir: args.outDir,
    reportPdfPath: args.reportPdfPath ?? null,
    publish: {
      target: publish.target,
      targets,
      slackThreadMode: targets.includes('slack') ? publish.slackThreadMode ?? 'single-thread' : null,
      gitlabMode: targets.includes('gitlab') ? publish.gitlabMode ?? 'single-issue' : null,
    },
    session: {
      id: args.session.id,
      buildVersion: args.session.buildVersion,
      testNote: args.session.testNote,
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
      return {
        id: bug.id,
        offsetMs: bug.offsetMs,
        severity: bug.severity,
        severityLabel: severityStyle(args.severities, bug.severity).label,
        severityColor: severityStyle(args.severities, bug.severity).color,
        note: bug.note,
        createdAt: new Date(bug.createdAt).toISOString(),
        preSec: bug.preSec,
        postSec: bug.postSec,
        videoPath: file.videoPath,
        previewPath: file.previewPath,
        logcatPath: file.logcatPath,
        mentionUserIds: bug.mentionUserIds ?? [],
      }
    }),
  }
}

export function manifestToCsv(manifest: ExportManifest): string {
  const rows = [
    [
      'Session ID',
      'Build',
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
      'Logcat Path',
      'Report PDF Path',
      'Publish Target',
      'Publish Targets',
      'Slack Thread Mode',
      'GitLab Mode',
    ],
    ...manifest.markers.map(marker => [
      manifest.session.id,
      manifest.session.buildVersion,
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
      marker.videoPath,
      marker.previewPath,
      marker.logcatPath ?? '',
      manifest.reportPdfPath ?? '',
      manifest.publish.target,
      manifest.publish.targets.join(';'),
      manifest.publish.slackThreadMode ?? '',
      manifest.publish.gitlabMode ?? '',
    ]),
  ]
  return `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`
}

function markerTitle(marker: ExportManifest['markers'][number]): string {
  const note = marker.note.trim() || 'No note'
  return `[${marker.severityLabel || marker.severity}] ${note}`
}

export function slackSessionMessage(manifest: ExportManifest): string {
  const lines = [
    'Loupe QA Export',
    '',
    `Build: ${manifest.session.buildVersion || '(none)'}`,
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
      files: [marker.videoPath],
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
