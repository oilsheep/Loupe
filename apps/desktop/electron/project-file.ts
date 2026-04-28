import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Bug, Session } from '@shared/types'

export interface LoupeProjectFile {
  version: 1
  savedAt: number
  session: Session
  bugs: Bug[]
}

export function writeProjectFile(filePath: string, session: Session, bugs: Bug[], now = Date.now()): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const payload: LoupeProjectFile = {
    version: 1,
    savedAt: now,
    session,
    bugs,
  }
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export function readProjectFile(filePath: string): LoupeProjectFile {
  const payload = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<LoupeProjectFile>
  if (payload.version !== 1) throw new Error('unsupported Loupe project version')
  if (!payload.session?.id || !Array.isArray(payload.bugs)) throw new Error('invalid Loupe project file')
  return payload as LoupeProjectFile
}

export function projectVideoExists(session: Session): boolean {
  return Boolean(session.videoPath && existsSync(session.videoPath))
}
