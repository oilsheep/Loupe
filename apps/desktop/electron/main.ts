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

  const root = defaultRoot(app.getPath('userData'))
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

  registerIpc({ adb, manager, paths, runner, db, getWindow: () => win })

  await createWindow()

  globalShortcut.register('F8', () => emitBugMarkRequested(win))
}).catch((err) => { console.error(err); app.quit() })

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})
