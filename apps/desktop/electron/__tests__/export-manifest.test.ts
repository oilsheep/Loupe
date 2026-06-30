import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExportManifest, manifestToCsv, renderPublishTemplate, slackSessionMessage, slackThreadPayload, writeExportManifests } from '../export-manifest'
import type { Bug, ExportedMarkerFile, Session } from '@shared/types'

function session(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    buildVersion: '1.0',
    testNote: 'smoke',
    tester: 'Avery',
    deviceId: 'ABC',
    deviceModel: 'Pixel 7',
    androidVersion: '14',
    connectionMode: 'usb',
    status: 'draft',
    durationMs: 10_000,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_010_000,
    videoPath: '/session/video.mp4',
    pcRecordingEnabled: false,
    pcVideoPath: null,
    micAudioPath: null,
    micAudioDurationMs: null, micAudioStartOffsetMs: null,
    ...over,
  }
}

function bug(over: Partial<Bug> = {}): Bug {
  return {
    id: 'b1',
    sessionId: 's1',
    offsetMs: 1_000,
    originalOffsetMs: 1_000,
    severity: 'major',
    note: 'login crash',
    screenshotRel: null,
    originalScreenshotRel: null,
    logcatRel: 'logcat/b1.txt',
    audioRel: null,
    audioDurationMs: null,
    createdAt: 1_700_000_001_000,
    preSec: 5,
    postSec: 8,
    ...over,
  }
}

function file(over: Partial<ExportedMarkerFile> = {}): ExportedMarkerFile {
  return {
    bugId: 'b1',
    videoPath: '/exports/b1.mp4',
    previewPath: '/exports/b1.jpg',
    screenshotPath: null, logcatPath: '/exports/b1.logcat.txt',
    ...over,
  }
}

describe('export manifest', () => {
  it('builds Slack publish metadata and marker file references', () => {
    const manifest = buildExportManifest({
      session: session(),
      bugs: [bug()],
      files: [file()],
      outDir: '/exports',
      reportPdfPath: '/exports/QA_bug_report_1.0_2023-11-14.pdf',
      publish: { target: 'slack', slackThreadMode: 'single-thread' },
      now: 1_700_000_002_000,
    })

    expect(manifest.reportPdfPath).toBe('/exports/QA_bug_report_1.0_2023-11-14.pdf')
    expect(manifest.publish).toEqual({ target: 'slack', targets: ['slack'], slackThreadMode: 'single-thread', gitlabMode: null })
    expect(manifest.session.buildVersion).toBe('1.0')
    expect(manifest.session.ramTotalGb).toBeNull()
    expect(manifest.session.graphicsDevice).toBeNull()
    expect(manifest.markers[0]).toMatchObject({
      id: 'b1',
      severity: 'major',
      severityLabel: 'Critical',
      note: 'login crash',
      videoPath: '/exports/b1.mp4',
      previewPath: '/exports/b1.jpg',
      screenshotPath: null, logcatPath: '/exports/b1.logcat.txt',
    })
  })

  it('builds GitLab publish metadata', () => {
    const manifest = buildExportManifest({
      session: session(),
      bugs: [bug()],
      files: [file()],
      outDir: '/exports',
      publish: { target: 'gitlab', gitlabMode: 'per-marker-issue' },
    })

    expect(manifest.publish).toEqual({ target: 'gitlab', targets: ['gitlab'], slackThreadMode: null, gitlabMode: 'per-marker-issue' })
  })

  it('builds multi-target publish metadata', () => {
    const manifest = buildExportManifest({
      session: session(),
      bugs: [bug()],
      files: [file()],
      outDir: '/exports',
      publish: { target: 'slack', targets: ['slack', 'gitlab'], slackThreadMode: 'single-thread', gitlabMode: 'per-marker-issue' },
    })

    expect(manifest.publish).toEqual({ target: 'slack', targets: ['slack', 'gitlab'], slackThreadMode: 'single-thread', gitlabMode: 'per-marker-issue' })
  })

  it('writes JSON, CSV, and Slack thread payload manifests', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-export-'))
    try {
      const paths = writeExportManifests({
        session: session(),
        bugs: [bug({ note: 'quote "inside"' })],
        files: [file()],
        outDir: root,
        reportPdfPath: join(root, 'QA_bug_report_1.0_2023-11-14.pdf'),
        publish: { target: 'slack', slackThreadMode: 'single-thread' },
        now: 1_700_000_002_000,
      })

      expect(paths.jsonPath).toBe(join(root, 'export-manifest.json'))
      expect(paths.csvPath).toBe(join(root, 'export-manifest.csv'))
      expect(paths.slackPlanPath).toBe(join(root, 'slack-publish-plan.json'))
      expect(JSON.parse(readFileSync(paths.jsonPath, 'utf8')).markers[0].note).toBe('quote "inside"')
      expect(readFileSync(paths.csvPath, 'utf8')).toContain('"quote ""inside"""')
      expect(JSON.parse(readFileSync(paths.jsonPath, 'utf8')).reportPdfPath).toBe(join(root, 'QA_bug_report_1.0_2023-11-14.pdf'))
      expect(JSON.parse(readFileSync(paths.slackPlanPath!, 'utf8')).reportPdfPath).toBe(join(root, 'QA_bug_report_1.0_2023-11-14.pdf'))
      expect(JSON.parse(readFileSync(paths.slackPlanPath!, 'utf8')).markers[0].files).toContain('/exports/b1.mp4')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('renders CSV rows for spreadsheet import', () => {
    const csv = manifestToCsv(buildExportManifest({
      session: session(),
      bugs: [bug({ customFields: [{ key: 'priority', value: 'high' }, { key: 'targets', value: ['gitlab', 'slack'] }] })],
      files: [file()],
      outDir: '/exports',
    }))

    expect(csv).toContain('"Build"')
    expect(csv).toContain('"Tester"')
    expect(csv).toContain('"Custom Fields"')
    expect(csv).toContain('"1.0"')
    expect(csv).toContain('"Avery"')
    expect(csv).toContain('"/exports/b1.logcat.txt"')
    expect(csv).toContain('"priority=high\ntargets=gitlab;slack"')
  })

  it('renders publish templates with custom marker fields', () => {
    const manifest = buildExportManifest({
      session: session({ project: 'Arcade' }),
      bugs: [bug({ customFields: [{ key: 'priority', value: 'high' }, { key: 'targets', value: ['gitlab', 'slack'] }] })],
      files: [file()],
      outDir: '/exports',
    })

    expect(renderPublishTemplate('{{project}} / {{severityLabel}} / {{priority}} / {{custom.targets}}', manifest, manifest.markers[0]))
      .toBe('Arcade / Critical / high / gitlab, slack')
    expect(renderPublishTemplate('{{Priority}} / {{custom.TARGETS}}', manifest, manifest.markers[0]))
      .toBe('high / gitlab, slack')
  })

  it('renders publish templates with Chinese custom marker field keys', () => {
    const manifest = buildExportManifest({
      session: session({ project: '圖鑑' }),
      bugs: [bug({ note: '從角色圖鑑回顧完劇情後頁籤會顯示在角色資料', customFields: [
        { key: '分類', value: 'List' },
        { key: '回報人', value: '內部回報' },
        { key: '優先級', value: '一般' },
        { key: '狀態', value: ':zzz: 等待分配' },
      ] })],
      files: [file()],
      outDir: '/exports',
    })

    expect(renderPublishTemplate('【{{severityLabel}}】{{project}}：{{note}} ({{分類}})\n優先級： {{優先級}}\n狀態： {{狀態}}', manifest, manifest.markers[0]))
      .toContain('優先級： 一般')
  })

  it('formats Slack session messages and thread payloads', () => {
    const manifest = buildExportManifest({
      session: session(),
      bugs: [bug()],
      files: [file()],
      outDir: '/exports',
      reportPdfPath: '/exports/QA_bug_report_1.0_2023-11-14.pdf',
      publish: { target: 'slack', slackThreadMode: 'single-thread' },
    })

    expect(slackSessionMessage(manifest)).toContain('1. [Critical] login crash')
    expect(slackSessionMessage(manifest)).toContain('Detailed PDF report')
    expect(slackThreadPayload(manifest).reportPdfPath).toBe('/exports/QA_bug_report_1.0_2023-11-14.pdf')
    expect(slackThreadPayload(manifest).markers[0]).toMatchObject({
      markerId: 'b1',
      text: '[Critical] login crash',
      files: ['/exports/b1.mp4'],
    })
  })
})
