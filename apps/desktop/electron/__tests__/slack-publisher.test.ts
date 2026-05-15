import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExportManifest } from '../export-manifest'
import { publishManifestToSlack, refreshSlackAccessToken } from '../slack-publisher'
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
    micAudioDurationMs: null, micAudioStartOffsetMs: null,
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

describe('Slack publisher', () => {
  it('requires the selected Slack token type', async () => {
    const files: ExportedMarkerFile[] = [{ bugId: 'b1', videoPath: '/exports/b1.mp4', previewPath: '/exports/b1.jpg', logcatPath: null }]
    const manifest = buildExportManifest({
      session: session(),
      bugs: [bug()],
      files,
      outDir: '/exports',
      publish: { target: 'slack', slackThreadMode: 'single-thread' },
    })

    await expect(publishManifestToSlack({
      manifest,
      manifestPaths: { jsonPath: '/exports/export-manifest.json', csvPath: '/exports/export-manifest.csv' },
      settings: { publishIdentity: 'user', userToken: '', botToken: 'xoxb-test', channelId: 'C123', mentionUserIds: [], mentionAliases: {} },
      fetchImpl: vi.fn(),
    })).rejects.toThrow('Slack user OAuth token is missing')

    await expect(publishManifestToSlack({
      manifest,
      manifestPaths: { jsonPath: '/exports/export-manifest.json', csvPath: '/exports/export-manifest.csv' },
      settings: { publishIdentity: 'bot', userToken: 'xoxp-test', botToken: '', channelId: 'C123', mentionUserIds: [], mentionAliases: {} },
      fetchImpl: vi.fn(),
    })).rejects.toThrow('Slack bot token is missing')
  })

  it('posts summary text, attaches the PDF, and uploads only marker videos in single-thread mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-slack-'))
    try {
      const jsonPath = join(root, 'export-manifest.json')
      const csvPath = join(root, 'export-manifest.csv')
      const reportPdfPath = join(root, 'QA_bug_report_1.0_2023-11-14.pdf')
      const summaryTextPath = join(root, 'summery.txt')
      writeFileSync(jsonPath, '{}')
      writeFileSync(csvPath, 'a,b\n')
      writeFileSync(reportPdfPath, 'pdf')
      writeFileSync(summaryTextPath, 'summary text from file\n')
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
        reportPdfPath,
        publish: { target: 'slack', slackThreadMode: 'single-thread' },
      })
      const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
        if (input.endsWith('/chat.postMessage')) return response({ ok: true, ts: '123.456' })
        if (input.endsWith('/files.getUploadURLExternal')) return response({ ok: true, upload_url: 'https://upload.test/file', file_id: `F${fetchImpl.mock.calls.length}` })
        if (input === 'https://upload.test/file') return new Response('', { status: 200 })
        if (input.endsWith('/files.completeUploadExternal')) return response({ ok: true })
        throw new Error(`unexpected URL ${input}`)
      })

      const result = await publishManifestToSlack({
        manifest,
        manifestPaths: { jsonPath, csvPath, reportPdfPath, summaryTextPath },
        settings: { botToken: 'xoxb-test', channelId: 'C123', mentionUserIds: ['U123'], mentionAliases: {} },
        fetchImpl,
      })

      expect(result).toEqual({ channelId: 'C123', rootTs: '123.456', markerThreadTs: {}, mode: 'single-thread', uploadErrors: [] })
      const messageCalls = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/chat.postMessage'))
      expect(messageCalls).toHaveLength(1)
      expect(formBody(messageCalls[0][1]).get('text')).toBe('<@U123>\nsummary text from file')
      const completeCalls = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/files.completeUploadExternal'))
      expect(completeCalls).toHaveLength(2)
      expect(formBody(completeCalls[0][1]).get('initial_comment')).toBe('Detailed PDF report')
      expect(formBody(completeCalls[1][1]).get('initial_comment')).toBe('<@U123>\n[Critical] login crash')
      const uploadFilenames = fetchImpl.mock.calls
        .filter(([url]) => String(url).endsWith('/files.getUploadURLExternal'))
        .map(([, init]) => formBody(init).get('filename'))
      expect(uploadFilenames).toEqual(['QA_bug_report_1.0_2023-11-14.pdf', 'b1.mp4'])
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
      const reportPdfPath = join(root, 'QA_bug_report_1.0_2023-11-14.pdf')
      for (const file of [files[0].videoPath, files[0].previewPath, files[0].logcatPath!]) writeFileSync(file, 'x')
      writeFileSync(reportPdfPath, 'pdf')
      const manifest = buildExportManifest({
        session: session(),
        bugs: [bug({ mentionUserIds: ['miki'] })],
        files,
        outDir: root,
        reportPdfPath,
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
        manifestPaths: { jsonPath: join(root, 'export-manifest.json'), csvPath: join(root, 'export-manifest.csv'), reportPdfPath },
        settings: { botToken: 'xoxb-test', channelId: 'C123', mentionUserIds: ['U123'], mentionAliases: { U123: 'Miki' } },
        mentionIdentities: [{ id: 'miki', displayName: 'Miki', slackUserId: 'U999', gitlabUsername: 'miki' }],
        fetchImpl,
      })

      expect(result.rootTs).toBe('123.456')
      expect(result.markerThreadTs.b1).toBe('123.456')
      const messageCalls = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/chat.postMessage'))
      expect(messageCalls).toHaveLength(3)
      expect(formBody(messageCalls[0]?.[1]).get('text')).toContain('Loupe QA Export')
      expect(formBody(messageCalls[1]?.[1]).get('text')).toBe('<@U999>\n[Critical] login crash')
      const infoText = formBody(messageCalls[2]?.[1]).get('text') ?? ''
      expect(infoText).toContain('Build: 1.0')
      expect(infoText).toContain('Device: Pixel 7 / Android 14')
      expect(infoText).toContain('Tester: Avery /')
      expect(infoText).toContain('RAM: 8.0G')
      expect(infoText).toContain('Graphic Device: Qualcomm Adreno 740')
      expect(formBody(messageCalls[2]?.[1]).get('thread_ts')).toBe('123.456')
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/files.completeUploadExternal'))).toHaveLength(2)
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
        settings: { botToken: 'xoxb-test', channelId: 'C123', mentionUserIds: [], mentionAliases: {} },
        fetchImpl,
      })

      expect(result.uploadErrors[0]).toContain('invalid_arguments')
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/files.completeUploadExternal'))).toHaveLength(0)
      expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/chat.postMessage'))).toHaveLength(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('refreshSlackAccessToken', () => {
  const baseSettings = {
    botToken: '',
    userToken: 'xoxe.xoxp-old',
    refreshToken: 'xoxe-1-r1',
    tokenExpiresAt: 0,
    publishIdentity: 'user' as const,
    channelId: '',
    oauthClientId: 'cid',
  }

  it('bot mode short-circuits with no network call', async () => {
    const fetchMock = vi.fn()
    const out = await refreshSlackAccessToken(
      { ...baseSettings, publishIdentity: 'bot' },
      fetchMock as any,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.userToken).toBe('xoxe.xoxp-old')
  })

  it('no refresh_token but a user token returns settings unchanged', async () => {
    const fetchMock = vi.fn()
    const out = await refreshSlackAccessToken(
      { ...baseSettings, refreshToken: undefined },
      fetchMock as any,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.userToken).toBe('xoxe.xoxp-old')
  })

  it('non-expired token short-circuits without network', async () => {
    const fetchMock = vi.fn()
    const out = await refreshSlackAccessToken(
      { ...baseSettings, tokenExpiresAt: Date.now() + 3600_000 },
      fetchMock as any,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(out.userToken).toBe('xoxe.xoxp-old')
  })

  it('expired token POSTs to oauth.v2.access and updates userToken/refreshToken/expiresAt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, access_token: 'xoxe.xoxp-NEW', refresh_token: 'xoxe-1-r2', expires_in: 43200, token_type: 'user' }),
      { status: 200 },
    ))
    const out = await refreshSlackAccessToken(baseSettings, fetchMock as any)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://slack.com/api/oauth.v2.access')
    expect(init?.method).toBe('POST')
    expect(init?.body).toContain('grant_type=refresh_token')
    expect(init?.body).toContain('refresh_token=xoxe-1-r1')
    expect(init?.body).toContain('client_id=cid')
    expect(out.userToken).toBe('xoxe.xoxp-NEW')
    expect(out.refreshToken).toBe('xoxe-1-r2')
    expect(out.tokenExpiresAt).toBeGreaterThan(Date.now() + 43000_000)
  })

  it('throws on Slack error response (e.g. invalid_grant)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error: 'invalid_grant' }),
      { status: 200 },
    ))
    await expect(refreshSlackAccessToken(baseSettings, fetchMock as any))
      .rejects.toThrow(/invalid_grant/)
  })

  it('keeps the old refresh_token when Slack response omits a rotated one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, access_token: 'xoxe.xoxp-NEW', expires_in: 43200 }),
      { status: 200 },
    ))
    const out = await refreshSlackAccessToken(baseSettings, fetchMock as any)
    expect(out.refreshToken).toBe('xoxe-1-r1')
  })

  it('sends Basic auth when client_secret is configured (confidential apps)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, access_token: 'xoxe.xoxp-NEW', expires_in: 43200 }),
      { status: 200 },
    ))
    await refreshSlackAccessToken(
      { ...baseSettings, oauthClientSecret: 'csec' },
      fetchMock as any,
    )
    const init = fetchMock.mock.calls[0][1]
    expect(init?.headers?.Authorization).toMatch(/^Basic /)
  })
})
