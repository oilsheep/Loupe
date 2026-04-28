import { app, BrowserWindow, globalShortcut, protocol, net } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
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
  protocol.handle('loupe-file', (req) => {
    const url = new URL(req.url)
    const localPath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    return net.fetch(pathToFileURL(localPath).toString())
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

  // Bug-mark hotkey. Space is ergonomic (thumb on the spacebar while testing) but
  // intercepts every other space-keypress system-wide while registered — so the
  // BugMarkDialog must temporarily disable it via api.hotkey.setEnabled(false)
  // when its input is focused, otherwise the user can't type spaces in their note.
  const ACCELERATOR = 'Space'
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
