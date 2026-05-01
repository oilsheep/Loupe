import { contextBridge, ipcRenderer } from 'electron'
import { CHANNEL } from './ipc'
import type { DesktopApi } from '@shared/types'

const api: DesktopApi = {
  doctor: () => ipcRenderer.invoke(CHANNEL.doctor),
  app: {
    showItemInFolder: (path) => ipcRenderer.invoke(CHANNEL.showItemInFolder, path),
    openPath:         (path) => ipcRenderer.invoke(CHANNEL.openPath, path),
    getPlatform:      () => ipcRenderer.invoke(CHANNEL.appGetPlatform),
    openIphoneMirroring: () => ipcRenderer.invoke(CHANNEL.appOpenIphoneMirroring),
    startUxPlayReceiver: () => ipcRenderer.invoke(CHANNEL.appStartUxPlayReceiver),
    stopUxPlayReceiver:  () => ipcRenderer.invoke(CHANNEL.appStopUxPlayReceiver),
    getUxPlayReceiver:   () => ipcRenderer.invoke(CHANNEL.appGetUxPlayReceiver),
    installTools:        (names) => ipcRenderer.invoke(CHANNEL.appInstallTools, names),
    getPrimaryScreenSource: () => ipcRenderer.invoke(CHANNEL.getPrimaryScreenSource),
    listPcCaptureSources:  () => ipcRenderer.invoke(CHANNEL.listPcCaptureSources),
    showPcCaptureFrame:    (sourceId, color, displayId) => ipcRenderer.invoke(CHANNEL.showPcCaptureFrame, sourceId, color, displayId),
    hidePcCaptureFrame:    () => ipcRenderer.invoke(CHANNEL.hidePcCaptureFrame),
    readClipboardText:     () => ipcRenderer.invoke(CHANNEL.readClipboardText),
  },
  device: {
    list:        ()             => ipcRenderer.invoke(CHANNEL.deviceList),
    connect:     (ip, port)     => ipcRenderer.invoke(CHANNEL.deviceConnect, ip, port),
    mdnsScan:    ()             => ipcRenderer.invoke(CHANNEL.deviceMdnsScan),
    pair:        (a)            => ipcRenderer.invoke(CHANNEL.devicePair, a),
    getUserName: (id)           => ipcRenderer.invoke(CHANNEL.deviceGetUserName, id),
    listPackages:(id)           => ipcRenderer.invoke(CHANNEL.deviceListPackages, id),
    listIosApps: ()             => ipcRenderer.invoke(CHANNEL.deviceListIosApps),
  },
  session: {
    start:   (args)             => ipcRenderer.invoke(CHANNEL.sessionStart, args),
    markBug: (args)             => ipcRenderer.invoke(CHANNEL.sessionMarkBug, args),
    stop:    ()                 => ipcRenderer.invoke(CHANNEL.sessionStop),
    discard: (id)               => ipcRenderer.invoke(CHANNEL.sessionDiscard, id),
    list:    ()                 => ipcRenderer.invoke(CHANNEL.sessionList),
    get:     (id)               => ipcRenderer.invoke(CHANNEL.sessionGet, id),
    openProject: ()             => ipcRenderer.invoke(CHANNEL.sessionOpenProject),
    updateMetadata: (id, patch) => ipcRenderer.invoke(CHANNEL.sessionUpdateMetadata, id, patch),
    savePcRecording: (args)     => ipcRenderer.invoke(CHANNEL.sessionSavePcRecording, args),
    saveMicRecording: (args)    => ipcRenderer.invoke(CHANNEL.sessionSaveMicRecording, args),
  },
  bug: {
    addMarker:  (args)          => ipcRenderer.invoke(CHANNEL.bugAddMarker, args),
    getLogcatPreview: (args)    => ipcRenderer.invoke(CHANNEL.bugGetLogcatPreview, args),
    update:     (id, patch)     => ipcRenderer.invoke(CHANNEL.bugUpdate, id, patch),
    saveAudio:  (args)          => ipcRenderer.invoke(CHANNEL.bugSaveAudio, args),
    delete:     (id)            => ipcRenderer.invoke(CHANNEL.bugDelete, id),
    exportClip: (args)          => ipcRenderer.invoke(CHANNEL.bugExportClip, args),
    exportClips:(args)          => ipcRenderer.invoke(CHANNEL.bugExportClips, args),
    cancelExport:(exportId)     => ipcRenderer.invoke(CHANNEL.bugExportCancel, exportId),
  },
  hotkey: {
    setEnabled: (enabled)       => ipcRenderer.invoke(CHANNEL.hotkeySetEnabled, enabled),
  },
  settings: {
    get:              ()        => ipcRenderer.invoke(CHANNEL.settingsGet),
    setExportRoot:    (path)    => ipcRenderer.invoke(CHANNEL.settingsSetExportRoot, path),
    setHotkeys:        (hotkeys) => ipcRenderer.invoke(CHANNEL.settingsSetHotkeys, hotkeys),
    setSlack:          (settings) => ipcRenderer.invoke(CHANNEL.settingsSetSlack, settings),
    setGitLab:         (settings) => ipcRenderer.invoke(CHANNEL.settingsSetGitLab, settings),
    connectGitLabOAuth: (settings) => ipcRenderer.invoke(CHANNEL.settingsConnectGitLabOAuth, settings),
    cancelGitLabOAuth: () => ipcRenderer.invoke(CHANNEL.settingsCancelGitLabOAuth),
    listGitLabProjects: (settings) => ipcRenderer.invoke(CHANNEL.settingsListGitLabProjects, settings),
    setGoogle:         (settings) => ipcRenderer.invoke(CHANNEL.settingsSetGoogle, settings),
    connectGoogleOAuth: (settings) => ipcRenderer.invoke(CHANNEL.settingsConnectGoogleOAuth, settings),
    cancelGoogleOAuth: () => ipcRenderer.invoke(CHANNEL.settingsCancelGoogleOAuth),
    listGoogleDriveFolders: (settings) => ipcRenderer.invoke(CHANNEL.settingsListGoogleDriveFolders, settings),
    createGoogleDriveFolder: (settings, name) => ipcRenderer.invoke(CHANNEL.settingsCreateGoogleDriveFolder, settings, name),
    listGoogleSpreadsheets: (settings) => ipcRenderer.invoke(CHANNEL.settingsListGoogleSpreadsheets, settings),
    listGoogleSheetTabs: (settings) => ipcRenderer.invoke(CHANNEL.settingsListGoogleSheetTabs, settings),
    setMentionIdentities: (identities) => ipcRenderer.invoke(CHANNEL.settingsSetMentionIdentities, identities),
    importMentionIdentities: () => ipcRenderer.invoke(CHANNEL.settingsImportMentionIdentities),
    exportMentionIdentities: () => ipcRenderer.invoke(CHANNEL.settingsExportMentionIdentities),
    refreshSlackUsers: ()        => ipcRenderer.invoke(CHANNEL.settingsRefreshSlackUsers),
    refreshSlackChannels: ()     => ipcRenderer.invoke(CHANNEL.settingsRefreshSlackChannels),
    startSlackUserOAuth: (settings) => ipcRenderer.invoke(CHANNEL.settingsStartSlackUserOAuth, settings),
    refreshGitLabUsers: ()       => ipcRenderer.invoke(CHANNEL.settingsRefreshGitLabUsers),
    setLocale:         (locale)  => ipcRenderer.invoke(CHANNEL.settingsSetLocale, locale),
    setSeverities:     (severities) => ipcRenderer.invoke(CHANNEL.settingsSetSeverities, severities),
    chooseExportRoot: ()        => ipcRenderer.invoke(CHANNEL.settingsChooseExportRoot),
  },
  onBugMarkRequested: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, severity: any) => cb(severity)
    ipcRenderer.on(CHANNEL.bugMarkRequested, handler)
    return () => ipcRenderer.removeListener(CHANNEL.bugMarkRequested, handler)
  },
  onSessionInterrupted: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, session: any, reason: string) => cb(session, reason)
    ipcRenderer.on(CHANNEL.sessionInterrupted, handler)
    return () => ipcRenderer.removeListener(CHANNEL.sessionInterrupted, handler)
  },
  onBugExportProgress: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any) => cb(progress)
    ipcRenderer.on(CHANNEL.bugExportProgress, handler)
    return () => ipcRenderer.removeListener(CHANNEL.bugExportProgress, handler)
  },
  onSessionLoadProgress: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any) => cb(progress)
    ipcRenderer.on(CHANNEL.sessionLoadProgress, handler)
    return () => ipcRenderer.removeListener(CHANNEL.sessionLoadProgress, handler)
  },
  onToolInstallLog: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, log: any) => cb(log)
    ipcRenderer.on(CHANNEL.appInstallToolsLog, handler)
    return () => ipcRenderer.removeListener(CHANNEL.appInstallToolsLog, handler)
  },
  onSlackOAuthCompleted: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, result: any) => cb(result)
    ipcRenderer.on(CHANNEL.settingsSlackOAuthCompleted, handler)
    return () => ipcRenderer.removeListener(CHANNEL.settingsSlackOAuthCompleted, handler)
  },
  _resolveAssetPath: (id, relPath) => ipcRenderer.invoke(CHANNEL.sessionResolveAssetPath, id, relPath),
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window { api: DesktopApi }
}
