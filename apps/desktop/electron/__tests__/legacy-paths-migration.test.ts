import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateLegacyExeRecordings } from '../legacy-paths-migration'

describe('migrateLegacyExeRecordings', () => {
  let root: string
  let legacyRoot: string
  let newConfigRoot: string
  let newSessionsRoot: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'loupe-migration-'))
    legacyRoot = join(root, 'legacy')
    newConfigRoot = join(root, 'config')
    newSessionsRoot = join(root, 'sessions-root')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function seedLegacy(): void {
    mkdirSync(legacyRoot, { recursive: true })
    writeFileSync(join(legacyRoot, 'meta.sqlite'), 'fake-db-bytes')
    writeFileSync(join(legacyRoot, 'meta.sqlite-wal'), 'fake-wal-bytes')
    writeFileSync(join(legacyRoot, 'meta.sqlite-shm'), 'fake-shm-bytes')
    writeFileSync(join(legacyRoot, 'settings.json'), '{"foo":"bar"}')
    mkdirSync(join(legacyRoot, 'sessions', 'abc'), { recursive: true })
    writeFileSync(join(legacyRoot, 'sessions', 'abc', 'video.mp4'), 'fake-video-bytes')
  }

  it('no-op when legacyRoot does not exist', () => {
    migrateLegacyExeRecordings({ legacyRoot, newConfigRoot, newSessionsRoot })
    expect(existsSync(newConfigRoot)).toBe(false)
  })

  it('moves DB, WAL/SHM, settings, and sessions when target is empty', () => {
    seedLegacy()
    migrateLegacyExeRecordings({ legacyRoot, newConfigRoot, newSessionsRoot })

    expect(existsSync(join(legacyRoot, 'meta.sqlite'))).toBe(false)
    expect(existsSync(join(legacyRoot, 'settings.json'))).toBe(false)
    expect(existsSync(join(legacyRoot, 'sessions'))).toBe(false)

    expect(readFileSync(join(newConfigRoot, 'meta.sqlite'), 'utf8')).toBe('fake-db-bytes')
    expect(readFileSync(join(newConfigRoot, 'meta.sqlite-wal'), 'utf8')).toBe('fake-wal-bytes')
    expect(readFileSync(join(newConfigRoot, 'meta.sqlite-shm'), 'utf8')).toBe('fake-shm-bytes')
    expect(readFileSync(join(newConfigRoot, 'settings.json'), 'utf8')).toBe('{"foo":"bar"}')
    expect(readFileSync(join(newSessionsRoot, 'sessions', 'abc', 'video.mp4'), 'utf8')).toBe('fake-video-bytes')
  })

  it('refuses to clobber an existing DB at the new location', () => {
    seedLegacy()
    mkdirSync(newConfigRoot, { recursive: true })
    writeFileSync(join(newConfigRoot, 'meta.sqlite'), 'fresh-data')

    migrateLegacyExeRecordings({ legacyRoot, newConfigRoot, newSessionsRoot })

    expect(readFileSync(join(newConfigRoot, 'meta.sqlite'), 'utf8')).toBe('fresh-data')
    expect(readFileSync(join(legacyRoot, 'meta.sqlite'), 'utf8')).toBe('fake-db-bytes')
  })

  it('preserves an existing settings.json at the new location', () => {
    seedLegacy()
    mkdirSync(newConfigRoot, { recursive: true })
    writeFileSync(join(newConfigRoot, 'settings.json'), '{"keepMe":true}')

    migrateLegacyExeRecordings({ legacyRoot, newConfigRoot, newSessionsRoot })

    expect(readFileSync(join(newConfigRoot, 'settings.json'), 'utf8')).toBe('{"keepMe":true}')
    expect(existsSync(join(legacyRoot, 'settings.json'))).toBe(true)
  })

  it('preserves an existing sessions tree at the new location', () => {
    seedLegacy()
    mkdirSync(join(newSessionsRoot, 'sessions', 'xyz'), { recursive: true })
    writeFileSync(join(newSessionsRoot, 'sessions', 'xyz', 'video.mp4'), 'new-session')

    migrateLegacyExeRecordings({ legacyRoot, newConfigRoot, newSessionsRoot })

    expect(readFileSync(join(newSessionsRoot, 'sessions', 'xyz', 'video.mp4'), 'utf8')).toBe('new-session')
    expect(existsSync(join(legacyRoot, 'sessions', 'abc', 'video.mp4'))).toBe(true)
  })

  it('is safe to invoke twice in a row', () => {
    seedLegacy()
    migrateLegacyExeRecordings({ legacyRoot, newConfigRoot, newSessionsRoot })
    expect(() => migrateLegacyExeRecordings({ legacyRoot, newConfigRoot, newSessionsRoot })).not.toThrow()
  })
})
