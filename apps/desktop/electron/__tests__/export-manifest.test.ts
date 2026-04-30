import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExportManifest, manifestToCsv, slackSessionMessage, slackThreadPayload, writeExportManifests } from '../export-manifest'
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
    ...over,
  }
}

function bug(over: Partial<Bug> = {}): Bug {
  return {
    id: 'b1',
    sessionId: 's1',
    offsetMs: 1_000,
    severity: 'major',
    note: 'login crash',
    screenshotRel: null,
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
    logcatPath: '/exports/b1.logcat.txt',
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
      publish: { target: 'slack', slackThreadMode: 'single-thread' },
      now: 1_700_000_002_000,
    })

    expect(manifest.publish).toEqual({ target: 'slack', slackThreadMode: 'single-thread' })
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
      logcatPath: '/exports/b1.logcat.txt',
    })
  })

  it('writes JSON, CSV, and Slack thread payload manifests', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-export-'))
    try {
      const paths = writeExportManifests({
        session: session(),
        bugs: [bug({ note: 'quote "inside"' })],
        files: [file()],
        outDir: root,
        publish: { target: 'slack', slackThreadMode: 'single-thread' },
        now: 1_700_000_002_000,
      })

      expect(paths.jsonPath).toBe(join(root, 'export-manifest.json'))
      expect(paths.csvPath).toBe(join(root, 'export-manifest.csv'))
      expect(paths.slackPlanPath).toBe(join(root, 'slack-publish-plan.json'))
      expect(JSON.parse(readFileSync(paths.jsonPath, 'utf8')).markers[0].note).toBe('quote "inside"')
      expect(readFileSync(paths.csvPath, 'utf8')).toContain('"quote ""inside"""')
      expect(JSON.parse(readFileSync(paths.slackPlanPath!, 'utf8')).markers[0].files).toContain('/exports/b1.mp4')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('renders CSV rows for spreadsheet import', () => {
    const csv = manifestToCsv(buildExportManifest({
      session: session(),
      bugs: [bug()],
      files: [file()],
      outDir: '/exports',
    }))

    expect(csv).toContain('"Build","Tester"')
    expect(csv).toContain('"1.0","Avery"')
    expect(csv).toContain('"/exports/b1.logcat.txt"')
  })

  it('formats Slack session messages and thread payloads', () => {
    const manifest = buildExportManifest({
      session: session(),
      bugs: [bug()],
      files: [file()],
      outDir: '/exports',
      publish: { target: 'slack', slackThreadMode: 'single-thread' },
    })

    expect(slackSessionMessage(manifest)).toContain('1. [Critical] login crash')
    expect(slackThreadPayload(manifest).markers[0]).toMatchObject({
      markerId: 'b1',
      files: ['/exports/b1.mp4', '/exports/b1.jpg', '/exports/b1.logcat.txt'],
    })
  })
})
