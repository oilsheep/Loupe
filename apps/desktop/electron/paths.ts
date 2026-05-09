import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface AppRoots {
  configRoot: string    // settings.json + meta.sqlite live here
  sessionsRoot: string  // sessions/<id>/ live here
}

export interface Paths {
  configRoot(): string
  sessionsRoot(): string
  dbFile(): string
  settingsFile(): string
  sessionDir(sessionId: string): string
  projectFile(sessionId: string): string
  videoFile(sessionId: string): string
  pcVideoFile(sessionId: string): string
  micAudioFile(sessionId: string): string
  clicksFile(sessionId: string): string
  telemetryFile(sessionId: string): string
  screenshotsDir(sessionId: string): string
  screenshotFile(sessionId: string, bugId: string): string
  logcatDir(sessionId: string): string
  logcatFile(sessionId: string, bugId: string): string
  audioDir(sessionId: string): string
  audioFile(sessionId: string, bugId: string): string
  clipsDir(sessionId: string): string
  clipFile(sessionId: string, bugId: string): string
  ensureRoot(): void
  ensureSessionDirs(sessionId: string): void
}

export function createPaths(roots: AppRoots): Paths {
  const { configRoot, sessionsRoot } = roots
  const screenshotsDir = (id: string) => join(sessionsRoot, 'sessions', id, 'screenshots')
  const logcatDir      = (id: string) => join(sessionsRoot, 'sessions', id, 'logcat')
  const audioDir       = (id: string) => join(sessionsRoot, 'sessions', id, 'audio')
  const clipsDir       = (id: string) => join(sessionsRoot, 'sessions', id, 'clips')
  return {
    configRoot: () => configRoot,
    sessionsRoot: () => sessionsRoot,
    dbFile: () => join(configRoot, 'meta.sqlite'),
    settingsFile: () => join(configRoot, 'settings.json'),
    sessionDir: (id) => join(sessionsRoot, 'sessions', id),
    projectFile: (id) => join(sessionsRoot, 'sessions', id, `${id}.loupe`),
    videoFile: (id) => join(sessionsRoot, 'sessions', id, 'video.mp4'),
    pcVideoFile: (id) => join(sessionsRoot, 'sessions', id, 'pc-recording.webm'),
    micAudioFile: (id) => join(sessionsRoot, 'sessions', id, 'session-mic.webm'),
    clicksFile: (id) => join(sessionsRoot, 'sessions', id, 'clicks.jsonl'),
    telemetryFile: (id) => join(sessionsRoot, 'sessions', id, 'telemetry.jsonl'),
    screenshotsDir,
    screenshotFile: (id, bugId) => join(screenshotsDir(id), `${bugId}.png`),
    logcatDir,
    logcatFile: (id, bugId) => join(logcatDir(id), `${bugId}.txt`),
    audioDir,
    audioFile: (id, bugId) => join(audioDir(id), `${bugId}.webm`),
    clipsDir,
    clipFile: (id, bugId) => join(clipsDir(id), `${bugId}.mp4`),
    ensureRoot: () => {
      mkdirSync(configRoot, { recursive: true })
      mkdirSync(sessionsRoot, { recursive: true })
    },
    ensureSessionDirs: (id) => {
      mkdirSync(screenshotsDir(id), { recursive: true })
      mkdirSync(logcatDir(id),      { recursive: true })
      mkdirSync(audioDir(id),       { recursive: true })
      mkdirSync(clipsDir(id),       { recursive: true })
    },
  }
}

interface ResolveOpts {
  platform: NodeJS.Platform
  isPackaged: boolean
  userData: string
  movies: string
  exeDir: string
  devRoot: string
}

export function resolveAppRoots(opts: ResolveOpts): AppRoots {
  if (!opts.isPackaged) {
    return { configRoot: opts.devRoot, sessionsRoot: opts.devRoot }
  }
  if (opts.platform === 'darwin') {
    return { configRoot: opts.userData, sessionsRoot: join(opts.movies, 'Loupe') }
  }
  const exeRecordings = join(opts.exeDir, 'recordings')
  return { configRoot: exeRecordings, sessionsRoot: exeRecordings }
}
