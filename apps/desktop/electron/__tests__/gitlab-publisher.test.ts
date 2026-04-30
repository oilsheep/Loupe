import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExportManifest } from '../export-manifest'
import { publishManifestToGitLab } from '../gitlab-publisher'
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
    ramTotalGb: 8,
    graphicsDevice: 'Qualcomm Adreno 740',
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
    mentionUserIds: [],
  }
}

describe('GitLab publisher', () => {
  it('creates one issue and marker notes in single-issue mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-gitlab-'))
    try {
      const files: ExportedMarkerFile[] = [{ bugId: 'b1', videoPath: join(root, 'b1.mp4'), previewPath: join(root, 'b1.jpg'), logcatPath: null }]
      writeFileSync(files[0].videoPath, 'x')
      const reportPdfPath = join(root, 'report.pdf')
      const summaryTextPath = join(root, 'summary.txt')
      writeFileSync(reportPdfPath, 'pdf')
      writeFileSync(summaryTextPath, 'summary from file')
      const manifest = buildExportManifest({
        session: session(),
        bugs: [bug()],
        files,
        outDir: root,
        reportPdfPath,
        publish: { target: 'gitlab', gitlabMode: 'single-issue' },
      })
      const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
        if (input.endsWith('/uploads')) return response({ markdown: '[file](/uploads/file)' })
        if (input.endsWith('/issues')) {
          expect(init?.headers).toMatchObject({ 'PRIVATE-TOKEN': 'glpat-test' })
          const body = JSON.parse(String(init?.body))
          expect(body.description).toContain('summary from file')
          return response({ iid: 11, web_url: 'https://gitlab.example.com/group/project/-/issues/11' })
        }
        if (input.endsWith('/issues/11/notes')) {
          const body = JSON.parse(String(init?.body))
          expect(body.body).toContain('login crash')
          expect(body.body).toContain('RAM: 8.0G')
          return response({ id: 2 })
        }
        throw new Error(`unexpected URL ${input}`)
      })

      const result = await publishManifestToGitLab({
        manifest,
        manifestPaths: { jsonPath: join(root, 'export-manifest.json'), csvPath: join(root, 'export-manifest.csv'), reportPdfPath, summaryTextPath },
        settings: { baseUrl: 'https://gitlab.example.com', token: 'glpat-test', projectId: 'group/project', mode: 'single-issue', labels: ['loupe'], confidential: false, mentionUsernames: ['qa'] },
        fetchImpl,
      })

      expect(result).toMatchObject({ mode: 'single-issue', projectId: 'group/project', uploadErrors: [] })
      expect(result.issueUrls).toEqual(['https://gitlab.example.com/group/project/-/issues/11'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('creates one issue per marker in per-marker mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-gitlab-'))
    try {
      const files: ExportedMarkerFile[] = [{ bugId: 'b1', videoPath: join(root, 'b1.mp4'), previewPath: join(root, 'b1.jpg'), logcatPath: null }]
      writeFileSync(files[0].videoPath, 'x')
      const manifest = buildExportManifest({
        session: session(),
        bugs: [bug()],
        files,
        outDir: root,
        publish: { target: 'gitlab', gitlabMode: 'per-marker-issue' },
      })
      const fetchImpl = vi.fn(async (input: string) => {
        if (input.endsWith('/uploads')) return response({ markdown: '[b1.mp4](/uploads/b1.mp4)' })
        if (input.endsWith('/issues')) return response({ iid: 12, web_url: 'https://gitlab.example.com/group/project/-/issues/12' })
        throw new Error(`unexpected URL ${input}`)
      })

      const result = await publishManifestToGitLab({
        manifest,
        manifestPaths: { jsonPath: join(root, 'export-manifest.json'), csvPath: join(root, 'export-manifest.csv') },
        settings: { baseUrl: 'https://gitlab.example.com', token: 'glpat-test', projectId: 'group/project', mode: 'single-issue', labels: [], confidential: true, mentionUsernames: [] },
        fetchImpl,
      })

      expect(result.mode).toBe('per-marker-issue')
      expect(result.issueUrls).toEqual(['https://gitlab.example.com/group/project/-/issues/12'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
