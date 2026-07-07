import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listSessionExports } from '../export-discovery'
import type { Session, Bug } from '@shared/types'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'loupe-disc-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

const session = { id: 's1', buildVersion: '1.0', tester: 't', deviceModel: 'd', platform: 'android', project: 'p', startedAt: 0 } as unknown as Session
const bug = { id: 'm1', sessionId: 's1', offsetMs: 1000, severity: 'normal', note: 'n', preSec: 5, postSec: 5, screenshotRel: null, annotations: [], mentionUserIds: [], customFields: [] } as unknown as Bug

function writeExport(dir: string, sessionId: string) {
  mkdirSync(join(dir, 'records'), { recursive: true })
  writeFileSync(join(dir, 'records', '01.mp4'), 'video-bytes')
  const manifest = {
    version: 2, createdAt: '2026-07-03T00:00:00Z', exportDir: dir, reportPdfPath: null, quality: { tier: 'balanced', preset: 'veryfast', crf: 20 },
    publish: { target: 'local', targets: ['local'], slackThreadMode: null, gitlabMode: null },
    session: { id: sessionId, buildVersion: '1.0', tester: 't', deviceModel: 'd', platform: 'android', project: 'p', testNote: '', deviceId: '', androidVersion: '', ramTotalGb: null, graphicsDevice: null, connectionMode: 'scrcpy', startedAt: '', endedAt: null, durationMs: null },
    markers: [], // empty markers → no clip fingerprint checks; keeps this test focused on claiming
  }
  writeFileSync(join(dir, 'export-manifest.json'), JSON.stringify(manifest))
}

describe('listSessionExports', () => {
  it('claims only folders whose manifest session.id matches', () => {
    writeExport(join(root, 'mine'), 's1')
    writeExport(join(root, 'other'), 'sX')
    const infos = listSessionExports({ exportRoot: root, sessionDir: '/nope', session, bugs: [], severities: {} as any, currentQuality: { preset: 'veryfast', crf: 20 } })
    expect(infos).toHaveLength(1)
    expect(infos[0].folderName).toBe('mine')
    expect(infos[0].status.status).toBe('clean')   // empty markers, session matches baseline → clean
  })

  it('reads publish-state.json when present', () => {
    const dir = join(root, 'mine'); writeExport(dir, 's1')
    writeFileSync(join(dir, 'publish-state.json'), JSON.stringify({ version: 1, targets: { slack: [{ channelId: 'C1', rootTs: 't', markerThreadTs: {}, publishedAt: 'x' }] } }))
    const infos = listSessionExports({ exportRoot: root, sessionDir: '/nope', session, bugs: [], severities: {} as any, currentQuality: { preset: 'veryfast', crf: 20 } })
    expect(infos[0].publishState?.targets.slack).toHaveLength(1)
  })

  it('ignores exportRoot that does not exist', () => {
    expect(listSessionExports({ exportRoot: join(root, 'ghost'), sessionDir: '/nope', session, bugs: [], severities: {} as any, currentQuality: { preset: 'veryfast', crf: 20 } })).toEqual([])
  })
})
