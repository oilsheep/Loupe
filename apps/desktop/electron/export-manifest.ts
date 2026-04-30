import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Bug, ExportedMarkerFile, ExportPublishOptions, Session } from '@shared/types'

interface BuildExportManifestArgs {
  session: Session
  bugs: Bug[]
  files: ExportedMarkerFile[]
  outDir: string
  publish?: ExportPublishOptions
  now?: number
}

export interface ExportManifest {
  version: 1
  createdAt: string
  exportDir: string
  publish: {
    target: 'local' | 'slack'
    slackThreadMode: 'single-thread' | 'per-marker-thread' | null
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
    note: string
    createdAt: string
    preSec: number
    postSec: number
    videoPath: string
    previewPath: string
    logcatPath: string | null
  }>
}

function isoOrNull(ms: number | null): string | null {
  return typeof ms === 'number' ? new Date(ms).toISOString() : null
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function buildExportManifest(args: BuildExportManifestArgs): ExportManifest {
  const fileByBug = new Map(args.files.map(file => [file.bugId, file]))
  const publish = args.publish ?? { target: 'local' as const }
  return {
    version: 1,
    createdAt: new Date(args.now ?? Date.now()).toISOString(),
    exportDir: args.outDir,
    publish: {
      target: publish.target,
      slackThreadMode: publish.target === 'slack' ? publish.slackThreadMode ?? 'single-thread' : null,
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
        note: bug.note,
        createdAt: new Date(bug.createdAt).toISOString(),
        preSec: bug.preSec,
        postSec: bug.postSec,
        videoPath: file.videoPath,
        previewPath: file.previewPath,
        logcatPath: file.logcatPath,
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
      'Note',
      'Offset MS',
      'Created At',
      'Video Path',
      'Preview Path',
      'Logcat Path',
      'Publish Target',
      'Slack Thread Mode',
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
      marker.note,
      marker.offsetMs,
      marker.createdAt,
      marker.videoPath,
      marker.previewPath,
      marker.logcatPath ?? '',
      manifest.publish.target,
      manifest.publish.slackThreadMode ?? '',
    ]),
  ]
  return `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`
}

function markerTitle(marker: ExportManifest['markers'][number]): string {
  const note = marker.note.trim() || 'No note'
  return `[${marker.severity}] ${note}`
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
  ]
  return `${lines.join('\n')}\n`
}

export function slackThreadPayload(manifest: ExportManifest): {
  mode: 'single-thread' | 'per-marker-thread' | null
  sessionMessage: string
  markers: Array<{ markerId: string; text: string; files: string[] }>
} {
  return {
    mode: manifest.publish.slackThreadMode,
    sessionMessage: slackSessionMessage(manifest).trimEnd(),
    markers: manifest.markers.map(marker => ({
      markerId: marker.id,
      text: [
        markerTitle(marker),
        '',
        'Note:',
        marker.note.trim() || '(none)',
      ].join('\n'),
      files: [marker.videoPath, marker.previewPath, marker.logcatPath].filter(Boolean) as string[],
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
  if (manifest.publish.target === 'slack') {
    slackPlanPath = join(args.outDir, 'slack-publish-plan.json')
    writeFileSync(slackPlanPath, `${JSON.stringify(slackThreadPayload(manifest), null, 2)}\n`, 'utf8')
  }
  return { manifest, jsonPath, csvPath, slackPlanPath }
}
