import { ipcMain, BrowserWindow, dialog, screen, shell } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { clampClipWindow, extractClip, extractContactSheet, resolveBundledFfmpegPath } from './ffmpeg'
import type { Adb } from './adb'
import type { SessionManager } from './session'
import type { Paths } from './paths'
import type { IProcessRunner } from './process-runner'
import type { Db } from './db'
import type { ToolCheck } from './doctor'
import type { HotkeySettings, Session } from '@shared/types'
import { doctor } from './doctor'
import { readProjectFile, writeProjectFile } from './project-file'
import type { SettingsStore } from './settings'

export const CHANNEL = {
  doctor:                  'app:doctor',
  showItemInFolder:        'app:showItemInFolder',
  openPath:                'app:openPath',
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

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(CHANNEL.doctor, async (): Promise<ToolCheck[]> => doctor(deps.runner))
  ipcMain.handle(CHANNEL.showItemInFolder, async (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle(CHANNEL.openPath, async (_e, path: string) => {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })

  ipcMain.handle(CHANNEL.deviceList, async () => deps.adb.listDevices())
  ipcMain.handle(CHANNEL.deviceConnect, async (_e, ip: string, port?: number) => deps.adb.connect(ip, port))
  ipcMain.handle(CHANNEL.deviceMdnsScan, async () => deps.adb.mdnsServices())
  ipcMain.handle(CHANNEL.devicePair, async (_e, args: { ipPort: string; code: string }) => deps.adb.pair(args.ipPort, args.code))
  ipcMain.handle(CHANNEL.deviceGetUserName, async (_e, id: string) => deps.adb.getUserDeviceName(id))

  ipcMain.handle(CHANNEL.sessionStart, async (_e, args) => {
    const session = await deps.manager.start(args)
    dockRecordingPanel(deps.getWindow())
    return session
  })
  ipcMain.handle(CHANNEL.sessionMarkBug, async (_e, args) => deps.manager.markBug(args))
  ipcMain.handle(CHANNEL.sessionStop, async () => {
    const session = await deps.manager.stop()
    restoreReviewWindow(deps.getWindow())
    return session
  })
  ipcMain.handle(CHANNEL.sessionDiscard, async (_e, id: string) => deps.manager.discard(id))
  ipcMain.handle(CHANNEL.sessionList, async () => deps.manager.listSessions())
  ipcMain.handle(CHANNEL.sessionGet, async (_e, id: string) => {
    const session = deps.manager.getSession(id)
    if (!session) return null
    return { session, bugs: deps.manager.listBugs(id) }
  })
  ipcMain.handle(CHANNEL.sessionUpdateMetadata, async (_e, id: string, patch: { testNote: string; tester: string }) => {
    deps.manager.updateSessionMetadata(id, patch)
  })
  ipcMain.handle(CHANNEL.sessionOpenProject, async (): Promise<Session | null> => {
    const win = deps.getWindow()
    const pick = await (win
      ? dialog.showOpenDialog(win, { title: 'Open Loupe session', properties: ['openFile'], filters: [{ name: 'Loupe session', extensions: ['loupe'] }] })
      : dialog.showOpenDialog({ title: 'Open Loupe session', properties: ['openFile'], filters: [{ name: 'Loupe session', extensions: ['loupe'] }] }))
    if (pick.canceled || pick.filePaths.length === 0) return null

    const project = readProjectFile(pick.filePaths[0])
    let session: Session = { ...project.session, tester: project.session.tester ?? '', videoPath: project.session.videoPath ?? null }
    if (!session.videoPath || !existsSync(session.videoPath)) {
      const message = session.videoPath
        ? `The recorded video could not be found:\n${session.videoPath}\n\nChoose the video file to relink this session.`
        : 'This session does not have a recorded video path. Choose the video file to relink it.'
      const response = await (win
        ? dialog.showMessageBox(win, { type: 'warning', buttons: ['Locate video', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Video missing', message })
        : dialog.showMessageBox({ type: 'warning', buttons: ['Locate video', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Video missing', message }))
      if (response.response !== 0) return null
      const videoPick = await (win
        ? dialog.showOpenDialog(win, { title: 'Locate recorded video', properties: ['openFile'], filters: [{ name: 'MP4 video', extensions: ['mp4'] }] })
        : dialog.showOpenDialog({ title: 'Locate recorded video', properties: ['openFile'], filters: [{ name: 'MP4 video', extensions: ['mp4'] }] }))
      if (videoPick.canceled || videoPick.filePaths.length === 0) return null
      session = { ...session, videoPath: videoPick.filePaths[0] }
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
    const clipOptions = {
      inputPath: session.videoPath ?? deps.paths.videoFile(session.id),
      outputPath,
      startMs, endMs,
      narrationPath: bug.audioRel ? join(deps.paths.sessionDir(session.id), bug.audioRel) : null,
      narrationDurationMs: bug.audioDurationMs,
      note: bug.note,
      markerMs: bug.offsetMs,
      deviceModel: session.deviceModel,
      buildVersion: session.buildVersion,
      androidVersion: session.androidVersion,
      testNote: session.testNote,
      tester: session.tester,
      testedAtMs: bug.createdAt,
    }
    await extractClip(deps.runner, ffmpegPath, clipOptions)
    await extractContactSheet(deps.runner, ffmpegPath, { ...clipOptions, outputPath: imagePath })
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
    for (let i = 0; i < bugs.length; i++) {
      const bug = bugs[i]
      const { startMs, endMs } = clampClipWindow({ ...bug, durationMs: session.durationMs })
      const baseName = `${String(i + 1).padStart(2, '0')}-${exportBaseName(session, bug)}`
      const outputPath = join(outDir, `${baseName}.mp4`)
      const imagePath = join(outDir, `${baseName}.jpg`)
      const ffmpegPath = resolveBundledFfmpegPath()
      const clipOptions = {
        inputPath: session.videoPath ?? deps.paths.videoFile(session.id),
        outputPath,
        startMs,
        endMs,
        narrationPath: bug.audioRel ? join(deps.paths.sessionDir(session.id), bug.audioRel) : null,
        narrationDurationMs: bug.audioDurationMs,
        note: bug.note,
        markerMs: bug.offsetMs,
        deviceModel: session.deviceModel,
        buildVersion: session.buildVersion,
        androidVersion: session.androidVersion,
        testNote: session.testNote,
        tester: session.tester,
        testedAtMs: bug.createdAt,
      }
      await extractClip(deps.runner, ffmpegPath, clipOptions)
      await extractContactSheet(deps.runner, ffmpegPath, { ...clipOptions, outputPath: imagePath })
      outputs.push(outputPath)
    }
    return outputs
  })
}

export function emitBugMarkRequested(win: BrowserWindow | null, severity = 'normal') {
  win?.webContents.send(CHANNEL.bugMarkRequested, severity)
}
