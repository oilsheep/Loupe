import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExportManifest } from '../export-manifest'
import { publishManifestToSlack } from '../slack-publisher'
import type { Bug, ExportedMarkerFile, Session } from '@shared/types'

function response(payload: unknown, ok = true): Response {
  return new Response(JSON.stringify(payload), { status: ok ? 200 : 400, headers: { 'Content-Type': 'application/json' } })
}

function formBody(init?: RequestInit): URLSearchParams {
  return new URLSearchParams(String(init?.body ?? ''))
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
  }
}

describe('Slack publisher', () => {
  it('posts one root message and uploads all marker files in single-thread mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-slack-'))
    try {
      const jsonPath = join(root, 'export-manifest.json')
      const csvPath = join(root, 'export-manifest.csv')
      writeFileSync(jsonPath, '{}')
      writeFileSync(csvPath, 'a,b\n')
      const files: ExportedMarkerFile[] = [{
        bugId: 'b1',
        videoPath: join(root, 'b1.mp4'),
        previewPath: join(root, 'b1.jpg'),
        logcatPath: join(root, 'b1.logcat.txt'),
      }]
      for (const file of [files[0].videoPath, files[0].previewPath, files[0].logcatPath!]) writeFileSync(file, 'x')
      const manifest = buildExportManifest({
        session: session(),
        bugs: [bug()],
        files,
        outDir: root,
        publish: { target: 'slack', slackThreadMode: 'single-thread' },
      })
      const fetchImpl = vi.fn(async (input: string) => {
        if (input.endsWith('/chat.postMessage')) return response({ ok: true, ts: '123.456' })
        if (input.endsWith('/files.getUploadURLExternal')) return response({ ok: true, upload_url: 'https://upload.test/file', file_id: `F${fetchImpl.mock.calls.length}` })
        if (input === 'https://upload.test/file') return new Response('', { status: 200 })
        if (input.endsWith('/files.completeUploadExternal')) return response({ ok: true })
        throw new Error(`unexpected URL ${input}`)
      })

      const result = await publishManifestToSlack({
        manifest,
        manifestPaths: { jsonPath, csvPath },
        settings: { botToken: 'xoxb-test', channelId: 'C123' },
        fetchImpl,
      })

      expect(result).toEqual({ channelId: 'C123', rootTs: '123.456', markerThreadTs: {}, mode: 'single-thread', uploadErrors: [] })
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/chat.postMessage'))).toHaveLength(1)
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/files.completeUploadExternal'))).toHaveLength(3)
      const uploadCall = fetchImpl.mock.calls.find(([url]) => String(url).endsWith('/files.getUploadURLExternal')) as [string, RequestInit | undefined] | undefined
      expect(formBody(uploadCall?.[1]).get('filename')).toBe('b1.mp4')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('posts one root message per marker in per-marker-thread mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-slack-'))
    try {
      const files: ExportedMarkerFile[] = [{
        bugId: 'b1',
        videoPath: join(root, 'b1.mp4'),
        previewPath: join(root, 'b1.jpg'),
        logcatPath: join(root, 'b1.logcat.txt'),
      }]
      for (const file of [files[0].videoPath, files[0].previewPath, files[0].logcatPath!]) writeFileSync(file, 'x')
      const manifest = buildExportManifest({
        session: session(),
        bugs: [bug()],
        files,
        outDir: root,
        publish: { target: 'slack', slackThreadMode: 'per-marker-thread' },
      })
      const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
        if (input.endsWith('/chat.postMessage')) return response({ ok: true, ts: '123.456' })
        if (input.endsWith('/files.getUploadURLExternal')) return response({ ok: true, upload_url: 'https://upload.test/file', file_id: `F${fetchImpl.mock.calls.length}` })
        if (input === 'https://upload.test/file') return new Response('', { status: 200 })
        if (input.endsWith('/files.completeUploadExternal')) {
          expect(formBody(init).get('thread_ts')).toBe('123.456')
          return response({ ok: true })
        }
        throw new Error(`unexpected URL ${input}`)
      })

      const result = await publishManifestToSlack({
        manifest,
        manifestPaths: { jsonPath: join(root, 'export-manifest.json'), csvPath: join(root, 'export-manifest.csv') },
        settings: { botToken: 'xoxb-test', channelId: 'C123' },
        fetchImpl,
      })

      expect(result.rootTs).toBeNull()
      expect(result.markerThreadTs.b1).toBe('123.456')
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/chat.postMessage'))).toHaveLength(1)
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/files.completeUploadExternal'))).toHaveLength(3)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('continues when one file upload fails and reports the error in the thread', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-slack-'))
    try {
      const files: ExportedMarkerFile[] = [{
        bugId: 'b1',
        videoPath: join(root, 'this is a very long clip filename with symbols 測試 and spaces that slack should not receive directly.mp4'),
        previewPath: join(root, 'b1.jpg'),
        logcatPath: null,
      }]
      for (const file of [files[0].videoPath, files[0].previewPath]) writeFileSync(file, 'x')
      const manifest = buildExportManifest({
        session: session(),
        bugs: [bug()],
        files,
        outDir: root,
        publish: { target: 'slack', slackThreadMode: 'single-thread' },
      })
      let uploadUrlRequests = 0
      const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
        if (input.endsWith('/chat.postMessage')) return response({ ok: true, ts: '123.456' })
        if (input.endsWith('/files.getUploadURLExternal')) {
          uploadUrlRequests += 1
          const filename = formBody(init).get('filename') ?? ''
          expect(filename.length).toBeLessThanOrEqual(88)
          if (uploadUrlRequests === 1) return response({ ok: false, error: 'invalid_arguments' })
          return response({ ok: true, upload_url: 'https://upload.test/file', file_id: `F${uploadUrlRequests}` })
        }
        if (input === 'https://upload.test/file') return new Response('', { status: 200 })
        if (input.endsWith('/files.completeUploadExternal')) return response({ ok: true })
        throw new Error(`unexpected URL ${input}`)
      })

      const result = await publishManifestToSlack({
        manifest,
        manifestPaths: { jsonPath: join(root, 'export-manifest.json'), csvPath: join(root, 'export-manifest.csv') },
        settings: { botToken: 'xoxb-test', channelId: 'C123' },
        fetchImpl,
      })

      expect(result.uploadErrors[0]).toContain('invalid_arguments')
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/files.completeUploadExternal'))).toHaveLength(1)
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/chat.postMessage'))).toHaveLength(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
