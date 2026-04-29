import { ipcMain, BrowserWindow, desktopCapturer, dialog, screen, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Writable, Readable } from 'node:stream'
import { clampClipWindow, extractClip, extractContactSheet, resolveBundledFfmpegPath } from './ffmpeg'
import type { Adb } from './adb'
import type { SessionManager } from './session'
import type { Paths } from './paths'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { ToolCheck } from './doctor'
import type { HotkeySettings, PcCaptureSource, Session } from '@shared/types'
import { doctor } from './doctor'
import { readProjectFile, writeProjectFile } from './project-file'
import type { SettingsStore } from './settings'

export const CHANNEL = {
  doctor:                  'app:doctor',
  showItemInFolder:        'app:showItemInFolder',
  openPath:                'app:openPath',
  getPrimaryScreenSource:  'app:getPrimaryScreenSource',
  listPcCaptureSources:   'app:listPcCaptureSources',
  showPcCaptureFrame:     'app:showPcCaptureFrame',
  hidePcCaptureFrame:     'app:hidePcCaptureFrame',
  deviceList:              'device:list',
  deviceConnect:           'device:connect',
  deviceMdnsScan:          'device:mdnsScan',
  devicePair:              'device:pair',
  deviceGetUserName:       'device:getUserName',
  sessionStart:            'session:start',
  sessionMarkBug:          'session:markBug',
  sessionStop:             'session:stop',
  sessionDiscard:          'session:discard',
  sessionList:             'session:list',
  sessionGet:              'session:get',
  sessionOpenProject:      'session:openProject',
  sessionUpdateMetadata:   'session:updateMetadata',
  sessionSavePcRecording:  'session:savePcRecording',
  sessionResolveAssetPath: 'session:resolveAssetPath',
  bugUpdate:               'bug:update',
  bugAddMarker:            'bug:addMarker',
  bugDelete:               'bug:delete',
  bugExportClip:           'bug:exportClip',
  bugExportClips:          'bug:exportClips',
  bugSaveAudio:            'bug:saveAudio',
  bugMarkRequested:        'bug:markRequested',
  hotkeySetEnabled:        'hotkey:setEnabled',
  settingsGet:             'settings:get',
  settingsSetExportRoot:   'settings:setExportRoot',
  settingsSetHotkeys:      'settings:setHotkeys',
  settingsChooseExportRoot:'settings:chooseExportRoot',
} as const

let pcCaptureFrame: BrowserWindow | null = null
let pcCaptureFrameToken = 0
let pcRecordingProcess: ChildProcessByStdio<Writable, null, Readable> | null = null
let pcRecordingStderr = ''

export interface IpcDeps {
  adb: Adb
  manager: SessionManager
  paths: Paths
  runner: IProcessRunner
  db: Db
  settings: SettingsStore
  getWindow: () => BrowserWindow | null
  setHotkeyEnabled: (enabled: boolean) => void
  setHotkeys: (hotkeys: HotkeySettings) => void
}

function sessionVideoInputPath(session: { id: string; videoPath: string | null; pcVideoPath: string | null; connectionMode?: string }, paths: Paths): string {
  if (session.connectionMode === 'pc' && session.pcVideoPath) return session.pcVideoPath
  return session.videoPath ?? paths.videoFile(session.id)
}

function safeFilePart(value: string): string {
  return (value || 'session')
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 80) || 'session'
}

function exportDirForSession(root: string, session: Session): string {
  const stamp = new Date(session.startedAt).toISOString().replace(/[:.]/g, '-')
  return join(root, `${stamp}_${safeFilePart(session.buildVersion)}`)
}

function localDatePart(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

function exportBaseName(session: Session, bug: { id: string; note: string; createdAt: number }): string {
  const note = safeFilePart(bug.note || 'marker')
  const build = safeFilePart(session.buildVersion || 'build')
  return `${note}_${build}_${localDatePart(bug.createdAt)}_${bug.id.slice(0, 8)}`
}

function readClickLog(filePath: string): { t: number; x: number; y: number }[] {
  if (!existsSync(filePath)) return []
  const clicks: { t: number; x: number; y: number }[] = []
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const raw = JSON.parse(trimmed) as { t?: unknown; x?: unknown; y?: unknown }
      if (typeof raw.t === 'number' && typeof raw.x === 'number' && typeof raw.y === 'number') {
        clicks.push({ t: raw.t, x: raw.x, y: raw.y })
      }
    } catch {
      // Ignore partial lines if the click recorder was stopped while writing.
    }
  }
  return clicks
}

function dockRecordingPanel(win: BrowserWindow | null): void {
  if (!win) return
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const width = Math.min(460, Math.max(380, area.width))
  win.setBounds({
    x: area.x + area.width - width,
    y: area.y,
    width,
    height: area.height,
  })
}

function restoreReviewWindow(win: BrowserWindow | null): void {
  if (!win) return
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const width = Math.min(1280, area.width)
  const height = Math.min(820, area.height)
  win.setBounds({
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  })
}

async function getVideoSize(runner: IProcessRunner, inputPath: string): Promise<{ width: number; height: number } | null> {
  const ffmpegPath = resolveBundledFfmpegPath()
  const ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
  const r = await runner.run(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=s=x:p=0',
    inputPath,
  ]).catch(() => null)
  if (r && r.code === 0) {
    const [w, h] = r.stdout.trim().split('x').map(Number)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h }
  }

  const info = await runner.run(ffmpegPath, ['-hide_banner', '-i', inputPath]).catch(() => null)
  const text = `${info?.stdout ?? ''}\n${info?.stderr ?? ''}`
  const matches = [...text.matchAll(/Video:.*?(\d{2,5})x(\d{2,5})/g)]
  const last = matches.at(-1)
  if (!last) return null
  const width = Number(last[1])
  const height = Number(last[2])
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null
}

async function contactSheetTileSize(runner: IProcessRunner, inputPath: string): Promise<{ tileWidth: number; tileHeight: number | null }> {
  const size = await getVideoSize(runner, inputPath)
  if (size && size.width >= size.height) return { tileWidth: 480, tileHeight: null }
  return { tileWidth: 240, tileHeight: 426 }
}

async function listPcCaptureSources(): Promise<PcCaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 1, height: 1 },
  })
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    type: source.id.startsWith('screen:') ? 'screen' : 'window',
    displayId: source.display_id || undefined,
  }))
}

async function hidePcCaptureFrame(): Promise<void> {
  pcCaptureFrameToken += 1
  const frame = pcCaptureFrame
  pcCaptureFrame = null
  if (!frame || frame.isDestroyed()) return
  await new Promise<void>((resolve) => {
    frame.once('closed', resolve)
    frame.close()
  })
}

function even(n: number): number {
  const floored = Math.max(2, Math.floor(n))
  return floored % 2 === 0 ? floored : floored - 1
}

function displayPhysicalBounds(display: Electron.Display): Electron.Rectangle {
  if (process.platform !== 'win32') return display.bounds
  return screen.dipToScreenRect(null, display.bounds)
}

function virtualPhysicalBounds(): Electron.Rectangle {
  const rects = screen.getAllDisplays().map(displayPhysicalBounds)
  const left = Math.min(...rects.map(r => r.x))
  const top = Math.min(...rects.map(r => r.y))
  const right = Math.max(...rects.map(r => r.x + r.width))
  const bottom = Math.max(...rects.map(r => r.y + r.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function clampToVirtualDesktop(rect: Electron.Rectangle): Electron.Rectangle {
  const virtual = virtualPhysicalBounds()
  return clampRectToBounds(rect, virtual)
}

function clampRectToBounds(rect: Electron.Rectangle, bounds: Electron.Rectangle): Electron.Rectangle {
  const x = Math.max(bounds.x, Math.floor(rect.x))
  const y = Math.max(bounds.y, Math.floor(rect.y))
  const right = Math.min(bounds.x + bounds.width, Math.floor(rect.x + rect.width))
  const bottom = Math.min(bounds.y + bounds.height, Math.floor(rect.y + rect.height))
  return {
    x,
    y,
    width: even(right - x),
    height: even(bottom - y),
  }
}

function parseGdigrabWindowArea(stderr: string): Electron.Rectangle | null {
  const match = stderr.match(/window area \((-?\d+),(-?\d+)\),\((-?\d+),(-?\d+)\)/i)
  if (!match) return null
  const [, x1, y1, x2, y2] = match
  const left = Number(x1)
  const top = Number(y1)
  const right = Number(x2)
  const bottom = Number(y2)
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function gdigrabWindowInput(source: PcCaptureSource): string {
  const match = source.id.match(/^window:(\d+):/)
  const hwnd = match ? Number(match[1]) : NaN
  if (Number.isFinite(hwnd) && hwnd > 0) return `hwnd=0x${hwnd.toString(16)}`
  return `title=${source.name}`
}

async function startPcFfmpegRecording(sourceId: string, outputPath: string): Promise<void> {
  if (pcRecordingProcess) throw new Error('PC recording is already running')

  const sources = await listPcCaptureSources()
  const source = sources.find(s => s.id === sourceId)
  if (!source) throw new Error('Selected PC capture source is no longer available.')
  const display = source.type === 'screen'
    ? (source.displayId
        ? screen.getAllDisplays().find(d => String(d.id) === source.displayId)
        : screen.getPrimaryDisplay())
    : null
  if (source.type === 'screen' && !display) throw new Error('Selected display is no longer available.')

  function buildArgs(boundsOverride?: Electron.Rectangle): string[] {
    const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '1']
    if (source!.type === 'screen') {
      const rawBounds = displayPhysicalBounds(display!)
      const physicalBounds = boundsOverride
        ? clampRectToBounds(rawBounds, boundsOverride)
        : clampToVirtualDesktop(rawBounds)
      args.push(
        '-offset_x', String(physicalBounds.x),
        '-offset_y', String(physicalBounds.y),
        '-video_size', `${physicalBounds.width}x${physicalBounds.height}`,
        '-i', 'desktop',
      )
    } else {
      args.push('-i', gdigrabWindowInput(source!))
    }

    args.push(
      '-c:v', 'libvpx-vp9',
      '-deadline', 'realtime',
      '-cpu-used', '8',
      '-b:v', '4M',
      '-pix_fmt', 'yuv420p',
      outputPath,
    )
    return args
  }

  async function spawnAndWait(args: string[]): Promise<void> {
    pcRecordingStderr = ''
    const proc = spawn(resolveBundledFfmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'] })
    pcRecordingProcess = proc
    proc.stderr.on('data', d => { pcRecordingStderr += d.toString() })
    proc.once('exit', () => {
      if (pcRecordingProcess === proc) pcRecordingProcess = null
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        proc.off('exit', onExit)
        resolve()
      }, 800)
      const onExit = (code: number | null) => {
        clearTimeout(timer)
        if (pcRecordingProcess === proc) pcRecordingProcess = null
        reject(new Error(`PC recording failed to start (${code ?? 'unknown'}): ${pcRecordingStderr.trim()}`))
      }
      proc.once('exit', onExit)
      proc.once('error', err => {
        clearTimeout(timer)
        proc.off('exit', onExit)
        if (pcRecordingProcess === proc) pcRecordingProcess = null
        reject(err)
      })
    })
  }

  try {
    await spawnAndWait(buildArgs())
  } catch (err) {
    const gdigrabBounds = source.type === 'screen' ? parseGdigrabWindowArea(pcRecordingStderr) : null
    if (!gdigrabBounds) throw err
    await spawnAndWait(buildArgs(gdigrabBounds))
  }
}

async function stopPcFfmpegRecording(): Promise<void> {
  const proc = pcRecordingProcess
  if (!proc) return
  pcRecordingProcess = null
  await new Promise<void>((resolve) => {
    const hardKill = setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL')
      resolve()
    }, 5000)
    proc.once('close', () => {
      clearTimeout(hardKill)
      resolve()
    })
    try {
      proc.stdin.write('q')
      proc.stdin.end()
    } catch {
      proc.kill()
    }
  })
}

async function showPcCaptureFrame(sourceId: string, color: 'green' | 'red' = 'red', displayId?: string): Promise<boolean> {
  const token = pcCaptureFrameToken + 1
  await hidePcCaptureFrame()
  pcCaptureFrameToken = token
  if (!sourceId.startsWith('screen:')) return false

  const resolvedDisplayId = displayId ?? sourceId.match(/^screen:(\d+):/)?.[1]
  const display = resolvedDisplayId
    ? screen.getAllDisplays().find(d => String(d.id) === resolvedDisplayId)
    : screen.getPrimaryDisplay()
  if (!display) return false

  if (pcCaptureFrameToken !== token) return false
  const frame = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { sandbox: true },
  })
  pcCaptureFrame = frame
  frame.setIgnoreMouseEvents(true)
  frame.setAlwaysOnTop(true, 'screen-saver')
  const borderColor = color === 'green' ? '#22c55e' : '#ff2d2d'
  const inset = 4
  await frame.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html>
      <body style="margin:0;overflow:hidden;background:transparent;">
        <div style="position:fixed;inset:${inset}px;border:2px solid ${borderColor};box-sizing:border-box;"></div>
      </body>
    </html>
  `)}`)
  if (pcCaptureFrameToken !== token) {
    if (!frame.isDestroyed()) frame.close()
    return false
  }
  return true
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(CHANNEL.doctor, async (): Promise<ToolCheck[]> => doctor(deps.runner))
  ipcMain.handle(CHANNEL.showItemInFolder, async (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle(CHANNEL.openPath, async (_e, path: string) => {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
  ipcMain.handle(CHANNEL.getPrimaryScreenSource, async (): Promise<{ id: string; name: string } | null> => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    const primaryDisplayId = String(screen.getPrimaryDisplay().id)
    const source = sources.find(s => s.display_id === primaryDisplayId) ?? sources[0]
    return source ? { id: source.id, name: source.name } : null
  })
  ipcMain.handle(CHANNEL.listPcCaptureSources, async () => listPcCaptureSources())
  ipcMain.handle(CHANNEL.showPcCaptureFrame, async (_e, sourceId: string, color?: 'green' | 'red', displayId?: string) => showPcCaptureFrame(sourceId, color, displayId))
  ipcMain.handle(CHANNEL.hidePcCaptureFrame, async () => hidePcCaptureFrame())

  ipcMain.handle(CHANNEL.deviceList, async () => deps.adb.listDevices())
  ipcMain.handle(CHANNEL.deviceConnect, async (_e, ip: string, port?: number) => deps.adb.connect(ip, port))
  ipcMain.handle(CHANNEL.deviceMdnsScan, async () => deps.adb.mdnsServices())
  ipcMain.handle(CHANNEL.devicePair, async (_e, args: { ipPort: string; code: string }) => deps.adb.pair(args.ipPort, args.code))
  ipcMain.handle(CHANNEL.deviceGetUserName, async (_e, id: string) => deps.adb.getUserDeviceName(id))

  ipcMain.handle(CHANNEL.sessionStart, async (_e, args) => {
    const session = await deps.manager.start(args)
    if (session.connectionMode === 'pc') {
      const outputPath = deps.paths.pcVideoFile(session.id)
      try {
        await showPcCaptureFrame(args.deviceId, 'red').catch(() => false)
        await startPcFfmpegRecording(args.deviceId, outputPath)
        deps.db.updateSessionPcRecording(session.id, { pcRecordingEnabled: true, pcVideoPath: outputPath })
        deps.manager.persistProject(session.id)
      } catch (err) {
        await hidePcCaptureFrame()
        await stopPcFfmpegRecording().catch(() => {})
        await deps.manager.discard(session.id).catch(() => {})
        throw err
      }
    }
    dockRecordingPanel(deps.getWindow())
    return session
  })
  ipcMain.handle(CHANNEL.sessionMarkBug, async (_e, args) => deps.manager.markBug(args))
  ipcMain.handle(CHANNEL.sessionStop, async () => {
    await stopPcFfmpegRecording()
    await hidePcCaptureFrame()
    const session = await deps.manager.stop()
    restoreReviewWindow(deps.getWindow())
    return session
  })
  ipcMain.handle(CHANNEL.sessionDiscard, async (_e, id: string) => {
    await stopPcFfmpegRecording()
    await hidePcCaptureFrame()
    return deps.manager.discard(id)
  })
  ipcMain.handle(CHANNEL.sessionList, async () => deps.manager.listSessions())
  ipcMain.handle(CHANNEL.sessionGet, async (_e, id: string) => {
    const session = deps.manager.getSession(id)
    if (!session) return null
    await deps.manager.repairBrokenThumbnails(id)
    return { session, bugs: deps.manager.listBugs(id) }
  })
  ipcMain.handle(CHANNEL.sessionUpdateMetadata, async (_e, id: string, patch: { testNote: string; tester: string }) => {
    deps.manager.updateSessionMetadata(id, patch)
  })
  ipcMain.handle(CHANNEL.sessionSavePcRecording, async (_e, args: { sessionId: string; base64: string; mimeType: string; durationMs: number }): Promise<string> => {
    const bytes = Buffer.from(args.base64, 'base64')
    return deps.manager.savePcRecording(args.sessionId, bytes)
  })
  ipcMain.handle(CHANNEL.sessionOpenProject, async (): Promise<Session | null> => {
    const win = deps.getWindow()
    const pick = await (win
      ? dialog.showOpenDialog(win, { title: 'Open Loupe session', properties: ['openFile'], filters: [{ name: 'Loupe session', extensions: ['loupe'] }] })
      : dialog.showOpenDialog({ title: 'Open Loupe session', properties: ['openFile'], filters: [{ name: 'Loupe session', extensions: ['loupe'] }] }))
    if (pick.canceled || pick.filePaths.length === 0) return null

    const project = readProjectFile(pick.filePaths[0])
    let session: Session = {
      ...project.session,
      tester: project.session.tester ?? '',
      videoPath: project.session.videoPath ?? null,
      pcRecordingEnabled: project.session.pcRecordingEnabled ?? false,
      pcVideoPath: project.session.pcVideoPath ?? null,
    }
    const currentVideoPath = session.connectionMode === 'pc' ? session.pcVideoPath : session.videoPath
    if (!currentVideoPath || !existsSync(currentVideoPath)) {
      const message = currentVideoPath
        ? `The recorded video could not be found:\n${currentVideoPath}\n\nChoose the video file to relink this session.`
        : 'This session does not have a recorded video path. Choose the video file to relink it.'
      const response = await (win
        ? dialog.showMessageBox(win, { type: 'warning', buttons: ['Locate video', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Video missing', message })
        : dialog.showMessageBox({ type: 'warning', buttons: ['Locate video', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Video missing', message }))
      if (response.response !== 0) return null
      const videoPick = await (win
        ? dialog.showOpenDialog(win, { title: 'Locate recorded video', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm'] }] })
        : dialog.showOpenDialog({ title: 'Locate recorded video', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm'] }] }))
      if (videoPick.canceled || videoPick.filePaths.length === 0) return null
      session = session.connectionMode === 'pc'
        ? { ...session, pcVideoPath: videoPick.filePaths[0] }
        : { ...session, videoPath: videoPick.filePaths[0] }
      writeProjectFile(pick.filePaths[0], session, project.bugs)
    }
    deps.manager.importProject(session, project.bugs.map(b => ({
      ...b,
      sessionId: session.id,
      audioRel: b.audioRel ?? null,
      audioDurationMs: b.audioDurationMs ?? null,
    })))
    return session
  })
  ipcMain.handle(CHANNEL.sessionResolveAssetPath, async (_e, sessionId: string, relPath: string) => {
    if (relPath === 'video.mp4') {
      const session = deps.manager.getSession(sessionId)
      if (session?.videoPath) return session.videoPath
    }
    if (relPath === 'pc-recording.webm') {
      const session = deps.manager.getSession(sessionId)
      if (session?.pcVideoPath) return session.pcVideoPath
    }
    return join(deps.paths.sessionDir(sessionId), relPath)
  })

  ipcMain.handle(CHANNEL.bugUpdate, async (_e, id: string, patch) => deps.manager.updateBug(id, patch))
  ipcMain.handle(CHANNEL.bugDelete, async (_e, id: string) => deps.manager.deleteBug(id))

  ipcMain.handle(CHANNEL.hotkeySetEnabled, async (_e, enabled: boolean) => deps.setHotkeyEnabled(enabled))
  ipcMain.handle(CHANNEL.settingsGet, async () => deps.settings.get())
  ipcMain.handle(CHANNEL.settingsSetExportRoot, async (_e, path: string) => deps.settings.setExportRoot(path))
  ipcMain.handle(CHANNEL.settingsSetHotkeys, async (_e, hotkeys: HotkeySettings) => {
    const settings = deps.settings.setHotkeys(hotkeys)
    deps.setHotkeys(settings.hotkeys)
    return settings
  })
  ipcMain.handle(CHANNEL.settingsChooseExportRoot, async (): Promise<{ exportRoot: string } | null> => {
    const win = deps.getWindow()
    const pick = await (win
      ? dialog.showOpenDialog(win, { title: 'Choose export folder', properties: ['openDirectory', 'createDirectory'] })
      : dialog.showOpenDialog({ title: 'Choose export folder', properties: ['openDirectory', 'createDirectory'] }))
    if (pick.canceled || pick.filePaths.length === 0) return null
    return deps.settings.setExportRoot(pick.filePaths[0])
  })

  ipcMain.handle(CHANNEL.bugAddMarker, async (_e, args: { sessionId: string; offsetMs: number; severity?: any; note?: string }) => {
    return deps.manager.addMarker(args)
  })
  ipcMain.handle(CHANNEL.bugSaveAudio, async (_e, args: { sessionId: string; bugId: string; base64: string; durationMs: number; mimeType: string }) => {
    const bytes = Buffer.from(args.base64, 'base64')
    deps.manager.saveBugAudio(args.sessionId, args.bugId, bytes, args.durationMs)
  })
  ipcMain.handle(CHANNEL.bugExportClip, async (_e, args: { sessionId: string; bugId: string }): Promise<string | null> => {
    const session = deps.manager.getSession(args.sessionId)
    const bugs = deps.manager.listBugs(args.sessionId)
    const bug = bugs.find(b => b.id === args.bugId)
    if (!session || !bug) throw new Error('session or bug not found')

    const outDir = exportDirForSession(deps.settings.get().exportRoot, session)
    mkdirSync(outDir, { recursive: true })
    const baseName = exportBaseName(session, bug)
    const outputPath = join(outDir, `${baseName}.mp4`)
    const imagePath = join(outDir, `${baseName}.jpg`)

    const { startMs, endMs } = clampClipWindow({ ...bug, durationMs: session.durationMs })
    const ffmpegPath = resolveBundledFfmpegPath()
    const clicks = readClickLog(deps.paths.clicksFile(session.id))
    const inputPath = sessionVideoInputPath(session, deps.paths)
    const tileSize = await contactSheetTileSize(deps.runner, inputPath)
    const clipOptions = {
      inputPath,
      outputPath,
      startMs, endMs,
      narrationPath: bug.audioRel ? join(deps.paths.sessionDir(session.id), bug.audioRel) : null,
      narrationDurationMs: bug.audioDurationMs,
      severity: bug.severity,
      note: bug.note,
      markerMs: bug.offsetMs,
      deviceModel: session.deviceModel,
      buildVersion: session.buildVersion,
      androidVersion: session.androidVersion,
      testNote: session.testNote,
      tester: session.tester,
      testedAtMs: bug.createdAt,
      clicks,
    }
    await extractClip(deps.runner, ffmpegPath, clipOptions)
    await extractContactSheet(deps.runner, ffmpegPath, { ...clipOptions, ...tileSize, outputPath: imagePath })
    return outputPath
  })

  ipcMain.handle(CHANNEL.bugExportClips, async (_e, args: { sessionId: string; bugIds: string[] }): Promise<string[] | null> => {
    const session = deps.manager.getSession(args.sessionId)
    const bugs = deps.manager.listBugs(args.sessionId).filter(b => args.bugIds.includes(b.id))
    if (!session) throw new Error('session not found')
    if (bugs.length === 0) return []

    const outDir = exportDirForSession(deps.settings.get().exportRoot, session)
    mkdirSync(outDir, { recursive: true })
    const outputs: string[] = []
    const clicks = readClickLog(deps.paths.clicksFile(session.id))
    for (let i = 0; i < bugs.length; i++) {
      const bug = bugs[i]
      const { startMs, endMs } = clampClipWindow({ ...bug, durationMs: session.durationMs })
      const baseName = `${String(i + 1).padStart(2, '0')}-${exportBaseName(session, bug)}`
      const outputPath = join(outDir, `${baseName}.mp4`)
      const imagePath = join(outDir, `${baseName}.jpg`)
      const ffmpegPath = resolveBundledFfmpegPath()
      const inputPath = sessionVideoInputPath(session, deps.paths)
      const tileSize = await contactSheetTileSize(deps.runner, inputPath)
      const clipOptions = {
        inputPath,
        outputPath,
        startMs,
        endMs,
        narrationPath: bug.audioRel ? join(deps.paths.sessionDir(session.id), bug.audioRel) : null,
        narrationDurationMs: bug.audioDurationMs,
        severity: bug.severity,
        note: bug.note,
        markerMs: bug.offsetMs,
        deviceModel: session.deviceModel,
        buildVersion: session.buildVersion,
        androidVersion: session.androidVersion,
        testNote: session.testNote,
        tester: session.tester,
        testedAtMs: bug.createdAt,
        clicks,
      }
      await extractClip(deps.runner, ffmpegPath, clipOptions)
      await extractContactSheet(deps.runner, ffmpegPath, { ...clipOptions, ...tileSize, outputPath: imagePath })
      outputs.push(outputPath)
    }
    return outputs
  })
}

export function emitBugMarkRequested(win: BrowserWindow | null, severity = 'normal') {
  win?.webContents.send(CHANNEL.bugMarkRequested, severity)
}
