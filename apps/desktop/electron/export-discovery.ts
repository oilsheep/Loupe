import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Bug, Session, SeveritySettings, SessionExportInfo, MarkerFieldPreset } from '@shared/types'
import type { ExportManifest } from './export-manifest'
import { severityStyle, effectiveCustomFields } from './export-manifest'
import { computeExportStatus, type CurrentMarkerState } from './export-status'
import type { PublishStateFile } from './publish-state'

export type { SessionExportInfo }

function hashFileSha256(absPath: string | null): string | null {
  if (!absPath || !existsSync(absPath)) return null
  try { return createHash('sha256').update(readFileSync(absPath)).digest('hex') } catch { return null }
}

// Relative paths (posix-style, matching manifest) of every non-empty file under dir.
function listNonEmptyFiles(dir: string): Set<string> {
  const out = new Set<string>()
  const walk = (cur: string) => {
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const abs = join(cur, entry.name)
      if (entry.isDirectory()) walk(abs)
      else { try { if (statSync(abs).size > 0) out.add(relative(dir, abs).split(sep).join('/')) } catch { /* skip */ } }
    }
  }
  walk(dir)
  return out
}

function readManifest(folderPath: string): ExportManifest | null {
  const p = join(folderPath, 'export-manifest.json')
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) as ExportManifest } catch { return null }
}

function readPublishState(folderPath: string): PublishStateFile | null {
  const p = join(folderPath, 'publish-state.json')
  if (!existsSync(p)) return null
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as PublishStateFile
    return parsed?.version === 1 && parsed.targets ? parsed : null
  } catch { return null }
}

export function listSessionExports(args: {
  exportRoot: string
  sessionDir: string
  session: Session
  bugs: Bug[]
  severities: SeveritySettings
  currentQuality: { preset: string; crf: number }
  markerFieldPresets?: MarkerFieldPreset[]
}): SessionExportInfo[] {
  const { exportRoot, sessionDir, session, bugs, severities, currentQuality } = args
  if (!exportRoot || !existsSync(exportRoot)) return []

  const current: CurrentMarkerState[] = bugs.map(bug => {
    const style = severityStyle(severities, bug.severity)
    return {
      bug,
      screenshotHash: hashFileSha256(bug.screenshotRel ? join(sessionDir, bug.screenshotRel) : null),
      severityLabel: style.label,
      severityColor: style.color,
      effectiveCustomFields: effectiveCustomFields(bug, args.markerFieldPresets),
    }
  })
  const currentSession = {
    buildVersion: session.buildVersion, tester: session.tester, deviceModel: session.deviceModel,
    platform: session.platform, project: session.project, reportTitle: session.reportTitle,
  }

  const infos: SessionExportInfo[] = []
  for (const entry of readdirSync(exportRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const folderPath = join(exportRoot, entry.name)
    const manifest = readManifest(folderPath)
    if (!manifest || manifest.session?.id !== session.id) continue
    const status = computeExportStatus({ manifest, current, currentQuality, currentSession, folderFiles: listNonEmptyFiles(folderPath) })
    infos.push({
      folderPath, folderName: entry.name,
      createdAt: manifest.createdAt, markerCount: manifest.markers?.length ?? 0,
      status, publishState: readPublishState(folderPath),
    })
  }
  // newest first by createdAt string (ISO sorts lexicographically)
  return infos.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}
