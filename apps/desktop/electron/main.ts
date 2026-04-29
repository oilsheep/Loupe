import { app, BrowserWindow, desktopCapturer, globalShortcut, protocol, session as electronSession } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as fs from 'node:fs'
import { RealProcessRunner } from './process-runner'
import { Adb } from './adb'
import { Scrcpy } from './scrcpy'
import { LogcatBuffer } from './logcat'
import { SessionManager } from './session'
import { openDb } from './db'
import { createPaths, defaultRoot } from './paths'
import { registerIpc, emitBugMarkRequested } from './ipc'
import { DEFAULT_HOTKEYS, SettingsStore } from './settings'
import type { HotkeySettings } from '@shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
let win: BrowserWindow | null = null

protocol.registerSchemesAsPrivileged([
  { scheme: 'loupe-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
])

function parseRangeHeader(range: string | null, total: number): { start: number; end: number } | null {
  if (!range) return null
  const m = range.trim().match(/^bytes=(\d*)-(\d*)$/)
  if (!m) return null

  const [, rawStart, rawEnd] = m
  if (!rawStart && !rawEnd) return null

  let start: number
  let end: number

  if (!rawStart) {
    const suffixLength = Number(rawEnd)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
    start = Math.max(0, total - suffixLength)
    end = total - 1
  } else {
    start = Number(rawStart)
    end = rawEnd ? Number(rawEnd) : total - 1
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= total || end < start) return null
  return { start, end: Math.min(end, total - 1) }
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronSession.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    callback({ video: sources[0], audio: 'loopback' } as any)
  }, { useSystemPicker: true })

  // Custom file protocol that serves session assets WITH HTTP Range support.
  // HTML5 <video> issues range requests to fetch metadata + seek; without proper
  // 206 Partial Content responses the canvas stays gray. We use buffer-based
  // reads (rather than streams) for max compatibility with Electron's Response.
  const MIME: Record<string, string> = {
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    txt: 'text/plain; charset=utf-8',
  }
  protocol.handle('loupe-file', async (req) => {
    const url = new URL(req.url)
    const localPath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    let stat
    try { stat = await fs.promises.stat(localPath) }
    catch (e) {
      console.warn(`[loupe-file] not found: ${localPath}`, e)
      return new Response('Not found', { status: 404 })
    }
    const total = stat.size
    const ext = (localPath.split('.').pop() ?? '').toLowerCase()
    const contentType = MIME[ext] ?? 'application/octet-stream'

    const range = req.headers.get('range')?.trim() ?? null
    if (range) {
      const parsedRange = parseRangeHeader(range, total)
      if (!parsedRange) {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${total}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store',
          },
        })
      }
      const { start, end } = parsedRange
      const length = end - start + 1
      const fh = await fs.promises.open(localPath, 'r')
      try {
        const buf = Buffer.alloc(length)
        await fh.read(buf, 0, length, start)
        return new Response(buf, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(length),
            'Cache-Control': 'no-store',
          },
        })
      } finally { await fh.close() }
    }

    // Whole-file response. Buffer is fine for typical QA recordings (<500MB).
    const buf = await fs.promises.readFile(localPath)
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
        'Cache-Control': 'no-store',
      },
    })
  })

  // Recordings always live next to the app — never in %APPDATA% — so QA can browse
  // them as plain files without hunting for hidden user-data folders.
  //   Dev (electron-vite):  <repo>/recordings/        (__dirname = <repo>/apps/desktop/out/main)
  //   Packaged (.exe):      <install-dir>/recordings/ (next to the exe)
  // `defaultRoot(userDataDir)` is retained as a fallback helper but no longer used by main.
  const root = app.isPackaged
    ? join(dirname(app.getPath('exe')), 'recordings')
    : join(__dirname, '..', '..', '..', '..', 'recordings')
  console.log(`Loupe: session data root = ${root}`)
  const paths = createPaths(root); paths.ensureRoot()
  const settings = new SettingsStore(paths.settingsFile(), {
    exportRoot: join(app.getPath('videos'), 'Loupe'),
    hotkeys: DEFAULT_HOTKEYS,
    slack: { botToken: '', channelId: '' },
  })
  const db = openDb(paths.dbFile())
  const runner = new RealProcessRunner()
  const adb = new Adb(runner)
  const scrcpy = new Scrcpy(runner)

  // logcat is recreated per session because it binds to a deviceId.
  // For Phase 1, hot-swap a fresh LogcatBuffer at session start so we can target the chosen device.
  const logcatHolder = new LogcatBuffer(runner, '__placeholder__')

  const manager = new SessionManager({
    db, paths, adb, scrcpy, logcat: logcatHolder, runner,
    capturePcThumbnail: async (sourceId, outPath) => {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 480, height: 270 },
      })
      const source = sources.find(s => s.id === sourceId)
      if (!source || source.thumbnail.isEmpty()) throw new Error('PC capture source thumbnail is not available')
      await fs.promises.writeFile(outPath, source.thumbnail.toPNG())
    },
  })
  // Override manager.start to swap a fresh logcat for the chosen deviceId.
  const origStart = manager.start.bind(manager)
  manager.start = async (args) => {
    if (args.connectionMode !== 'pc') {
      ;(manager as any).deps.logcat = new LogcatBuffer(runner, args.deviceId)
    }
    return origStart(args)
  }

  // Prefer function keys or modifier chords for global marker hotkeys. Plain
  // printable keys would be intercepted system-wide while QA is typing elsewhere.
  let hotkeys: HotkeySettings = settings.get().hotkeys
  const registeredHotkeys = new Set<string>()
  let hotkeyEnabled = true
  function applyHotkey() {
    for (const key of registeredHotkeys) {
      if (globalShortcut.isRegistered(key)) {
        globalShortcut.unregister(key)
      }
    }
    registeredHotkeys.clear()
    if (!hotkeyEnabled) return

    for (const [severity, rawKey] of Object.entries(hotkeys)) {
      const key = rawKey.trim()
      if (!key || registeredHotkeys.has(key)) continue
      try {
        if (globalShortcut.register(key, () => emitBugMarkRequested(win, severity as any))) {
          registeredHotkeys.add(key)
        } else {
          console.warn(`Loupe: ${key} hotkey could not be registered (already taken by another app)`)
        }
      } catch (err) {
        console.warn(`Loupe: ${key} is not a valid Electron accelerator`, err)
      }
    }
  }
  function setHotkeyEnabled(enabled: boolean) {
    hotkeyEnabled = enabled
    applyHotkey()
  }
  function setHotkeys(next: HotkeySettings) {
    hotkeys = next
    applyHotkey()
  }

  registerIpc({ adb, manager, paths, runner, db, settings, getWindow: () => win, setHotkeyEnabled, setHotkeys })

  await createWindow()
  applyHotkey()
}).catch((err) => { console.error(err); app.quit() })

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})
