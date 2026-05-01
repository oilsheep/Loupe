import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExportManifest } from '../export-manifest'
import { fetchGitLabMentionUsers, fetchGitLabMentionUsersWithEmailLookup, fetchGitLabProjects, publishManifestToGitLab } from '../gitlab-publisher'
import type { Bug, ExportedMarkerFile, Session } from '@shared/types'

function response(payload: unknown, ok = true, status = ok ? 200 : 400): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
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
    micAudioStartOffsetMs: null,
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
    logcatRel: null,
    audioRel: null,
    audioDurationMs: null,
    createdAt: 1_700_000_001_000,
    preSec: 5,
    postSec: 8,
    mentionUserIds: [],
    ...over,
  }
}

describe('GitLab publisher', () => {
  it('fetches selectable GitLab projects with pagination', async () => {
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('glpat-test')
      if (String(input).endsWith('page=1')) {
        return new Response(JSON.stringify([{ id: 2, name: 'App', name_with_namespace: 'QA / App', path_with_namespace: 'qa/app', web_url: 'https://gitlab.example.com/qa/app' }]), {
          status: 200,
          headers: { 'x-next-page': '2', 'Content-Type': 'application/json' },
        })
      }
      if (String(input).endsWith('page=2')) return response([{ id: 1, name: 'Archived', path_with_namespace: 'qa/old', archived: true }])
      throw new Error(`unexpected URL ${input}`)
    })

    const projects = await fetchGitLabProjects({
      baseUrl: 'https://gitlab.example.com',
      token: 'glpat-test',
      projectId: '',
      mode: 'single-issue',
    }, fetchImpl)

    expect(fetchImpl.mock.calls[0]?.[0]).toContain('/projects?membership=true')
    expect(projects).toEqual([
      { id: 2, name: 'App', nameWithNamespace: 'QA / App', pathWithNamespace: 'qa/app', webUrl: 'https://gitlab.example.com/qa/app' },
    ])
  })

  it('fetches project members for mention identities with pagination', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (String(input).endsWith('/members/all?per_page=100&page=1')) {
        return new Response(JSON.stringify([{ id: 1, username: 'miki', name: 'Miki', email: 'MIKI@example.com', state: 'active', avatar_url: 'https://avatar.test/miki.png', web_url: 'https://gitlab.example.com/miki' }]), {
          status: 200,
          headers: { 'x-next-page': '2', 'Content-Type': 'application/json' },
        })
      }
      if (String(input).endsWith('/members/all?per_page=100&page=2')) return response([{ id: 2, username: 'qa', name: 'QA Lead', state: 'active' }])
      throw new Error(`unexpected URL ${input}`)
    })

    const users = await fetchGitLabMentionUsers({
      baseUrl: 'https://gitlab.example.com',
      token: 'glpat-test',
      projectId: 'group/project',
      mode: 'single-issue',
    }, fetchImpl)

    expect(fetchImpl.mock.calls[0]?.[0]).toContain('/projects/group%2Fproject/members/all')
    expect(users).toEqual([
      { id: 1, username: 'miki', name: 'Miki', email: 'miki@example.com', state: 'active', avatarUrl: 'https://avatar.test/miki.png', webUrl: 'https://gitlab.example.com/miki' },
      { id: 2, username: 'qa', name: 'QA Lead', email: undefined, state: 'active', avatarUrl: undefined, webUrl: undefined },
    ])
  })

  it('keeps only active project members for mention identities', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (String(input).endsWith('/members/all?per_page=100&page=1')) return response([
        { id: 1, username: 'miki', name: 'Miki', state: 'active' },
        { id: 2, username: 'blocked', name: 'Blocked User', state: 'blocked' },
        { id: 3, username: 'deactivated', name: 'Deactivated User', state: 'deactivated' },
      ])
      throw new Error(`unexpected URL ${input}`)
    })

    const users = await fetchGitLabMentionUsers({
      baseUrl: 'https://gitlab.example.com',
      token: 'glpat-test',
      projectId: 'group/project',
      mode: 'single-issue',
    }, fetchImpl)

    expect(users.map(user => user.username)).toEqual(['miki'])
  })

  it('uses bearer auth for OAuth GitLab tokens', async () => {
    const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer oauth-token')
      expect((init?.headers as Record<string, string>)['PRIVATE-TOKEN']).toBeUndefined()
      return response([{ id: 1, username: 'miki', name: 'Miki', state: 'active' }])
    })

    const users = await fetchGitLabMentionUsers({
      baseUrl: 'https://gitlab.example.com',
      token: 'oauth-token',
      authType: 'oauth',
      projectId: 'group/project',
      mode: 'single-issue',
    }, fetchImpl)

    expect(users.map(user => user.username)).toEqual(['miki'])
  })

  it('optionally enriches GitLab member emails through admin users API without blocking on 403', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (String(input).endsWith('/members/all?per_page=100&page=1')) return response([
        { id: 1, username: 'miki', name: 'Miki', state: 'active' },
        { id: 2, username: 'qa', name: 'QA Lead', state: 'active' },
      ])
      if (String(input).endsWith('/users/1')) return response({ email: 'miki@example.com' })
      if (String(input).endsWith('/users/2')) return response({ message: '403 Forbidden' }, false, 403)
      throw new Error(`unexpected URL ${input}`)
    })

    const result = await fetchGitLabMentionUsersWithEmailLookup({
      baseUrl: 'https://gitlab.example.com',
      token: 'glpat-test',
      projectId: 'group/project',
      mode: 'single-issue',
      emailLookup: 'admin-users-api',
    }, fetchImpl)

    expect(result.warning).toBe('需要 self-managed admin token 才能讀取 GitLab email。')
    expect(result.users).toEqual([
      { id: 1, username: 'miki', name: 'Miki', email: 'miki@example.com', state: 'active', avatarUrl: undefined, webUrl: undefined },
      { id: 2, username: 'qa', name: 'QA Lead', email: undefined, state: 'active', avatarUrl: undefined, webUrl: undefined },
    ])
  })

  it('warns when GitLab users API responds without email fields', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (String(input).endsWith('/members/all?per_page=100&page=1')) return response([
        { id: 1, username: 'miki', name: 'Miki', state: 'active' },
      ])
      if (String(input).endsWith('/users/1')) return response({ username: 'miki', name: 'Miki' })
      throw new Error(`unexpected URL ${input}`)
    })

    const result = await fetchGitLabMentionUsersWithEmailLookup({
      baseUrl: 'https://gitlab.example.com',
      token: 'glpat-test',
      projectId: 'group/project',
      mode: 'single-issue',
      emailLookup: 'admin-users-api',
    }, fetchImpl)

    expect(result.warning).toBe('GitLab users API 沒有回傳 email；請確認 token 是 self-managed admin token 且有 api scope。')
    expect(result.users[0]?.email).toBeUndefined()
  })

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
        bugs: [bug({ mentionUserIds: ['miki', 'U123'] })],
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
          expect(body.body).toContain('@qa @miki')
          expect(body.body).not.toContain('@U123')
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
        mentionIdentities: [{ id: 'miki', displayName: 'Miki', slackUserId: 'U999', gitlabUsername: 'miki' }],
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
