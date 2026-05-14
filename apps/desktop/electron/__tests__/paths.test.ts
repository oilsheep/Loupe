import { describe, it, expect } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPaths, resolveAppRoots } from '../paths'

describe('paths', () => {
  it('builds expected per-session structure under root', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-'))
    try {
      const p = createPaths({ configRoot: root, sessionsRoot: root })
      expect(p.configRoot()).toBe(root)
      expect(p.sessionsRoot()).toBe(root)
      expect(p.dbFile()).toBe(join(root, 'meta.sqlite'))
      expect(p.sessionDir('abc')).toBe(join(root, 'sessions', 'abc'))
      expect(p.videoFile('abc')).toBe(join(root, 'sessions', 'abc', 'video.mp4'))
      expect(p.pcVideoFile('abc')).toBe(join(root, 'sessions', 'abc', 'pc-recording.webm'))
      expect(p.clicksFile('abc')).toBe(join(root, 'sessions', 'abc', 'clicks.jsonl'))
      expect(p.screenshotFile('abc', 'bug1')).toBe(join(root, 'sessions', 'abc', 'screenshots', 'bug1.png'))
      expect(p.logcatFile('abc', 'bug1')).toBe(join(root, 'sessions', 'abc', 'logcat', 'bug1.txt'))
      expect(p.clipFile('abc', 'bug1')).toBe(join(root, 'sessions', 'abc', 'clips', 'bug1.mp4'))
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('ensureSessionDirs creates all needed subdirs', () => {
    const root = mkdtempSync(join(tmpdir(), 'loupe-'))
    try {
      const p = createPaths({ configRoot: root, sessionsRoot: root })
      p.ensureSessionDirs('abc')
      expect(existsSync(join(root, 'sessions', 'abc', 'screenshots'))).toBe(true)
      expect(existsSync(join(root, 'sessions', 'abc', 'logcat'))).toBe(true)
      expect(existsSync(join(root, 'sessions', 'abc', 'clips'))).toBe(true)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})

describe('resolveAppRoots', () => {
  const base = {
    isPackaged: true,
    userData: '/Users/u/Library/Application Support/Loupe QA Recorder',
    movies: '/Users/u/Movies',
    devRoot: '/repo/recordings',
  }

  it('packaged splits config (userData) from sessions (<movies>/Loupe)', () => {
    expect(resolveAppRoots(base)).toEqual({
      configRoot: base.userData,
      sessionsRoot: join(base.movies, 'Loupe'),
    })
  })

  it('packaged handles Windows-style paths', () => {
    expect(resolveAppRoots({
      ...base,
      userData: 'C:\\Users\\u\\AppData\\Roaming\\Loupe QA Recorder',
      movies: 'C:\\Users\\u\\Videos',
    })).toEqual({
      configRoot: 'C:\\Users\\u\\AppData\\Roaming\\Loupe QA Recorder',
      sessionsRoot: join('C:\\Users\\u\\Videos', 'Loupe'),
    })
  })

  it('dev mode collapses both roots to devRoot', () => {
    expect(resolveAppRoots({ ...base, isPackaged: false })).toEqual({
      configRoot: '/repo/recordings',
      sessionsRoot: '/repo/recordings',
    })
  })
})
