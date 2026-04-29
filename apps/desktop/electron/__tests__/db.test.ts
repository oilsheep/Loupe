import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../db'
import type { Session, Bug } from '@shared/types'

function fixSession(over: Partial<Session> = {}): Omit<Session, never> {
  return {
    id: 'sess-1', buildVersion: '1.0.0', testNote: '', tester: '', deviceId: 'ABC', deviceModel: 'Pixel 7',
    androidVersion: '14', connectionMode: 'usb', status: 'recording', durationMs: null,
    startedAt: 1700000000000, endedAt: null, videoPath: null, pcRecordingEnabled: false, pcVideoPath: null, ...over,
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

  it('insertBug stores preSec/postSec and rowToBug returns them', () => {
    db.insertSession(fixSession())
    db.insertBug(fixBug({ preSec: 3, postSec: 7 }))
    const b = db.listBugs('sess-1')[0]
    expect(b.preSec).toBe(3)
    expect(b.postSec).toBe(7)
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
