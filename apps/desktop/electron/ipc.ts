import { ipcMain, BrowserWindow, dialog } from 'electron'
import { extractClip, resolveBundledFfmpegPath } from './ffmpeg'
import type { Adb } from './adb'
import type { SessionManager } from './session'
import type { Paths } from './paths'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { ToolCheck } from './doctor'
import { doctor } from './doctor'

export const CHANNEL = {
  doctor:                  'app:doctor',
  deviceList:              'device:list',
  deviceConnect:           'device:connect',
  sessionStart:            'session:start',
  sessionMarkBug:          'session:markBug',
  sessionStop:             'session:stop',
  sessionDiscard:          'session:discard',
  sessionList:             'session:list',
  sessionGet:              'session:get',
  sessionResolveVideoPath: 'session:resolveVideoPath',
  bugUpdate:               'bug:update',
  bugDelete:               'bug:delete',
  bugExportClip:           'bug:exportClip',
  bugMarkRequested:        'bug:markRequested',
} as const

export interface IpcDeps {
  adb: Adb
  manager: SessionManager
  paths: Paths
  runner: IProcessRunner
  db: Db
  getWindow: () => BrowserWindow | null
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(CHANNEL.doctor, async (): Promise<ToolCheck[]> => doctor(deps.runner))

  ipcMain.handle(CHANNEL.deviceList, async () => deps.adb.listDevices())
  ipcMain.handle(CHANNEL.deviceConnect, async (_e, ip: string, port?: number) => deps.adb.connect(ip, port))

  ipcMain.handle(CHANNEL.sessionStart, async (_e, args) => deps.manager.start(args))
  ipcMain.handle(CHANNEL.sessionMarkBug, async (_e, args) => deps.manager.markBug(args))
  ipcMain.handle(CHANNEL.sessionStop, async () => deps.manager.stop())
  ipcMain.handle(CHANNEL.sessionDiscard, async (_e, id: string) => deps.manager.discard(id))
  ipcMain.handle(CHANNEL.sessionList, async () => deps.manager.listSessions())
  ipcMain.handle(CHANNEL.sessionGet, async (_e, id: string) => {
    const session = deps.manager.getSession(id)
    if (!session) return null
    return { session, bugs: deps.manager.listBugs(id) }
  })
  ipcMain.handle(CHANNEL.sessionResolveVideoPath, async (_e, id: string) => deps.paths.videoFile(id))

  ipcMain.handle(CHANNEL.bugUpdate, async (_e, id: string, patch) => deps.manager.updateBug(id, patch))
  ipcMain.handle(CHANNEL.bugDelete, async (_e, id: string) => deps.manager.deleteBug(id))

  ipcMain.handle(CHANNEL.bugExportClip, async (_e, args: { sessionId: string; bugId: string }): Promise<string | null> => {
    const session = deps.manager.getSession(args.sessionId)
    const bugs = deps.manager.listBugs(args.sessionId)
    const bug = bugs.find(b => b.id === args.bugId)
    if (!session || !bug) throw new Error('session or bug not found')

    const win = deps.getWindow()
    // Build version is QA-entered free text; sanitise to a Windows-safe filename.
    const safeBuild = (session.buildVersion || 'session').replace(/[\\/:*?"<>|]/g, '_')
    const dlgOpts = {
      title: 'Export bug clip',
      defaultPath: `bug-${bug.id.slice(0, 8)}-${safeBuild}.mp4`,
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
    }
    const saveResult = await (win ? dialog.showSaveDialog(win, dlgOpts) : dialog.showSaveDialog(dlgOpts))
    if (saveResult.canceled || !saveResult.filePath) return null

    const startMs = Math.max(0, bug.offsetMs - 5_000)
    const endMs   = Math.min(session.durationMs ?? bug.offsetMs + 10_000, bug.offsetMs + 10_000)
    await extractClip(deps.runner, resolveBundledFfmpegPath(), {
      inputPath: deps.paths.videoFile(session.id),
      outputPath: saveResult.filePath,
      startMs, endMs,
    })
    return saveResult.filePath
  })
}

export function emitBugMarkRequested(win: BrowserWindow | null) {
  win?.webContents.send(CHANNEL.bugMarkRequested)
}
