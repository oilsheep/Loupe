import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExportManifest } from '../export-manifest'
import { fetchGitLabMentionUsers, fetchGitLabMentionUsersWithEmailLookup, fetchGitLabProjects, publishManifestToGitLab, refreshGitLabAccessToken, validateGitLabConnection } from '../gitlab-publisher'
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
    originalOffsetMs: 1_000,
    severity: 'major',
    note: 'login crash',
    screenshotRel: null,
    originalScreenshotRel: null,
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
      const files: ExportedMarkerFile[] = [{ bugId: 'b1', videoPath: join(root, 'b1.mp4'), previewPath: join(root, 'b1.jpg'), screenshotPath: null, logcatPath: null }]
      writeFileSync(files[0].videoPath!, 'x')
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

  it('uploads the screenshot (previewPath) when videoPath is null in single-issue mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-gitlab-'))
    try {
      const files: ExportedMarkerFile[] = [{ bugId: 'b1', videoPath: null, previewPath: join(root, 'b1.jpg'), screenshotPath: null, logcatPath: null }]
      writeFileSync(files[0].previewPath, 'screenshot-data')
      const manifest = buildExportManifest({
        session: session(),
        bugs: [bug()],
        files,
        outDir: root,
        publish: { target: 'gitlab', gitlabMode: 'single-issue' },
      })
      let uploadedFormData: FormData | null = null
      const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
        if (input.endsWith('/uploads')) {
          // Capture the FormData body sent with the upload request
          const body = init?.body
          if (body && typeof body === 'object' && 'get' in body) uploadedFormData = body as FormData
          return response({ markdown: '[screenshot](/uploads/b1.jpg)' })
        }
        if (input.endsWith('/issues')) return response({ iid: 20, web_url: 'https://gitlab.example.com/group/project/-/issues/20' })
        if (input.endsWith('/issues/20/notes')) return response({ id: 3 })
        throw new Error(`unexpected URL ${input}`)
      })

      const result = await publishManifestToGitLab({
        manifest,
        manifestPaths: { jsonPath: join(root, 'export-manifest.json'), csvPath: join(root, 'export-manifest.csv') },
        settings: { baseUrl: 'https://gitlab.example.com', token: 'glpat-test', projectId: 'group/project', mode: 'single-issue', labels: [], confidential: false, mentionUsernames: [] },
        fetchImpl,
      })

      expect(result.uploadErrors).toEqual([])
      // The /uploads endpoint must have been called (screenshot was uploaded, not skipped)
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/uploads'))).toHaveLength(1)
      // The upload body must be a FormData with a 'file' field (i.e. the previewPath screenshot was sent)
      // Note: happy-dom returns 'blob' for File.name on Blob-constructed entries; we assert the field
      // exists and its content matches the written screenshot bytes ('screenshot-data').
      expect(uploadedFormData).not.toBeNull()
      const uploadedFile = uploadedFormData!.get('file') as File | null
      expect(uploadedFile).not.toBeNull()
      const uploadedText = await uploadedFile!.text()
      expect(uploadedText).toBe('screenshot-data')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('uploads the screenshot (previewPath) when videoPath is null in per-marker mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-gitlab-'))
    try {
      const files: ExportedMarkerFile[] = [{ bugId: 'b1', videoPath: null, previewPath: join(root, 'b1.jpg'), screenshotPath: null, logcatPath: null }]
      writeFileSync(files[0].previewPath, 'screenshot-data')
      const manifest = buildExportManifest({
        session: session(),
        bugs: [bug()],
        files,
        outDir: root,
        publish: { target: 'gitlab', gitlabMode: 'per-marker-issue' },
      })
      const fetchImpl = vi.fn(async (input: string) => {
        if (input.endsWith('/uploads')) return response({ markdown: '[screenshot](/uploads/b1.jpg)' })
        if (input.endsWith('/issues')) return response({ iid: 21, web_url: 'https://gitlab.example.com/group/project/-/issues/21' })
        throw new Error(`unexpected URL ${input}`)
      })

      const result = await publishManifestToGitLab({
        manifest,
        manifestPaths: { jsonPath: join(root, 'export-manifest.json'), csvPath: join(root, 'export-manifest.csv') },
        settings: { baseUrl: 'https://gitlab.example.com', token: 'glpat-test', projectId: 'group/project', mode: 'per-marker-issue', labels: [], confidential: false, mentionUsernames: [] },
        fetchImpl,
      })

      expect(result.uploadErrors).toEqual([])
      // The /uploads endpoint must have been called (screenshot was uploaded, not skipped)
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/uploads'))).toHaveLength(1)
      // One marker issue + one summary issue (per-marker mode adds a linking summary)
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/issues'))).toHaveLength(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('creates one issue per marker in per-marker mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-gitlab-'))
    try {
      const files: ExportedMarkerFile[] = [{ bugId: 'b1', videoPath: join(root, 'b1.mp4'), previewPath: join(root, 'b1.jpg'), screenshotPath: null, logcatPath: null }]
      writeFileSync(files[0].videoPath!, 'x')
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
        settings: { baseUrl: 'https://gitlab.example.com', token: 'glpat-test', projectId: 'group/project', mode: 'per-marker-issue', labels: [], confidential: true, mentionUsernames: [] },
        fetchImpl,
      })

      expect(result.mode).toBe('per-marker-issue')
      // 1 marker issue + 1 summary issue (mock returns iid 12 for both)
      expect(result.issueUrls).toEqual(['https://gitlab.example.com/group/project/-/issues/12', 'https://gitlab.example.com/group/project/-/issues/12'])
      // Video uploaded for the marker (b1.jpg fixture not written, so the screenshot upload is skipped)
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/uploads'))).toHaveLength(1)
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/issues'))).toHaveLength(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('refreshGitLabAccessToken', () => {
  const baseSettings = {
    baseUrl: 'https://gitlab.example.com',
    token: 'old-access',
    refreshToken: 'r-1',
    tokenExpiresAt: 0, // expired
    authType: 'oauth' as const,
    oauthClientId: 'cid',
    projectId: 'group/project',
    mode: 'single-issue' as const,
  }

  it('PAT auth short-circuits with no network call', async () => {
    const fetchMock = vi.fn()
    const out = await refreshGitLabAccessToken(
      { ...baseSettings, authType: 'pat', refreshToken: undefined },
      fetchMock as any,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.token).toBe('old-access')
  })

  it('no refresh_token but an access_token returns settings unchanged', async () => {
    const fetchMock = vi.fn()
    const out = await refreshGitLabAccessToken(
      { ...baseSettings, refreshToken: undefined },
      fetchMock as any,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.token).toBe('old-access')
  })

  it('no refresh_token AND no access_token returns settings unchanged (caller handles the empty-token error)', async () => {
    const fetchMock = vi.fn()
    const out = await refreshGitLabAccessToken(
      { ...baseSettings, refreshToken: undefined, token: '' },
      fetchMock as any,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.token).toBe('')
  })

  it('non-expired token short-circuits without network', async () => {
    const fetchMock = vi.fn()
    const out = await refreshGitLabAccessToken(
      { ...baseSettings, tokenExpiresAt: Date.now() + 3600_000 },
      fetchMock as any,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.token).toBe('old-access')
  })

  it('forceRefresh hits /oauth/token even when not expired', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ access_token: 'NEW', refresh_token: 'NEW-R', expires_in: 7200 }),
      { status: 200 },
    ))
    const out = await refreshGitLabAccessToken(
      { ...baseSettings, tokenExpiresAt: Date.now() + 3600_000 },
      fetchMock as any,
      { forceRefresh: true },
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gitlab.example.com/oauth/token')
    expect(init?.method).toBe('POST')
    expect(init?.body).toContain('grant_type=refresh_token')
    expect(init?.body).toContain('refresh_token=r-1')
    expect(init?.body).toContain('client_id=cid')
    expect(out.token).toBe('NEW')
    expect(out.refreshToken).toBe('NEW-R')
    expect(out.tokenExpiresAt).toBeGreaterThan(Date.now() + 7000_000)
  })

  it('expired token triggers refresh and stores rotated refresh_token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ access_token: 'NEW', refresh_token: 'NEW-R', expires_in: 7200 }),
      { status: 200 },
    ))
    const out = await refreshGitLabAccessToken(baseSettings, fetchMock as any)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(out.token).toBe('NEW')
    expect(out.refreshToken).toBe('NEW-R')
  })

  it('refresh response without rotated refresh_token keeps the old one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ access_token: 'NEW', expires_in: 7200 }),
      { status: 200 },
    ))
    const out = await refreshGitLabAccessToken(baseSettings, fetchMock as any)
    expect(out.refreshToken).toBe('r-1')
  })

  it('includes client_secret in body when present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ access_token: 'NEW', expires_in: 7200 }),
      { status: 200 },
    ))
    await refreshGitLabAccessToken(
      { ...baseSettings, oauthClientSecret: 'csec' },
      fetchMock as any,
    )
    expect(fetchMock.mock.calls[0][1]?.body).toContain('client_secret=csec')
  })

  it('throws with GitLab error_description when /oauth/token fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'invalid_grant', error_description: 'refresh token revoked' }),
      { status: 400 },
    ))
    await expect(refreshGitLabAccessToken(baseSettings, fetchMock as any))
      .rejects.toThrow(/refresh token revoked/)
  })
})

describe('validateGitLabConnection', () => {
  const baseSettings = {
    baseUrl: 'https://gitlab.example.com',
    token: 'glpat-active',
    refreshToken: undefined,
    tokenExpiresAt: null,
    authType: 'oauth' as const,
    oauthClientId: 'cid',
    projectId: 'group/project',
    mode: 'single-issue' as const,
  }

  it('returns settings when /user returns 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: 1, username: 'farl' }),
      { status: 200 },
    ))
    const out = await validateGitLabConnection(baseSettings, fetchMock as any)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gitlab.example.com/api/v4/user')
    expect(init?.method).toBe('GET')
    expect(init?.headers?.Authorization).toBe('Bearer glpat-active')
    expect(out.token).toBe('glpat-active')
  })

  it('throws with a 401-matching message when /user is unauthorized', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401, statusText: 'Unauthorized' }))
    await expect(validateGitLabConnection(baseSettings, fetchMock as any))
      .rejects.toThrow(/401/)
  })

  it('uses PRIVATE-TOKEN header for PAT auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }))
    await validateGitLabConnection({ ...baseSettings, authType: 'pat' }, fetchMock as any)
    expect(fetchMock.mock.calls[0][1]?.headers?.['PRIVATE-TOKEN']).toBe('glpat-active')
  })
})
