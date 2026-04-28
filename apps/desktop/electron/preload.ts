import { contextBridge, ipcRenderer } from 'electron'
import { CHANNEL } from './ipc'
import type { DesktopApi } from '@shared/types'

const api: DesktopApi = {
  doctor: () => ipcRenderer.invoke(CHANNEL.doctor),
  app: {
    showItemInFolder: (path) => ipcRenderer.invoke(CHANNEL.showItemInFolder, path),
    openPath:         (path) => ipcRenderer.invoke(CHANNEL.openPath, path),
  },
  device: {
    list:        ()             => ipcRenderer.invoke(CHANNEL.deviceList),
    connect:     (ip, port)     => ipcRenderer.invoke(CHANNEL.deviceConnect, ip, port),
    mdnsScan:    ()             => ipcRenderer.invoke(CHANNEL.deviceMdnsScan),
    pair:        (a)            => ipcRenderer.invoke(CHANNEL.devicePair, a),
    getUserName: (id)           => ipcRenderer.invoke(CHANNEL.deviceGetUserName, id),
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
  },
  bug: {
    addMarker:  (args)          => ipcRenderer.invoke(CHANNEL.bugAddMarker, args),
    update:     (id, patch)     => ipcRenderer.invoke(CHANNEL.bugUpdate, id, patch),
    saveAudio:  (args)          => ipcRenderer.invoke(CHANNEL.bugSaveAudio, args),
    delete:     (id)            => ipcRenderer.invoke(CHANNEL.bugDelete, id),
    exportClip: (args)          => ipcRenderer.invoke(CHANNEL.bugExportClip, args),
    exportClips:(args)          => ipcRenderer.invoke(CHANNEL.bugExportClips, args),
  },
  hotkey: {
    setEnabled: (enabled)       => ipcRenderer.invoke(CHANNEL.hotkeySetEnabled, enabled),
  },
  settings: {
    get:              ()        => ipcRenderer.invoke(CHANNEL.settingsGet),
    setExportRoot:    (path)    => ipcRenderer.invoke(CHANNEL.settingsSetExportRoot, path),
    setHotkeys:        (hotkeys) => ipcRenderer.invoke(CHANNEL.settingsSetHotkeys, hotkeys),
    chooseExportRoot: ()        => ipcRenderer.invoke(CHANNEL.settingsChooseExportRoot),
  },
  onBugMarkRequested: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, severity: any) => cb(severity)
    ipcRenderer.on(CHANNEL.bugMarkRequested, handler)
    return () => ipcRenderer.removeListener(CHANNEL.bugMarkRequested, handler)
  },
  _resolveAssetPath: (id, relPath) => ipcRenderer.invoke(CHANNEL.sessionResolveAssetPath, id, relPath),
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window { api: DesktopApi }
}
