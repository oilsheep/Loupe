import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../db'
import type { Session, Bug } from '@shared/types'

function fixSession(over: Partial<Session> = {}): Omit<Session, never> {
  return {
    id: 'sess-1', buildVersion: '1.0.0', testNote: '', tester: '', deviceId: 'ABC', deviceModel: 'Pixel 7',
    androidVersion: '14', connectionMode: 'usb', status: 'recording', durationMs: null,
    startedAt: 1700000000000, endedAt: null, videoPath: null, pcRecordingEnabled: false, pcVideoPath: null,
    micAudioPath: null, micAudioDurationMs: null, micAudioStartOffsetMs: null, ...over,
  }
}
function fixBug(over: Partial<Bug> = {}): Omit<Bug, never> {
  return {
    id: 'bug-1', sessionId: 'sess-1', offsetMs: 5000, severity: 'normal', note: 'cards stuck',
    screenshotRel: null, logcatRel: null, createdAt: 1700000005000,
    audioRel: null, audioDurationMs: null,
    preSec: 5, postSec: 5, ...over,
  }
}

describe('Db', () => {
  let db: ReturnType<typeof openDb>
  beforeEach(() => { db = openDb(':memory:') })

  it('creates and retrieves a session', () => {
    db.insertSession(fixSession({ videoPath: 'C:/tmp/video.mp4', pcRecordingEnabled: true, pcVideoPath: 'C:/tmp/pc.webm' }))
    const s = db.getSession('sess-1')
    expect(s?.deviceModel).toBe('Pixel 7')
    expect(s?.videoPath).toBe('C:/tmp/video.mp4')
    expect(s?.pcRecordingEnabled).toBe(true)
    expect(s?.pcVideoPath).toBe('C:/tmp/pc.webm')
  })

  it('updates PC recording metadata', () => {
    db.insertSession(fixSession())
    db.updateSessionPcRecording('sess-1', { pcRecordingEnabled: true, pcVideoPath: 'C:/tmp/pc.webm' })
    const s = db.getSession('sess-1')
    expect(s?.pcRecordingEnabled).toBe(true)
    expect(s?.pcVideoPath).toBe('C:/tmp/pc.webm')
  })

  it('updates session MIC recording metadata', () => {
    db.insertSession(fixSession())
    db.updateSessionMicRecording('sess-1', { micAudioPath: 'C:/tmp/session-mic.webm', micAudioDurationMs: 12345, micAudioSource: 'external', micAudioStartOffsetMs: -500 })
    const s = db.getSession('sess-1')
    expect(s?.micAudioPath).toBe('C:/tmp/session-mic.webm')
    expect(s?.micAudioDurationMs).toBe(12345)
    expect(s?.micAudioStartOffsetMs).toBe(-500)
    expect(s?.micAudioSource).toBe('external')
    db.updateSessionMicAudioOffset('sess-1', 750)
    expect(db.getSession('sess-1')?.micAudioStartOffsetMs).toBe(750)
  })

  it('listSessions returns rows newest-first', () => {
    db.insertSession(fixSession({ id: 's1', startedAt: 100 }))
    db.insertSession(fixSession({ id: 's2', startedAt: 200 }))
    db.insertSession(fixSession({ id: 's3', startedAt: 150 }))
    expect(db.listSessions().map(r => r.id)).toEqual(['s2', 's3', 's1'])
  })

  it('updates session status + duration', () => {
    db.insertSession(fixSession())
    db.finalizeSession('sess-1', { durationMs: 60000, endedAt: 1700000060000 })
    const s = db.getSession('sess-1')!
    expect(s.status).toBe('draft')
    expect(s.durationMs).toBe(60000)
  })

  it('insertBug + listBugs ordered by offsetMs', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug({ id: 'b1', offsetMs: 5000 }))
    db.insertBug(fixBug({ id: 'b2', offsetMs: 1000 }))
    db.insertBug(fixBug({ id: 'b3', offsetMs: 3000 }))
    expect(db.listBugs('sess-1').map(b => b.id)).toEqual(['b2', 'b3', 'b1'])
  })

  it('updateBug changes note, severity, and clip window seconds', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug())
    db.updateBug('bug-1', { note: 'fixed text', severity: 'major', preSec: 8, postSec: 12 })
    const b = db.listBugs('sess-1')[0]
    expect(b.note).toBe('fixed text')
    expect(b.severity).toBe('major')
    expect(b.preSec).toBe(8)
    expect(b.postSec).toBe(12)
  })

  it('stores custom marker severities', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug({ severity: 'custom1' }))
    expect(db.listBugs('sess-1')[0].severity).toBe('custom1')
  })

  it('stores and updates marker custom fields', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug({ customFields: [{ key: 'priority', value: 'high' }, { key: 'targets', value: ['gitlab', 'slack'] }] }))
    expect(db.listBugs('sess-1')[0].customFields).toEqual([
      { key: 'priority', value: 'high' },
      { key: 'targets', value: ['gitlab', 'slack'] },
    ])

    db.updateBug('bug-1', { note: 'cards stuck', severity: 'normal', preSec: 5, postSec: 5, customFields: [{ key: 'owner', value: 'qa' }] })

    expect(db.listBugs('sess-1')[0].customFields).toEqual([{ key: 'owner', value: 'qa' }])
  })

  it('stores marker source and can delete only audio auto markers', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug({ id: 'manual', source: 'manual' }))
    db.insertBug(fixBug({ id: 'auto', source: 'audio-auto' }))
    expect(db.listBugs('sess-1').find(b => b.id === 'auto')?.source).toBe('audio-auto')

    const removed = db.deleteBugsBySourceForSession('sess-1', 'audio-auto')

    expect(removed).toBe(1)
    expect(db.listBugs('sess-1').map(b => b.id)).toEqual(['manual'])
  })

  it('deletes legacy audio markers by note prefix when re-analyzing', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug({ id: 'manual', source: 'manual', note: 'real manual' }))
    db.insertBug(fixBug({ id: 'legacy-auto', source: 'manual', note: '[Audio] old generated marker' }))

    const removed = db.deleteBugsBySourceForSession('sess-1', 'audio-auto')

    expect(removed).toBe(1)
    expect(db.listBugs('sess-1').map(b => b.id)).toEqual(['manual'])
  })

  it('insertBug stores preSec/postSec and rowToBug returns them', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug({ preSec: 3, postSec: 7 }))
    const b = db.listBugs('sess-1')[0]
    expect(b.preSec).toBe(3)
    expect(b.postSec).toBe(7)
  })

  it('stores, updates, lists, and deletes marker annotations', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug())
    db.insertAnnotation({
      id: 'ann-1',
      bugId: 'bug-1',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      startMs: 4200,
      endMs: 6400,
      createdAt: 1700000006000,
    })
    expect(db.listBugs('sess-1')[0].annotations).toEqual([expect.objectContaining({ id: 'ann-1', x: 0.1, startMs: 4200 })])
    db.updateAnnotation('ann-1', { x: 0.25, endMs: 7000 })
    expect(db.listBugs('sess-1')[0].annotations?.[0]).toEqual(expect.objectContaining({ x: 0.25, endMs: 7000 }))
    db.deleteAnnotation('ann-1')
    expect(db.listBugs('sess-1')[0].annotations).toEqual([])
  })

  it('updates bug audio metadata', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug())
    db.updateBugAudio('bug-1', { audioRel: 'audio/bug-1.webm', audioDurationMs: 1234 })
    const b = db.listBugs('sess-1')[0]
    expect(b.audioRel).toBe('audio/bug-1.webm')
    expect(b.audioDurationMs).toBe(1234)
  })

  it('updates bug screenshot and logcat metadata', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug())
    db.updateBugAssets('bug-1', { screenshotRel: 'screenshots/bug-1.png', logcatRel: 'logcat/bug-1.txt' })
    const b = db.listBugs('sess-1')[0]
    expect(b.screenshotRel).toBe('screenshots/bug-1.png')
    expect(b.logcatRel).toBe('logcat/bug-1.txt')
  })

  it('deleteBug removes one bug', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug({ id: 'b1' })); db.insertBug(fixBug({ id: 'b2' }))
    db.deleteBug('b1')
    expect(db.listBugs('sess-1').map(b => b.id)).toEqual(['b2'])
  })

  it('deleteSession cascades to bugs', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug())
    db.deleteSession('sess-1')
    expect(db.getSession('sess-1')).toBeUndefined()
    expect(db.listBugs('sess-1')).toEqual([])
  })
})

const TMP_DIRS: string[] = []
function makeTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'loupe-db-'))
  TMP_DIRS.push(dir)
  return dir
}
afterEach(() => {
  while (TMP_DIRS.length) rmSync(TMP_DIRS.pop()!, { recursive: true, force: true })
})

function makeSession(id: string, oldRoot: string): Session {
  return {
    id,
    deviceId: 'dev',
    deviceModel: 'Pixel',
    androidVersion: 'Android 14',
    connectionMode: 'usb',
    status: 'draft',
    buildVersion: 'MR',
    testNote: '',
    tester: '',
    startedAt: 1,
    endedAt: 2,
    durationMs: 1000,
    videoPath: `${oldRoot}/sessions/${id}/video.mp4`,
    pcRecordingEnabled: false,
    pcVideoPath: null,
    micAudioPath: `${oldRoot}/sessions/${id}/session-mic.webm`,
    micAudioDurationMs: 1000,
    micAudioStartOffsetMs: 0,
  } as Session
}

describe('rewriteSessionAssetRoots', () => {
  it('replaces oldRoot prefix in video, pc_video, mic_audio paths', () => {
    const dir = makeTmp()
    const db = openDb(join(dir, 'meta.sqlite'))
    db.insertSession(makeSession('s1', '/old/root'))
    const result = db.rewriteSessionAssetRoots('/old/root', '/new/root')
    expect(result.rowsChanged).toBe(1)
    const s = db.getSession('s1')!
    expect(s.videoPath).toBe('/new/root/sessions/s1/video.mp4')
    expect(s.micAudioPath).toBe('/new/root/sessions/s1/session-mic.webm')
    db.close()
  })

  it('leaves NULL path columns as NULL', () => {
    const dir = makeTmp()
    const db = openDb(join(dir, 'meta.sqlite'))
    db.insertSession({ ...makeSession('s1', '/old'), micAudioPath: null })
    db.rewriteSessionAssetRoots('/old', '/new')
    const s = db.getSession('s1')!
    expect(s.micAudioPath).toBeNull()
    db.close()
  })

  it('only rewrites paths matching the old prefix', () => {
    const dir = makeTmp()
    const db = openDb(join(dir, 'meta.sqlite'))
    db.insertSession({ ...makeSession('s1', '/old'), videoPath: '/somewhere-else/video.mp4' })
    db.rewriteSessionAssetRoots('/old', '/new')
    const s = db.getSession('s1')!
    expect(s.videoPath).toBe('/somewhere-else/video.mp4')
    db.close()
  })

  it('handles multiple sessions in one call', () => {
    const dir = makeTmp()
    const db = openDb(join(dir, 'meta.sqlite'))
    db.insertSession(makeSession('s1', '/old'))
    db.insertSession(makeSession('s2', '/old'))
    const result = db.rewriteSessionAssetRoots('/old', '/new')
    expect(result.rowsChanged).toBe(2)
    db.close()
  })

  it('is idempotent: re-running on already-rewritten rows is a no-op', () => {
    const dir = makeTmp()
    const db = openDb(join(dir, 'meta.sqlite'))
    db.insertSession(makeSession('s1', '/old'))
    db.rewriteSessionAssetRoots('/old', '/new')
    const r2 = db.rewriteSessionAssetRoots('/old', '/new')
    expect(r2.rowsChanged).toBe(0)
    const s = db.getSession('s1')!
    expect(s.videoPath).toBe('/new/sessions/s1/video.mp4')
    db.close()
  })

  it('rewrites Windows-style backslash paths', () => {
    const dir = makeTmp()
    const db = openDb(join(dir, 'meta.sqlite'))
    const winOld = 'C:\\Program Files\\Loupe\\recordings'
    const winNew = 'C:\\Users\\u\\Videos\\Loupe'
    db.insertSession({
      ...makeSession('s1', '/old'),
      videoPath: `${winOld}\\sessions\\s1\\video.mp4`,
      micAudioPath: `${winOld}\\sessions\\s1\\session-mic.webm`,
    })
    const result = db.rewriteSessionAssetRoots(winOld, winNew)
    expect(result.rowsChanged).toBe(1)
    const s = db.getSession('s1')!
    expect(s.videoPath).toBe(`${winNew}\\sessions\\s1\\video.mp4`)
    expect(s.micAudioPath).toBe(`${winNew}\\sessions\\s1\\session-mic.webm`)
    db.close()
  })
})

describe('renameSessionProject', () => {
  it('updates the project field on matching session rows', () => {
    const dir = makeTmp()
    const db = openDb(join(dir, 'meta.sqlite'))
    db.insertSession({ ...makeSession('s1', '/r'), project: 'OldName' } as Session)
    db.insertSession({ ...makeSession('s2', '/r'), project: 'OtherName' } as Session)
    const result = db.renameSessionProject('OldName', 'NewName')
    expect(result.rowsChanged).toBe(1)
    expect(db.getSession('s1')!.project).toBe('NewName')
    expect(db.getSession('s2')!.project).toBe('OtherName')
    db.close()
  })
})

describe('profile_id column migration', () => {
  it('adds profile_id column if missing', () => {
    const dir = makeTmp()
    const db = openDb(join(dir, 'loupe.db'))
    const cols = (db.raw.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>).map(c => c.name)
    expect(cols).toContain('profile_id')
    db.close()
  })

  it('is idempotent on second open (does not re-add column)', () => {
    const dir = makeTmp()
    const dbPath = join(dir, 'loupe.db')
    openDb(dbPath).close()
    const db2 = openDb(dbPath)
    const cols = (db2.raw.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>).map(c => c.name)
    expect(cols.filter(c => c === 'profile_id').length).toBe(1)
    db2.close()
  })
})

describe('setSessionProfileId / listSessionsWithoutProfileId', () => {
  it('sets profile_id and lists sessions still missing one', () => {
    const dir = makeTmp()
    const db = openDb(join(dir, 'loupe.db'))
    db.insertSession({ ...makeSession('s1', '/r') } as Session)
    db.setSessionProfileId('s1', 'profile-A')
    const reloaded = db.getSession('s1')!
    expect(reloaded.profileId).toBe('profile-A')

    db.insertSession({ ...makeSession('s2', '/r') } as Session)
    const orphans = db.listSessionsWithoutProfileId()
    expect(orphans.map(o => o.id)).toContain('s2')
    expect(orphans.map(o => o.id)).not.toContain('s1')

    db.close()
  })
})
