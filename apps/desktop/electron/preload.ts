import { contextBridge, ipcRenderer } from 'electron'
import { CHANNEL } from './ipc'
import type { DesktopApi } from '@shared/types'

const api: DesktopApi = {
  doctor: () => ipcRenderer.invoke(CHANNEL.doctor),
  device: {
    list:    ()                 => ipcRenderer.invoke(CHANNEL.deviceList),
    connect: (ip, port)         => ipcRenderer.invoke(CHANNEL.deviceConnect, ip, port),
    mdnsScan: ()                => ipcRenderer.invoke(CHANNEL.deviceMdnsScan),
    pair:     (a)               => ipcRenderer.invoke(CHANNEL.devicePair, a),
  },
  session: {
    start:   (args)             => ipcRenderer.invoke(CHANNEL.sessionStart, args),
    markBug: (args)             => ipcRenderer.invoke(CHANNEL.sessionMarkBug, args),
    stop:    ()                 => ipcRenderer.invoke(CHANNEL.sessionStop),
    discard: (id)               => ipcRenderer.invoke(CHANNEL.sessionDiscard, id),
    list:    ()                 => ipcRenderer.invoke(CHANNEL.sessionList),
    get:     (id)               => ipcRenderer.invoke(CHANNEL.sessionGet, id),
  },
  bug: {
    update:     (id, patch)     => ipcRenderer.invoke(CHANNEL.bugUpdate, id, patch),
    delete:     (id)            => ipcRenderer.invoke(CHANNEL.bugDelete, id),
    exportClip: (args)          => ipcRenderer.invoke(CHANNEL.bugExportClip, args),
  },
  onBugMarkRequested: (cb) => {
    const handler = () => cb()
    ipcRenderer.on(CHANNEL.bugMarkRequested, handler)
    return () => ipcRenderer.removeListener(CHANNEL.bugMarkRequested, handler)
  },
  _resolveVideoPath: (id) => ipcRenderer.invoke(CHANNEL.sessionResolveVideoPath, id),
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window { api: DesktopApi }
}
