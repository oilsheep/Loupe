import Database from 'better-sqlite3'
import type { Session, Bug, BugSeverity, SessionStatus } from '@shared/types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  build_version TEXT NOT NULL,
  test_note TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL,
  device_model TEXT NOT NULL,
  android_version TEXT NOT NULL,
  connection_mode TEXT NOT NULL CHECK(connection_mode IN ('usb','wifi')),
  status TEXT NOT NULL CHECK(status IN ('recording','draft')),
  duration_ms INTEGER,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS bugs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  offset_ms INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('major','normal')),
  note TEXT NOT NULL,
  screenshot_rel TEXT,
  logcat_rel TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bugs_session_offset ON bugs(session_id, offset_ms);
CREATE INDEX IF NOT EXISTS idx_sessions_started   ON sessions(started_at DESC);
`

type Row<T> = { [K in keyof T]: T[K] }

function rowToSession(r: any): Session {
  return {
    id: r.id, buildVersion: r.build_version, testNote: r.test_note, deviceId: r.device_id,
    deviceModel: r.device_model, androidVersion: r.android_version,
    connectionMode: r.connection_mode, status: r.status,
    durationMs: r.duration_ms, startedAt: r.started_at, endedAt: r.ended_at,
  }
}
function rowToBug(r: any): Bug {
  return {
    id: r.id, sessionId: r.session_id, offsetMs: r.offset_ms,
    severity: r.severity, note: r.note,
    screenshotRel: r.screenshot_rel, logcatRel: r.logcat_rel,
    createdAt: r.created_at,
  }
}

export function openDb(file: string) {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  const insertSessionStmt = db.prepare(`
    INSERT INTO sessions (id, build_version, test_note, device_id, device_model, android_version,
                          connection_mode, status, duration_ms, started_at, ended_at)
    VALUES (@id, @buildVersion, @testNote, @deviceId, @deviceModel, @androidVersion,
            @connectionMode, @status, @durationMs, @startedAt, @endedAt)
  `)
  const finalizeSessionStmt = db.prepare(`
    UPDATE sessions SET status='draft', duration_ms=@durationMs, ended_at=@endedAt WHERE id=@id
  `)
  const getSessionStmt   = db.prepare(`SELECT * FROM sessions WHERE id = ?`)
  const listSessionsStmt = db.prepare(`SELECT * FROM sessions ORDER BY started_at DESC`)
  const deleteSessionStmt= db.prepare(`DELETE FROM sessions WHERE id = ?`)

  const insertBugStmt = db.prepare(`
    INSERT INTO bugs (id, session_id, offset_ms, severity, note, screenshot_rel, logcat_rel, created_at)
    VALUES (@id, @sessionId, @offsetMs, @severity, @note, @screenshotRel, @logcatRel, @createdAt)
  `)
  const updateBugStmt = db.prepare(`UPDATE bugs SET note=@note, severity=@severity WHERE id=@id`)
  const deleteBugStmt = db.prepare(`DELETE FROM bugs WHERE id = ?`)
  const listBugsStmt  = db.prepare(`SELECT * FROM bugs WHERE session_id = ? ORDER BY offset_ms ASC`)

  return {
    raw: db,
    insertSession(s: Session) { insertSessionStmt.run(s) },
    finalizeSession(id: string, args: { durationMs: number; endedAt: number }) {
      finalizeSessionStmt.run({ id, ...args })
    },
    getSession(id: string): Session | undefined {
      const r = getSessionStmt.get(id) as any
      return r ? rowToSession(r) : undefined
    },
    listSessions(): Session[] {
      return (listSessionsStmt.all() as any[]).map(rowToSession)
    },
    deleteSession(id: string) { deleteSessionStmt.run(id) },
    insertBug(b: Bug) { insertBugStmt.run(b) },
    updateBug(id: string, patch: { note: string; severity: BugSeverity }) {
      updateBugStmt.run({ id, ...patch })
    },
    deleteBug(id: string) { deleteBugStmt.run(id) },
    listBugs(sessionId: string): Bug[] {
      return (listBugsStmt.all(sessionId) as any[]).map(rowToBug)
    },
    close() { db.close() },
  }
}

export type Db = ReturnType<typeof openDb>
