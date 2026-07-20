import { contextBridge, ipcRenderer } from 'electron'
import { CHANNEL } from './ipc'
import type { DesktopApi } from '@shared/types'

const api: DesktopApi = {
  doctor: () => ipcRenderer.invoke(CHANNEL.doctor),
  app: {
    showItemInFolder: (path) => ipcRenderer.invoke(CHANNEL.showItemInFolder, path),
    openPath:         (path) => ipcRenderer.invoke(CHANNEL.openPath, path),
    getPlatform:      () => ipcRenderer.invoke(CHANNEL.appGetPlatform),
    getVersion:       () => ipcRenderer.invoke(CHANNEL.appGetVersion),
    recoverFocusAfterNativeDialog: () => ipcRenderer.invoke(CHANNEL.appRecoverFocusAfterNativeDialog),
    checkForUpdates:  () => ipcRenderer.invoke(CHANNEL.appCheckForUpdates),
    openUpdateDownload: (url) => ipcRenderer.invoke(CHANNEL.appOpenUpdateDownload, url),
    downloadUpdate:   () => ipcRenderer.invoke(CHANNEL.appDownloadUpdate),
    installUpdate:    () => ipcRenderer.invoke(CHANNEL.appInstallUpdate),
    openIphoneMirroring: () => ipcRenderer.invoke(CHANNEL.appOpenIphoneMirroring),
    startUxPlayReceiver: () => ipcRenderer.invoke(CHANNEL.appStartUxPlayReceiver),
    stopUxPlayReceiver:  () => ipcRenderer.invoke(CHANNEL.appStopUxPlayReceiver),
    getUxPlayReceiver:   () => ipcRenderer.invoke(CHANNEL.appGetUxPlayReceiver),
    installTools:        (names) => ipcRenderer.invoke(CHANNEL.appInstallTools, names),
    resetFasterWhisper:  () => ipcRenderer.invoke(CHANNEL.appResetFasterWhisper),
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
  iosControl: {
    startWda: (args)            => ipcRenderer.invoke(CHANNEL.iosControlStartWda, args),
    tap:      (args)            => ipcRenderer.invoke(CHANNEL.iosControlTap, args),
  },
  session: {
    start:   (args)             => ipcRenderer.invoke(CHANNEL.sessionStart, args),
    chooseVideoFile: ()         => ipcRenderer.invoke(CHANNEL.sessionChooseVideoFile),
    chooseAudioFile: ()         => ipcRenderer.invoke(CHANNEL.sessionChooseAudioFile),
    importVideo: (args)         => ipcRenderer.invoke(CHANNEL.sessionImportVideo, args),
    markBug: (args)             => ipcRenderer.invoke(CHANNEL.sessionMarkBug, args),
    stop:    ()                 => ipcRenderer.invoke(CHANNEL.sessionStop),
    discard: (id)               => ipcRenderer.invoke(CHANNEL.sessionDiscard, id),
    list:    ()                 => ipcRenderer.invoke(CHANNEL.sessionList),
    get:     (id)               => ipcRenderer.invoke(CHANNEL.sessionGet, id),
    openProject: ()             => ipcRenderer.invoke(CHANNEL.sessionOpenProject),
    updateMetadata: (id, patch) => ipcRenderer.invoke(CHANNEL.sessionUpdateMetadata, id, patch),
    updateMicAudioOffset: (id, startOffsetMs) => ipcRenderer.invoke(CHANNEL.sessionUpdateMicAudioOffset, id, startOffsetMs),
    savePcRecording: (args)     => ipcRenderer.invoke(CHANNEL.sessionSavePcRecording, args),
    appendPcRecordingChunk: (args) => ipcRenderer.invoke(CHANNEL.sessionAppendPcRecordingChunk, args),
    finishPcRecording: (args)   => ipcRenderer.invoke(CHANNEL.sessionFinishPcRecording, args),
    saveMicRecording: (args)    => ipcRenderer.invoke(CHANNEL.sessionSaveMicRecording, args),
  },
  bug: {
    recaptureScreenshot: (bugId) => ipcRenderer.invoke(CHANNEL.bugRecaptureScreenshot, bugId),
    resetScreenshot:     (bugId) => ipcRenderer.invoke(CHANNEL.bugResetScreenshot, bugId),
    addMarker:  (args)          => ipcRenderer.invoke(CHANNEL.bugAddMarker, args),
    getLogcatPreview: (args)    => ipcRenderer.invoke(CHANNEL.bugGetLogcatPreview, args),
    update:     (id, patch)     => ipcRenderer.invoke(CHANNEL.bugUpdate, id, patch),
    addAnnotation: (args)       => ipcRenderer.invoke(CHANNEL.bugAddAnnotation, args),
    updateAnnotation: (id, patch) => ipcRenderer.invoke(CHANNEL.bugUpdateAnnotation, id, patch),
    deleteAnnotation: (id)      => ipcRenderer.invoke(CHANNEL.bugDeleteAnnotation, id),
    saveAudio:  (args)          => ipcRenderer.invoke(CHANNEL.bugSaveAudio, args),
    transcribeAudio: (args)     => ipcRenderer.invoke(CHANNEL.bugTranscribeAudio, args),
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
    setExportQuality: (quality) => ipcRenderer.invoke(CHANNEL.settingsSetExportQuality, quality),
    setHotkeys:        (hotkeys) => ipcRenderer.invoke(CHANNEL.settingsSetHotkeys, hotkeys),
    setSlack:          (projectId, settings) => ipcRenderer.invoke(CHANNEL.settingsSetSlack, projectId, settings),
    setGitLab:         (projectId, settings) => ipcRenderer.invoke(CHANNEL.settingsSetGitLab, projectId, settings),
    connectGitLabOAuth: (projectId, settings) => ipcRenderer.invoke(CHANNEL.settingsConnectGitLabOAuth, projectId, settings),
    cancelGitLabOAuth: () => ipcRenderer.invoke(CHANNEL.settingsCancelGitLabOAuth),
    getBundledGitLabOAuthInstances: () => ipcRenderer.invoke(CHANNEL.settingsGetBundledGitLabOAuthInstances),
    listGitLabProjects: (projectId, settings) => ipcRenderer.invoke(CHANNEL.settingsListGitLabProjects, projectId, settings),
    setGoogle:         (projectId, settings) => ipcRenderer.invoke(CHANNEL.settingsSetGoogle, projectId, settings),
    connectGoogleOAuth: (projectId, settings) => ipcRenderer.invoke(CHANNEL.settingsConnectGoogleOAuth, projectId, settings),
    cancelGoogleOAuth: () => ipcRenderer.invoke(CHANNEL.settingsCancelGoogleOAuth),
    listGoogleDriveFolders: (projectId, settings) => ipcRenderer.invoke(CHANNEL.settingsListGoogleDriveFolders, projectId, settings),
    createGoogleDriveFolder: (projectId, settings, name) => ipcRenderer.invoke(CHANNEL.settingsCreateGoogleDriveFolder, projectId, settings, name),
    listGoogleSpreadsheets: (projectId, settings) => ipcRenderer.invoke(CHANNEL.settingsListGoogleSpreadsheets, projectId, settings),
    listGoogleSheetTabs: (projectId, settings) => ipcRenderer.invoke(CHANNEL.settingsListGoogleSheetTabs, projectId, settings),
    setMentionIdentities: (identities) => ipcRenderer.invoke(CHANNEL.settingsSetMentionIdentities, identities),
    setMarkerFieldPresets: (projectId, presets) => ipcRenderer.invoke(CHANNEL.settingsSetMarkerFieldPresets, projectId, presets),
    setPublishTemplates: (projectId, templates) => ipcRenderer.invoke(CHANNEL.settingsSetPublishTemplates, projectId, templates),
    importMentionIdentities: () => ipcRenderer.invoke(CHANNEL.settingsImportMentionIdentities),
    exportMentionIdentities: () => ipcRenderer.invoke(CHANNEL.settingsExportMentionIdentities),
    refreshSlackUsers: (projectId) => ipcRenderer.invoke(CHANNEL.settingsRefreshSlackUsers, projectId),
    refreshSlackChannels: (projectId) => ipcRenderer.invoke(CHANNEL.settingsRefreshSlackChannels, projectId),
    startSlackUserOAuth: (projectId, settings) => ipcRenderer.invoke(CHANNEL.settingsStartSlackUserOAuth, projectId, settings),
    disconnectService: (projectId, service) => ipcRenderer.invoke(CHANNEL.settingsDisconnectService, projectId, service),
    refreshGitLabUsers: (projectId) => ipcRenderer.invoke(CHANNEL.settingsRefreshGitLabUsers, projectId),
    validateConnections: (profileId) => ipcRenderer.invoke(CHANNEL.settingsValidateConnections, profileId),
    setLocale:         (locale)  => ipcRenderer.invoke(CHANNEL.settingsSetLocale, locale),
    setSeverities:     (severities) => ipcRenderer.invoke(CHANNEL.settingsSetSeverities, severities),
    setAudioAnalysis:  (settings) => ipcRenderer.invoke(CHANNEL.settingsSetAudioAnalysis, settings),
    setCommonSession: (settings) => ipcRenderer.invoke(CHANNEL.settingsSetCommonSession, settings),
    setRecordingPreferences: (settings) => ipcRenderer.invoke(CHANNEL.settingsSetRecordingPreferences, settings),
    addProfile:       (args)     => ipcRenderer.invoke(CHANNEL.settingsAddProfile, args),
    renameProfile:    (id, newName) => ipcRenderer.invoke(CHANNEL.settingsRenameProfile, id, newName),
    deleteProfile:    (id)       => ipcRenderer.invoke(CHANNEL.settingsDeleteProfile, id),
    setActiveProfile: (id)       => ipcRenderer.invoke(CHANNEL.settingsSetActiveProfile, id),
    chooseWhisperModel: ()       => ipcRenderer.invoke(CHANNEL.settingsChooseWhisperModel),
    chooseExportRoot: ()        => ipcRenderer.invoke(CHANNEL.settingsChooseExportRoot),
  },
  audioAnalysis: {
    analyzeSession: (sessionId) => ipcRenderer.invoke(CHANNEL.audioAnalysisAnalyzeSession, sessionId),
    cancel: (sessionId) => ipcRenderer.invoke(CHANNEL.audioAnalysisCancel, sessionId),
  },
  export: {
    listForSession: (sessionId) => ipcRenderer.invoke(CHANNEL.exportListForSession, sessionId),
    republish:      (args)      => ipcRenderer.invoke(CHANNEL.exportRepublish, args),
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
  onAudioAnalysisProgress: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any) => cb(progress)
    ipcRenderer.on(CHANNEL.audioAnalysisProgress, handler)
    return () => ipcRenderer.removeListener(CHANNEL.audioAnalysisProgress, handler)
  },
  onToolInstallLog: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, log: any) => cb(log)
    ipcRenderer.on(CHANNEL.appInstallToolsLog, handler)
    return () => ipcRenderer.removeListener(CHANNEL.appInstallToolsLog, handler)
  },
  onAppUpdateEvent: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, updateEvent: any) => cb(updateEvent)
    ipcRenderer.on(CHANNEL.appUpdateEvent, handler)
    return () => ipcRenderer.removeListener(CHANNEL.appUpdateEvent, handler)
  },
  onSlackOAuthCompleted: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, result: any) => cb(result)
    ipcRenderer.on(CHANNEL.settingsSlackOAuthCompleted, handler)
    return () => ipcRenderer.removeListener(CHANNEL.settingsSlackOAuthCompleted, handler)
  },
  onAppSettingsUpdated: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: any) => cb(settings)
    ipcRenderer.on(CHANNEL.appSettingsUpdated, handler)
    return () => ipcRenderer.removeListener(CHANNEL.appSettingsUpdated, handler)
  },
  _resolveAssetPath: (id, relPath) => ipcRenderer.invoke(CHANNEL.sessionResolveAssetPath, id, relPath),
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window { api: DesktopApi }
}
