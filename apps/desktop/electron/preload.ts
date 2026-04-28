import { contextBridge } from 'electron'

// Phase-1 placeholder; populated in Task 11.
contextBridge.exposeInMainWorld('api', {})
