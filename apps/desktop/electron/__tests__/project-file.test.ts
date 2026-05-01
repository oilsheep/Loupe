import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readProjectFile, writeProjectFile } from '../project-file'
import type { Bug, Session } from '@shared/types'

function session(over: Partial<Session> = {}): Session {
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
    startedAt: 1,
    endedAt: 2,
    videoPath: 'C:/video.mp4',
    pcRecordingEnabled: false,
    pcVideoPath: null,
    micAudioPath: null,
    micAudioDurationMs: null, micAudioStartOffsetMs: null,
    ...over,
  }
}

function bug(over: Partial<Bug> = {}): Bug {
  return {
    id: 'b1',
    sessionId: 's1',
    offsetMs: 1_000,
    severity: 'normal',
    note: 'note',
    screenshotRel: null,
    logcatRel: null,
    audioRel: null,
    audioDurationMs: null,
    createdAt: 3,
    preSec: 5,
    postSec: 5,
    ...over,
  }
}

describe('project file', () => {
  it('writes and reads a Loupe session archive', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-project-'))
    try {
      const file = join(root, 's1.loupe')
      writeProjectFile(file, session(), [bug()], 123)
      const project = readProjectFile(file)
      expect(project.version).toBe(1)
      expect(project.savedAt).toBe(123)
      expect(project.session.videoPath).toBe('C:/video.mp4')
      expect(project.bugs[0].note).toBe('note')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
