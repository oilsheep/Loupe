import * as fs from 'node:fs'
import { join } from 'node:path'

export interface LegacyMigrationOpts {
  legacyRoot: string
  newConfigRoot: string
  newSessionsRoot: string
}

/**
 * Second-line rescue out of `<exeDir>/recordings` into the new userData /
 * <videos>\Loupe locations. The NSIS installer's `customInit` macro is the
 * primary path; this catches anything that slips through. Idempotent.
 */
export function migrateLegacyExeRecordings(opts: LegacyMigrationOpts): void {
  const legacyDb = join(opts.legacyRoot, 'meta.sqlite')
  if (!fs.existsSync(legacyDb)) return

  const newDb = join(opts.newConfigRoot, 'meta.sqlite')
  if (fs.existsSync(newDb)) {
    console.log(`Loupe migration: skipping — DB already exists at ${newDb}`)
    return
  }

  console.log(`Loupe migration: moving legacy data from ${opts.legacyRoot} → ${opts.newConfigRoot} / ${opts.newSessionsRoot}`)
  fs.mkdirSync(opts.newConfigRoot, { recursive: true })
  fs.mkdirSync(opts.newSessionsRoot, { recursive: true })

  moveFile(legacyDb, newDb)
  moveFile(`${legacyDb}-wal`, `${newDb}-wal`)
  moveFile(`${legacyDb}-shm`, `${newDb}-shm`)

  const legacySettings = join(opts.legacyRoot, 'settings.json')
  const newSettings = join(opts.newConfigRoot, 'settings.json')
  if (fs.existsSync(legacySettings) && !fs.existsSync(newSettings)) {
    moveFile(legacySettings, newSettings)
  }

  const legacySessions = join(opts.legacyRoot, 'sessions')
  const newSessions = join(opts.newSessionsRoot, 'sessions')
  if (fs.existsSync(legacySessions) && !fs.existsSync(newSessions)) {
    moveFile(legacySessions, newSessions)
  }
}

function moveFile(src: string, dst: string): void {
  if (!fs.existsSync(src)) return
  try {
    fs.renameSync(src, dst)
  } catch {
    // EXDEV — Node's `fs.renameSync` wraps `rename(2)` which can't cross
    // volumes. Fall back to copy + delete.
    try {
      fs.cpSync(src, dst, { recursive: true })
      fs.rmSync(src, { recursive: true, force: true })
    } catch (copyErr) {
      console.warn(`Loupe migration: failed to move ${src} → ${dst}:`, copyErr)
    }
  }
}
