import { app, BrowserWindow, globalShortcut, protocol } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as fs from 'node:fs'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { RealProcessRunner } from './process-runner'
import { Adb } from './adb'
import { Scrcpy } from './scrcpy'
import { LogcatBuffer } from './logcat'
import { SessionManager } from './session'
import { openDb } from './db'
import { createPaths, defaultRoot } from './paths'
import { registerIpc, emitBugMarkRequested } from './ipc'

const __dirname = dirname(fileURLToPath(import.meta.url))
let win: BrowserWindow | null = null

protocol.registerSchemesAsPrivileged([
  { scheme: 'loupe-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
])

async function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Custom file protocol that serves session assets WITH HTTP Range support.
  // HTML5 <video> issues range requests to fetch metadata + seek; if we just
  // return the whole file every time (which `net.fetch(file://...)` does),
  // the player gets confused and the canvas stays gray.
  protocol.handle('loupe-file', async (req) => {
    const url = new URL(req.url)
    const localPath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    let stat
    try { stat = await fs.promises.stat(localPath) }
    catch { return new Response('Not found', { status: 404 }) }
    const total = stat.size
    const ext = localPath.toLowerCase().split('.').pop() ?? ''
    const mime: Record<string, string> = {
      mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
      txt: 'text/plain; charset=utf-8',
    }
    const contentType = mime[ext] ?? 'application/octet-stream'
    const range = req.headers.get('range')
    const m = range?.match(/^bytes=(\d+)-(\d*)$/)
    if (m) {
      const start = Math.min(parseInt(m[1], 10), total - 1)
      const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1
      const stream = createReadStream(localPath, { start, end })
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
        },
      })
    }
    const stream = createReadStream(localPath)
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
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
  const db = openDb(paths.dbFile())
  const runner = new RealProcessRunner()
  const adb = new Adb(runner)
  const scrcpy = new Scrcpy(runner)

  // logcat is recreated per session because it binds to a deviceId.
  // For Phase 1, hot-swap a fresh LogcatBuffer at session start so we can target the chosen device.
  const logcatHolder = new LogcatBuffer(runner, '__placeholder__')

  const manager = new SessionManager({
    db, paths, adb, scrcpy, logcat: logcatHolder, runner,
  })
  // Override manager.start to swap a fresh logcat for the chosen deviceId.
  const origStart = manager.start.bind(manager)
  manager.start = async (args) => {
    ;(manager as any).deps.logcat = new LogcatBuffer(runner, args.deviceId)
    return origStart(args)
  }

  // Bug-mark hotkey. F8 is a function key with low collision rate. We tried Space
  // first but it intercepted every space-keypress system-wide (typing in any
  // text field anywhere broke). The setHotkeyEnabled IPC plumbing below is kept
  // for future use (e.g. user-configurable rebinding to a printable key).
  const ACCELERATOR = 'F8'
  let hotkeyEnabled = true
  function applyHotkey() {
    const isReg = globalShortcut.isRegistered(ACCELERATOR)
    if (hotkeyEnabled && !isReg) {
      if (!globalShortcut.register(ACCELERATOR, () => emitBugMarkRequested(win))) {
        console.warn(`Loupe: ${ACCELERATOR} hotkey could not be registered (already taken by another app)`)
      }
    } else if (!hotkeyEnabled && isReg) {
      globalShortcut.unregister(ACCELERATOR)
    }
  }
  function setHotkeyEnabled(enabled: boolean) {
    hotkeyEnabled = enabled
    applyHotkey()
  }

  registerIpc({ adb, manager, paths, runner, db, getWindow: () => win, setHotkeyEnabled })

  await createWindow()
  applyHotkey()
}).catch((err) => { console.error(err); app.quit() })

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})
