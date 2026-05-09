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
    exeDir: '/Applications/Loupe QA Recorder.app/Contents/MacOS',
    devRoot: '/repo/recordings',
  }

  it('darwin packaged splits config (userData) from sessions (~/Movies/Loupe)', () => {
    expect(resolveAppRoots({ ...base, platform: 'darwin' })).toEqual({
      configRoot: base.userData,
      sessionsRoot: '/Users/u/Movies/Loupe',
    })
  })

  it('darwin dev keeps both roots at devRoot', () => {
    expect(resolveAppRoots({ ...base, platform: 'darwin', isPackaged: false })).toEqual({
      configRoot: '/repo/recordings',
      sessionsRoot: '/repo/recordings',
    })
  })

  it('win32 packaged keeps both roots next to exe', () => {
    // Note: `path.join` is host-platform-aware, so on a posix host the
    // separator in the joined output is '/'. We compute the expected value
    // via `join` here so the test verifies the contract (exeDir + 'recordings')
    // independent of which platform the test runner happens to be on.
    const exeDir = 'C:\\Program Files\\Loupe'
    const expected = join(exeDir, 'recordings')
    expect(resolveAppRoots({ ...base, platform: 'win32', exeDir })).toEqual({
      configRoot: expected,
      sessionsRoot: expected,
    })
  })

  it('linux packaged keeps both roots next to exe', () => {
    expect(resolveAppRoots({ ...base, platform: 'linux', exeDir: '/opt/loupe' })).toEqual({
      configRoot: '/opt/loupe/recordings',
      sessionsRoot: '/opt/loupe/recordings',
    })
  })

  it('any platform in dev mode uses devRoot for both', () => {
    expect(resolveAppRoots({ ...base, platform: 'win32', isPackaged: false })).toEqual({
      configRoot: '/repo/recordings',
      sessionsRoot: '/repo/recordings',
    })
  })
})
