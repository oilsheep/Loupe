import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExportManifest } from '../export-manifest'
import { publishManifestToRemote } from '../remote-publisher'
import type { AppSettings, Bug, ExportedMarkerFile, Session } from '@shared/types'

function response(payload: unknown, ok = true): Response {
  return new Response(JSON.stringify(payload), { status: ok ? 200 : 400, headers: { 'Content-Type': 'application/json' } })
}

function settings(): AppSettings {
  return {
    exportRoot: '/exports',
    hotkeys: { improvement: 'F6', minor: 'F7', normal: 'F8', major: 'F9' },
    locale: 'en',
    severities: {
      note: { label: 'note', color: '#a1a1aa' },
      major: { label: 'Critical', color: '#ff4d4f' },
      normal: { label: 'Bug', color: '#f59e0b' },
      minor: { label: 'Polish', color: '#22b8f0' },
      improvement: { label: 'Note', color: '#22c55e' },
      custom1: { label: 'custom 1', color: '#8b5cf6' },
      custom2: { label: 'custom 2', color: '#ec4899' },
      custom3: { label: 'custom 3', color: '#14b8a6' },
      custom4: { label: 'custom 4', color: '#eab308' },
    },
    slack: { botToken: 'xoxb-test', channelId: 'C123', mentionUserIds: [], mentionAliases: {} },
    gitlab: { baseUrl: 'https://gitlab.example.com', token: 'glpat-test', projectId: 'group/project', mode: 'single-issue', labels: ['loupe'], confidential: false, mentionUsernames: [] },
  }
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
  }
}

describe('remote publisher', () => {
  it('skips local exports', async () => {
    const manifest = buildExportManifest({
      session: session(),
      bugs: [bug()],
      files: [{ bugId: 'b1', videoPath: '/exports/b1.mp4', previewPath: '/exports/b1.jpg', logcatPath: null }],
      outDir: '/exports',
      publish: { target: 'local' },
    })

    await expect(publishManifestToRemote({
      manifest,
      manifestPaths: { jsonPath: '/exports/export-manifest.json', csvPath: '/exports/export-manifest.csv' },
      settings: settings(),
    })).resolves.toEqual({ target: 'local', skipped: true })
  })

  it('routes Slack exports through the Slack publisher', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-remote-'))
    const originalFetch = globalThis.fetch
    try {
      const files: ExportedMarkerFile[] = [{
        bugId: 'b1',
        videoPath: join(root, 'b1.mp4'),
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
      const fetchImpl = vi.fn(async (input: string) => {
        if (input.endsWith('/chat.postMessage')) return response({ ok: true, ts: '123.456' })
        if (input.endsWith('/files.getUploadURLExternal')) return response({ ok: true, upload_url: 'https://upload.test/file', file_id: 'F1' })
        if (input === 'https://upload.test/file') return new Response('', { status: 200 })
        if (input.endsWith('/files.completeUploadExternal')) return response({ ok: true })
        throw new Error(`unexpected URL ${input}`)
      })
      vi.stubGlobal('fetch', fetchImpl)

      const result = await publishManifestToRemote({
        manifest,
        manifestPaths: { jsonPath: join(root, 'export-manifest.json'), csvPath: join(root, 'export-manifest.csv') },
        settings: settings(),
      })

      expect(result.target).toBe('slack')
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/chat.postMessage'))).toHaveLength(1)
    } finally {
      vi.stubGlobal('fetch', originalFetch)
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('routes GitLab exports through the GitLab publisher', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-remote-'))
    const originalFetch = globalThis.fetch
    try {
      const files: ExportedMarkerFile[] = [{
        bugId: 'b1',
        videoPath: join(root, 'b1.mp4'),
        previewPath: join(root, 'b1.jpg'),
        logcatPath: null,
      }]
      writeFileSync(files[0].videoPath, 'x')
      const manifest = buildExportManifest({
        session: session(),
        bugs: [bug()],
        files,
        outDir: root,
        publish: { target: 'gitlab', gitlabMode: 'single-issue' },
      })
      const fetchImpl = vi.fn(async (input: string) => {
        if (input.endsWith('/uploads')) return response({ markdown: '[b1.mp4](/uploads/b1.mp4)' })
        if (input.endsWith('/issues')) return response({ iid: 7, web_url: 'https://gitlab.example.com/group/project/-/issues/7' })
        if (input.endsWith('/issues/7/notes')) return response({ id: 1 })
        throw new Error(`unexpected URL ${input}`)
      })
      vi.stubGlobal('fetch', fetchImpl)

      const result = await publishManifestToRemote({
        manifest,
        manifestPaths: { jsonPath: join(root, 'export-manifest.json'), csvPath: join(root, 'export-manifest.csv') },
        settings: settings(),
      })

      expect(result.target).toBe('gitlab')
      expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/issues/7/notes'))).toBe(true)
    } finally {
      vi.stubGlobal('fetch', originalFetch)
      rmSync(root, { recursive: true, force: true })
    }
  })
})
