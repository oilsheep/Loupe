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
  // Capture in closure so methods are safe to destructure (`const { ensureSessionDirs } = paths`).
  const screenshotsDir = (id: string) => join(root, 'sessions', id, 'screenshots')
  const logcatDir      = (id: string) => join(root, 'sessions', id, 'logcat')
  const clipsDir       = (id: string) => join(root, 'sessions', id, 'clips')
  return {
    root: () => root,
    dbFile: () => join(root, 'meta.sqlite'),
    sessionDir: (id) => join(root, 'sessions', id),
    videoFile: (id) => join(root, 'sessions', id, 'video.mp4'),
    screenshotsDir,
    screenshotFile: (id, bugId) => join(screenshotsDir(id), `${bugId}.png`),
    logcatDir,
    logcatFile: (id, bugId) => join(logcatDir(id), `${bugId}.txt`),
    clipsDir,
    clipFile: (id, bugId) => join(clipsDir(id), `${bugId}.mp4`),
    ensureRoot: () => { mkdirSync(root, { recursive: true }) },
    ensureSessionDirs: (id) => {
      mkdirSync(screenshotsDir(id), { recursive: true })
      mkdirSync(logcatDir(id),      { recursive: true })
      mkdirSync(clipsDir(id),       { recursive: true })
    },
  }
}

/** Default root: %APPDATA%/qa-tool. Resolved via Electron `app.getPath('userData')` in main.ts. */
export function defaultRoot(userDataDir: string): string {
  return join(userDataDir, 'qa-tool')
}
