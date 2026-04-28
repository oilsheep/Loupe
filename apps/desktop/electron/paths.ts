import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface Paths {
  root(): string
  dbFile(): string
  sessionDir(sessionId: string): string
  videoFile(sessionId: string): string
  screenshotsDir(sessionId: string): string
  screenshotFile(sessionId: string, bugId: string): string
  logcatDir(sessionId: string): string
  logcatFile(sessionId: string, bugId: string): string
  clipsDir(sessionId: string): string
  clipFile(sessionId: string, bugId: string): string
  ensureRoot(): void
  ensureSessionDirs(sessionId: string): void
}

export function createPaths(root: string): Paths {
  return {
    root: () => root,
    dbFile: () => join(root, 'meta.sqlite'),
    sessionDir: (id) => join(root, 'sessions', id),
    videoFile: (id) => join(root, 'sessions', id, 'video.mp4'),
    screenshotsDir: (id) => join(root, 'sessions', id, 'screenshots'),
    screenshotFile: (id, bugId) => join(root, 'sessions', id, 'screenshots', `${bugId}.png`),
    logcatDir: (id) => join(root, 'sessions', id, 'logcat'),
    logcatFile: (id, bugId) => join(root, 'sessions', id, 'logcat', `${bugId}.txt`),
    clipsDir: (id) => join(root, 'sessions', id, 'clips'),
    clipFile: (id, bugId) => join(root, 'sessions', id, 'clips', `${bugId}.mp4`),
    ensureRoot() { mkdirSync(root, { recursive: true }) },
    ensureSessionDirs(id) {
      mkdirSync(this.screenshotsDir(id), { recursive: true })
      mkdirSync(this.logcatDir(id),      { recursive: true })
      mkdirSync(this.clipsDir(id),       { recursive: true })
    },
  }
}

/** Default root: %APPDATA%/qa-tool. Resolved via Electron `app.getPath('userData')` in main.ts. */
export function defaultRoot(userDataDir: string): string {
  return join(userDataDir, 'qa-tool')
}
