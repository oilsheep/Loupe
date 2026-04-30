import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExportManifest } from '../export-manifest'
import { publishManifestToGoogleDrive } from '../google-publisher'
import type { Bug, ExportedMarkerFile, Session } from '@shared/types'

function response(payload: unknown, ok = true): Response {
  return new Response(JSON.stringify(payload), { status: ok ? 200 : 400, headers: { 'Content-Type': 'application/json' } })
}

function session(): Session {
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
    micAudioDurationMs: null,
  }
}

function bug(): Bug {
  return {
    id: 'b1',
    sessionId: 's1',
    offsetMs: 1_000,
    severity: 'major',
    note: 'login crash',
    screenshotRel: null,
    logcatRel: null,
    audioRel: null,
    audioDurationMs: null,
    createdAt: 1_700_000_001_000,
    preSec: 5,
    postSec: 8,
    mentionUserIds: ['miki'],
  }
}

describe('Google Drive publisher', () => {
  it('inserts a header row and writes marker rows at an explicit A:P range', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-google-'))
    try {
      const files: ExportedMarkerFile[] = [{
        bugId: 'b1',
        videoPath: join(root, 'records', 'b1.mp4'),
        previewPath: join(root, 'records', 'b1.jpg'),
        logcatPath: null,
      }]
      mkdirSync(join(root, 'records'), { recursive: true })
      writeFileSync(files[0].videoPath, 'video')
      writeFileSync(files[0].previewPath, 'preview')
      const manifest = buildExportManifest({
        session: session(),
        bugs: [bug()],
        files,
        outDir: root,
        publish: { target: 'google-drive' },
      })
      const jsonPath = join(root, 'export-manifest.json')
      const csvPath = join(root, 'export-manifest.csv')
      writeFileSync(jsonPath, JSON.stringify(manifest))
      writeFileSync(csvPath, 'csv')

      let uploadIndex = 0
      const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
        if (input.includes('/upload/drive/v3/files') && init?.method === 'POST') {
          uploadIndex += 1
          return new Response('', { status: 200, headers: { location: `https://upload.test/${uploadIndex}` } })
        }
        if (input.startsWith('https://upload.test/')) return response({ id: `file-${uploadIndex}`, webViewLink: `https://drive/file-${uploadIndex}` })
        if (input.includes('/drive/v3/files') && init?.method === 'POST') return response({ id: `folder-${uploadIndex}`, name: 'folder', webViewLink: 'https://drive/folder' })
        if (input.includes('/values/Sheet1!A1%3AP1') && (!init?.method || init.method === 'GET')) return response({ values: [['2026-04-30T13:06:18.538Z', 'test']] })
        if (input.endsWith(':batchUpdate')) return response({})
        if (input.includes('/spreadsheets/sheet-id?fields=sheets.properties')) return response({ sheets: [{ properties: { sheetId: 123, title: 'Sheet1' } }] })
        if (input.includes('/values/Sheet1!A1%3AP1') && init?.method === 'PUT') return response({})
        if (input.includes('/values/Sheet1!A%3AP') && (!init?.method || init.method === 'GET')) return response({ values: [['Export Created At'], ['2026-04-30T13:06:18.538Z']] })
        if (input.includes('/values/Sheet1!A3%3AP3') && init?.method === 'PUT') return response({})
        throw new Error(`unexpected URL ${input}`)
      })

      const result = await publishManifestToGoogleDrive({
        manifest,
        manifestPaths: { jsonPath, csvPath },
        settings: {
          token: 'ya29-test',
          oauthClientId: 'client',
          driveFolderId: 'root-folder',
          updateSheet: true,
          spreadsheetId: 'sheet-id',
          sheetName: 'Sheet1',
        },
        mentionIdentities: [{ id: 'miki', displayName: 'Miki', email: 'miki@example.com' }],
        fetchImpl,
      })

      expect(result.sheetUpdated).toBe(true)
      expect(fetchImpl.mock.calls.some(([url]) => String(url).endsWith(':batchUpdate'))).toBe(true)
      const batchBodies = fetchImpl.mock.calls
        .filter(([url, init]) => String(url).endsWith(':batchUpdate') && init?.method === 'POST')
        .map(([, init]) => JSON.parse(String(init?.body)))
      expect(batchBodies.some(body => body.requests?.[0]?.updateCells?.start?.rowIndex === 2 && body.requests?.[0]?.updateCells?.start?.columnIndex === 0)).toBe(true)
      const markerUpdate = batchBodies.find(body => body.requests?.[0]?.updateCells?.start?.rowIndex === 2)
      const mentionCell = markerUpdate?.requests?.[0]?.updateCells?.rows?.[0]?.values?.[9]
      expect(mentionCell).toEqual({
        userEnteredValue: { stringValue: '@' },
        chipRuns: [{
          startIndex: 0,
          chip: {
            personProperties: {
              email: 'miki@example.com',
              displayFormat: 'DEFAULT',
            },
          },
        }],
      })
      expect(markerUpdate?.requests?.[0]?.updateCells?.fields).toBe('userEnteredValue,chipRuns')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
