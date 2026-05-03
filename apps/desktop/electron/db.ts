import Database from 'better-sqlite3'
import type { Session, Bug, BugAnnotation, BugSeverity, SessionStatus } from '@shared/types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  build_version TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  test_note TEXT NOT NULL DEFAULT '',
  tester TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL,
  device_model TEXT NOT NULL,
  android_version TEXT NOT NULL,
  ram_total_gb REAL,
  graphics_device TEXT,
  connection_mode TEXT NOT NULL CHECK(connection_mode IN ('usb','wifi','pc')),
  status TEXT NOT NULL CHECK(status IN ('recording','draft')),
  duration_ms INTEGER,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  video_path TEXT,
  pc_recording_enabled INTEGER NOT NULL DEFAULT 0,
  pc_video_path TEXT,
  mic_audio_path TEXT,
  mic_audio_duration_ms INTEGER,
  mic_audio_start_offset_ms INTEGER,
  mic_audio_source TEXT
);

CREATE TABLE IF NOT EXISTS bugs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  offset_ms INTEGER NOT NULL,
  severity TEXT NOT NULL,
  note TEXT NOT NULL,
  screenshot_rel TEXT,
  logcat_rel TEXT,
  audio_rel TEXT,
  audio_duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  pre_sec INTEGER NOT NULL DEFAULT 5,
  post_sec INTEGER NOT NULL DEFAULT 5,
  mention_user_ids TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS bug_annotations (
  id TEXT PRIMARY KEY,
  bug_id TEXT NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'rect',
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  points_json TEXT NOT NULL DEFAULT '[]',
  text TEXT NOT NULL DEFAULT '',
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bugs_session_offset ON bugs(session_id, offset_ms);
CREATE INDEX IF NOT EXISTS idx_bug_annotations_bug ON bug_annotations(bug_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_sessions_started   ON sessions(started_at DESC);
`

type Row<T> = { [K in keyof T]: T[K] }

function rowToSession(r: any): Session {
  return {
    id: r.id, buildVersion: r.build_version, testNote: r.test_note, deviceId: r.device_id,
    platform: r.platform ?? '',
    project: r.project ?? '',
    tester: r.tester ?? '',
    deviceModel: r.device_model, androidVersion: r.android_version,
    ramTotalGb: r.ram_total_gb ?? null,
    graphicsDevice: r.graphics_device ?? null,
    connectionMode: r.connection_mode, status: r.status,
    durationMs: r.duration_ms, startedAt: r.started_at, endedAt: r.ended_at,
    videoPath: r.video_path ?? null,
    pcRecordingEnabled: Boolean(r.pc_recording_enabled ?? 0),
    pcVideoPath: r.pc_video_path ?? null,
    micAudioPath: r.mic_audio_path ?? null,
    micAudioDurationMs: r.mic_audio_duration_ms ?? null,
    micAudioStartOffsetMs: r.mic_audio_start_offset_ms ?? null,
    micAudioSource: r.mic_audio_source ?? null,
  }
}
function rowToBug(r: any): Bug {
  const note = r.note ?? ''
  const source = r.source === 'audio-auto' || String(note).trimStart().startsWith('[Audio]')
    ? 'audio-auto'
    : 'manual'
  return {
    id: r.id, sessionId: r.session_id, offsetMs: r.offset_ms,
    severity: r.severity, note,
    screenshotRel: r.screenshot_rel, logcatRel: r.logcat_rel,
    audioRel: r.audio_rel ?? null, audioDurationMs: r.audio_duration_ms ?? null,
    createdAt: r.created_at,
    preSec: r.pre_sec, postSec: r.post_sec,
    mentionUserIds: parseJsonStringArray(r.mention_user_ids),
    source,
    annotations: [],
  }
}

function rowToAnnotation(r: any): BugAnnotation {
  return {
    id: r.id,
    bugId: r.bug_id,
    kind: r.kind ?? 'rect',
    x: Number(r.x),
    y: Number(r.y),
    width: Number(r.width),
    height: Number(r.height),
    points: parseAnnotationPoints(r.points_json),
    text: r.text ?? '',
    startMs: r.start_ms,
    endMs: r.end_ms,
    createdAt: r.created_at,
  }
}

function parseAnnotationPoints(value: unknown): Array<{ x: number; y: number }> {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(point => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
  } catch {
    return []
  }
}

function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item).trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

function serializeAnnotation(annotation: BugAnnotation) {
  return {
    ...annotation,
    kind: annotation.kind ?? 'rect',
    pointsJson: JSON.stringify(annotation.points ?? []),
    text: annotation.text ?? '',
  }
}

/**
 * Additive migration: add columns introduced after the original schema.
 * Safe to run on a fresh DB (column already exists from CREATE TABLE) — we just
 * skip via the table_info pragma check.
 */
function migrate(db: Database.Database): void {
  const sessionCols = (db.pragma(`table_info('sessions')`) as { name: string }[]).map(c => c.name)
  if (!sessionCols.includes('video_path')) db.exec(`ALTER TABLE sessions ADD COLUMN video_path TEXT`)
  if (!sessionCols.includes('tester')) db.exec(`ALTER TABLE sessions ADD COLUMN tester TEXT NOT NULL DEFAULT ''`)
  if (!sessionCols.includes('platform')) db.exec(`ALTER TABLE sessions ADD COLUMN platform TEXT NOT NULL DEFAULT ''`)
  if (!sessionCols.includes('project')) db.exec(`ALTER TABLE sessions ADD COLUMN project TEXT NOT NULL DEFAULT ''`)
  if (!sessionCols.includes('pc_recording_enabled')) db.exec(`ALTER TABLE sessions ADD COLUMN pc_recording_enabled INTEGER NOT NULL DEFAULT 0`)
  if (!sessionCols.includes('pc_video_path')) db.exec(`ALTER TABLE sessions ADD COLUMN pc_video_path TEXT`)
  if (!sessionCols.includes('ram_total_gb')) db.exec(`ALTER TABLE sessions ADD COLUMN ram_total_gb REAL`)
  if (!sessionCols.includes('graphics_device')) db.exec(`ALTER TABLE sessions ADD COLUMN graphics_device TEXT`)
  if (!sessionCols.includes('mic_audio_path')) db.exec(`ALTER TABLE sessions ADD COLUMN mic_audio_path TEXT`)
  if (!sessionCols.includes('mic_audio_duration_ms')) db.exec(`ALTER TABLE sessions ADD COLUMN mic_audio_duration_ms INTEGER`)
  if (!sessionCols.includes('mic_audio_start_offset_ms')) db.exec(`ALTER TABLE sessions ADD COLUMN mic_audio_start_offset_ms INTEGER`)
  if (!sessionCols.includes('mic_audio_source')) db.exec(`ALTER TABLE sessions ADD COLUMN mic_audio_source TEXT`)
  const sessionTable = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'`).get() as { sql?: string } | undefined
  if (sessionTable?.sql?.includes(`connection_mode IN ('usb','wifi')`)) {
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE sessions_new (
        id TEXT PRIMARY KEY,
        build_version TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT '',
        project TEXT NOT NULL DEFAULT '',
        test_note TEXT NOT NULL DEFAULT '',
        tester TEXT NOT NULL DEFAULT '',
        device_id TEXT NOT NULL,
        device_model TEXT NOT NULL,
        android_version TEXT NOT NULL,
        ram_total_gb REAL,
        graphics_device TEXT,
        connection_mode TEXT NOT NULL CHECK(connection_mode IN ('usb','wifi','pc')),
        status TEXT NOT NULL CHECK(status IN ('recording','draft')),
        duration_ms INTEGER,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        video_path TEXT,
        pc_recording_enabled INTEGER NOT NULL DEFAULT 0,
        pc_video_path TEXT,
        mic_audio_path TEXT,
        mic_audio_duration_ms INTEGER,
        mic_audio_start_offset_ms INTEGER,
        mic_audio_source TEXT
      );
      INSERT INTO sessions_new (id, build_version, platform, project, test_note, tester, device_id, device_model, android_version,
                                ram_total_gb, graphics_device, connection_mode, status, duration_ms, started_at, ended_at, video_path,
                                pc_recording_enabled, pc_video_path, mic_audio_path, mic_audio_duration_ms, mic_audio_start_offset_ms, mic_audio_source)
      SELECT id, build_version, platform, project, test_note, tester, device_id, device_model, android_version,
             ram_total_gb, graphics_device, connection_mode, status, duration_ms, started_at, ended_at, video_path,
             pc_recording_enabled, pc_video_path, mic_audio_path, mic_audio_duration_ms, mic_audio_start_offset_ms, NULL FROM sessions;
      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
    `)
    db.pragma('foreign_keys = ON')
  }

  const cols = (db.pragma(`table_info('bugs')`) as { name: string }[]).map(c => c.name)
  if (!cols.includes('pre_sec'))  db.exec(`ALTER TABLE bugs ADD COLUMN pre_sec  INTEGER NOT NULL DEFAULT 5`)
  if (!cols.includes('post_sec')) db.exec(`ALTER TABLE bugs ADD COLUMN post_sec INTEGER NOT NULL DEFAULT 5`)
  if (!cols.includes('audio_rel')) db.exec(`ALTER TABLE bugs ADD COLUMN audio_rel TEXT`)
  if (!cols.includes('audio_duration_ms')) db.exec(`ALTER TABLE bugs ADD COLUMN audio_duration_ms INTEGER`)
  if (!cols.includes('mention_user_ids')) db.exec(`ALTER TABLE bugs ADD COLUMN mention_user_ids TEXT NOT NULL DEFAULT '[]'`)
  if (!cols.includes('source')) db.exec(`ALTER TABLE bugs ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bug_annotations (
      id TEXT PRIMARY KEY,
      bug_id TEXT NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'rect',
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      points_json TEXT NOT NULL DEFAULT '[]',
      text TEXT NOT NULL DEFAULT '',
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bug_annotations_bug ON bug_annotations(bug_id, start_ms);
  `)
  const annotationCols = (db.pragma(`table_info('bug_annotations')`) as { name: string }[]).map(c => c.name)
  if (!annotationCols.includes('kind')) db.exec(`ALTER TABLE bug_annotations ADD COLUMN kind TEXT NOT NULL DEFAULT 'rect'`)
  if (!annotationCols.includes('points_json')) db.exec(`ALTER TABLE bug_annotations ADD COLUMN points_json TEXT NOT NULL DEFAULT '[]'`)
  if (!annotationCols.includes('text')) db.exec(`ALTER TABLE bug_annotations ADD COLUMN text TEXT NOT NULL DEFAULT ''`)

  const bugTable = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='bugs'`).get() as { sql?: string } | undefined
  if (!bugTable?.sql?.includes(`'note'`) || bugTable?.sql?.includes(`CHECK(severity IN`)) {
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE bugs_new (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        offset_ms INTEGER NOT NULL,
        severity TEXT NOT NULL,
        note TEXT NOT NULL,
        screenshot_rel TEXT,
        logcat_rel TEXT,
        audio_rel TEXT,
        audio_duration_ms INTEGER,
        created_at INTEGER NOT NULL,
        pre_sec INTEGER NOT NULL DEFAULT 5,
        post_sec INTEGER NOT NULL DEFAULT 5,
        mention_user_ids TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT 'manual'
      );
      INSERT INTO bugs_new (id, session_id, offset_ms, severity, note, screenshot_rel, logcat_rel, audio_rel, audio_duration_ms, created_at, pre_sec, post_sec, mention_user_ids, source)
      SELECT id, session_id, offset_ms, severity, note, screenshot_rel, logcat_rel, audio_rel, audio_duration_ms, created_at, pre_sec, post_sec, mention_user_ids, source FROM bugs;
      DROP TABLE bugs;
      ALTER TABLE bugs_new RENAME TO bugs;
      CREATE INDEX IF NOT EXISTS idx_bugs_session_offset ON bugs(session_id, offset_ms);
    `)
    db.pragma('foreign_keys = ON')
  }
}

export function openDb(file: string) {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  migrate(db)

  const insertSessionStmt = db.prepare(`
    INSERT INTO sessions (id, build_version, platform, project, test_note, tester, device_id, device_model, android_version,
                          ram_total_gb, graphics_device, connection_mode, status, duration_ms, started_at, ended_at, video_path, pc_recording_enabled, pc_video_path, mic_audio_path, mic_audio_duration_ms, mic_audio_start_offset_ms, mic_audio_source)
    VALUES (@id, @buildVersion, @platform, @project, @testNote, @tester, @deviceId, @deviceModel, @androidVersion,
            @ramTotalGb, @graphicsDevice, @connectionMode, @status, @durationMs, @startedAt, @endedAt, @videoPath, @pcRecordingEnabled, @pcVideoPath, @micAudioPath, @micAudioDurationMs, @micAudioStartOffsetMs, @micAudioSource)
    ON CONFLICT(id) DO UPDATE SET
      build_version=excluded.build_version,
      platform=excluded.platform,
      project=excluded.project,
      test_note=excluded.test_note,
      tester=excluded.tester,
      device_id=excluded.device_id,
      device_model=excluded.device_model,
      android_version=excluded.android_version,
      ram_total_gb=excluded.ram_total_gb,
      graphics_device=excluded.graphics_device,
      connection_mode=excluded.connection_mode,
      status=excluded.status,
      duration_ms=excluded.duration_ms,
      started_at=excluded.started_at,
      ended_at=excluded.ended_at,
      video_path=excluded.video_path,
      pc_recording_enabled=excluded.pc_recording_enabled,
      pc_video_path=excluded.pc_video_path,
      mic_audio_path=excluded.mic_audio_path,
      mic_audio_duration_ms=excluded.mic_audio_duration_ms,
      mic_audio_start_offset_ms=excluded.mic_audio_start_offset_ms,
      mic_audio_source=excluded.mic_audio_source
  `)
  const finalizeSessionStmt = db.prepare(`
    UPDATE sessions SET status='draft', duration_ms=@durationMs, ended_at=@endedAt WHERE id=@id
  `)
  const updateSessionMetadataStmt = db.prepare(`
    UPDATE sessions SET build_version=@buildVersion, platform=@platform, project=@project, test_note=@testNote, tester=@tester WHERE id=@id
  `)
  const updateSessionPcRecordingStmt = db.prepare(`
    UPDATE sessions SET pc_recording_enabled=@pcRecordingEnabled, pc_video_path=@pcVideoPath WHERE id=@id
  `)
  const updateSessionMicRecordingStmt = db.prepare(`
    UPDATE sessions SET mic_audio_path=@micAudioPath, mic_audio_duration_ms=@micAudioDurationMs, mic_audio_start_offset_ms=@micAudioStartOffsetMs, mic_audio_source=@micAudioSource WHERE id=@id
  `)
  const updateSessionMicAudioOffsetStmt = db.prepare(`
    UPDATE sessions SET mic_audio_start_offset_ms=@micAudioStartOffsetMs WHERE id=@id
  `)
  const getSessionStmt   = db.prepare(`SELECT * FROM sessions WHERE id = ?`)
  const listSessionsStmt = db.prepare(`SELECT * FROM sessions ORDER BY started_at DESC`)
  const deleteSessionStmt= db.prepare(`DELETE FROM sessions WHERE id = ?`)

  const insertBugStmt = db.prepare(`
    INSERT INTO bugs (id, session_id, offset_ms, severity, note, screenshot_rel, logcat_rel, audio_rel, audio_duration_ms, created_at, pre_sec, post_sec, mention_user_ids, source)
    VALUES (@id, @sessionId, @offsetMs, @severity, @note, @screenshotRel, @logcatRel, @audioRel, @audioDurationMs, @createdAt, @preSec, @postSec, @mentionUserIdsJson, @source)
    ON CONFLICT(id) DO UPDATE SET
      session_id=excluded.session_id,
      offset_ms=excluded.offset_ms,
      severity=excluded.severity,
      note=excluded.note,
      screenshot_rel=excluded.screenshot_rel,
      logcat_rel=excluded.logcat_rel,
      audio_rel=excluded.audio_rel,
      audio_duration_ms=excluded.audio_duration_ms,
      created_at=excluded.created_at,
      pre_sec=excluded.pre_sec,
      post_sec=excluded.post_sec,
      mention_user_ids=excluded.mention_user_ids,
      source=excluded.source
  `)
  const updateBugStmt = db.prepare(`UPDATE bugs SET note=@note, severity=@severity, pre_sec=@preSec, post_sec=@postSec, mention_user_ids=@mentionUserIdsJson WHERE id=@id`)
  const updateBugAssetsStmt = db.prepare(`UPDATE bugs SET screenshot_rel=@screenshotRel, logcat_rel=@logcatRel WHERE id=@id`)
  const updateBugAudioStmt = db.prepare(`UPDATE bugs SET audio_rel=@audioRel, audio_duration_ms=@audioDurationMs WHERE id=@id`)
  const deleteBugStmt = db.prepare(`DELETE FROM bugs WHERE id = ?`)
  const deleteBugsForSessionStmt = db.prepare(`DELETE FROM bugs WHERE session_id = ?`)
  const deleteBugsBySourceForSessionStmt = db.prepare(`DELETE FROM bugs WHERE session_id = ? AND (source = ? OR (? = 'audio-auto' AND LTRIM(note) LIKE '[Audio]%'))`)
  const getBugStmt = db.prepare(`SELECT * FROM bugs WHERE id = ?`)
  const listBugsStmt  = db.prepare(`SELECT * FROM bugs WHERE session_id = ? ORDER BY offset_ms ASC`)
  const insertAnnotationStmt = db.prepare(`
    INSERT INTO bug_annotations (id, bug_id, kind, x, y, width, height, points_json, text, start_ms, end_ms, created_at)
    VALUES (@id, @bugId, @kind, @x, @y, @width, @height, @pointsJson, @text, @startMs, @endMs, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      bug_id=excluded.bug_id,
      kind=excluded.kind,
      x=excluded.x,
      y=excluded.y,
      width=excluded.width,
      height=excluded.height,
      points_json=excluded.points_json,
      text=excluded.text,
      start_ms=excluded.start_ms,
      end_ms=excluded.end_ms,
      created_at=excluded.created_at
  `)
  const updateAnnotationStmt = db.prepare(`
    UPDATE bug_annotations
    SET kind=@kind, x=@x, y=@y, width=@width, height=@height, points_json=@pointsJson, text=@text, start_ms=@startMs, end_ms=@endMs
    WHERE id=@id
  `)
  const getAnnotationStmt = db.prepare(`SELECT * FROM bug_annotations WHERE id = ?`)
  const listAnnotationsForBugsSql = `SELECT * FROM bug_annotations WHERE bug_id IN __BUG_IDS__ ORDER BY start_ms ASC, created_at ASC`
  const deleteAnnotationsForBugStmt = db.prepare(`DELETE FROM bug_annotations WHERE bug_id = ?`)
  const deleteAnnotationStmt = db.prepare(`DELETE FROM bug_annotations WHERE id = ?`)

  return {
    raw: db,
    insertSession(s: Session) {
      insertSessionStmt.run({
        ...s,
        platform: s.platform ?? '',
        project: s.project ?? '',
        tester: s.tester ?? '',
        ramTotalGb: s.ramTotalGb ?? null,
        graphicsDevice: s.graphicsDevice ?? null,
        pcRecordingEnabled: s.pcRecordingEnabled ? 1 : 0,
        micAudioPath: s.micAudioPath ?? null,
        micAudioDurationMs: s.micAudioDurationMs ?? null,
        micAudioStartOffsetMs: s.micAudioStartOffsetMs ?? null,
        micAudioSource: s.micAudioSource ?? null,
      })
    },
    finalizeSession(id: string, args: { durationMs: number; endedAt: number }) {
      finalizeSessionStmt.run({ id, ...args })
    },
    updateSessionMetadata(id: string, patch: { buildVersion: string; platform?: string; project?: string; testNote: string; tester: string }) {
      updateSessionMetadataStmt.run({ id, ...patch, platform: patch.platform ?? '', project: patch.project ?? '' })
    },
    updateSessionPcRecording(id: string, patch: { pcRecordingEnabled: boolean; pcVideoPath: string | null }) {
      updateSessionPcRecordingStmt.run({ id, pcRecordingEnabled: patch.pcRecordingEnabled ? 1 : 0, pcVideoPath: patch.pcVideoPath })
    },
    updateSessionMicRecording(id: string, patch: { micAudioPath: string | null; micAudioDurationMs: number | null; micAudioStartOffsetMs?: number | null; micAudioSource?: Session['micAudioSource'] }) {
      updateSessionMicRecordingStmt.run({
        id,
        ...patch,
        micAudioStartOffsetMs: patch.micAudioStartOffsetMs ?? null,
        micAudioSource: patch.micAudioSource ?? null,
      })
    },
    updateSessionMicAudioOffset(id: string, startOffsetMs: number) {
      updateSessionMicAudioOffsetStmt.run({ id, micAudioStartOffsetMs: Math.round(startOffsetMs) })
    },
    getSession(id: string): Session | undefined {
      const r = getSessionStmt.get(id) as any
      return r ? rowToSession(r) : undefined
    },
    listSessions(): Session[] {
      return (listSessionsStmt.all() as any[]).map(rowToSession)
    },
    deleteSession(id: string) { deleteSessionStmt.run(id) },
    insertBug(b: Bug) {
      insertBugStmt.run({ ...b, source: b.source ?? 'manual', mentionUserIdsJson: JSON.stringify(b.mentionUserIds ?? []) })
      if (b.annotations) {
        deleteAnnotationsForBugStmt.run(b.id)
        for (const annotation of b.annotations) insertAnnotationStmt.run(serializeAnnotation(annotation))
      }
    },
    updateBug(id: string, patch: { note: string; severity: BugSeverity; preSec: number; postSec: number; mentionUserIds?: string[] }) {
      const currentRow = getBugStmt.get(id) as any
      if (!currentRow) return
      const current = rowToBug(currentRow)
      updateBugStmt.run({ id, ...patch, mentionUserIdsJson: JSON.stringify(patch.mentionUserIds ?? current.mentionUserIds) })
    },
    updateBugAssets(id: string, args: { screenshotRel: string | null; logcatRel: string | null }) {
      updateBugAssetsStmt.run({ id, ...args })
    },
    updateBugAudio(id: string, args: { audioRel: string | null; audioDurationMs: number | null }) {
      updateBugAudioStmt.run({ id, ...args })
    },
    insertAnnotation(annotation: BugAnnotation) {
      insertAnnotationStmt.run(serializeAnnotation(annotation))
    },
    updateAnnotation(id: string, patch: Partial<Pick<BugAnnotation, 'kind' | 'x' | 'y' | 'width' | 'height' | 'points' | 'text' | 'startMs' | 'endMs'>>) {
      const currentRow = getAnnotationStmt.get(id) as any
      if (!currentRow) return
      const current = rowToAnnotation(currentRow)
      updateAnnotationStmt.run(serializeAnnotation({ ...current, ...patch, id }))
    },
    deleteAnnotation(id: string) { deleteAnnotationStmt.run(id) },
    deleteBug(id: string) { deleteBugStmt.run(id) },
    deleteBugsForSession(sessionId: string) { deleteBugsForSessionStmt.run(sessionId) },
    deleteBugsBySourceForSession(sessionId: string, source: NonNullable<Bug['source']>): number {
      return Number(deleteBugsBySourceForSessionStmt.run(sessionId, source, source).changes ?? 0)
    },
    listBugs(sessionId: string): Bug[] {
      const bugs = (listBugsStmt.all(sessionId) as any[]).map(rowToBug)
      if (bugs.length === 0) return bugs
      const placeholders = bugs.map(() => '?').join(',')
      const rows = db.prepare(listAnnotationsForBugsSql.replace('__BUG_IDS__', `(${placeholders})`)).all(...bugs.map(b => b.id)) as any[]
      const annotationsByBug = new Map<string, BugAnnotation[]>()
      for (const row of rows) {
        const annotation = rowToAnnotation(row)
        annotationsByBug.set(annotation.bugId, [...(annotationsByBug.get(annotation.bugId) ?? []), annotation])
      }
      return bugs.map(bug => ({ ...bug, annotations: annotationsByBug.get(bug.id) ?? [] }))
    },
    close() { db.close() },
  }
}

export type Db = ReturnType<typeof openDb>
