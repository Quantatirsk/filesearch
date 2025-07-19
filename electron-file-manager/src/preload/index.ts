import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
export interface ElectronAPI {
  // Python backend
  python: {
    start: () => Promise<{ success: boolean; message: string }>
    stop: () => Promise<{ success: boolean; message: string }>
    status: () => Promise<boolean>
  }
  
  // File operations
  files: {
    selectDirectory: () => Promise<string | null>
    copy: (files: string[], destination: string) => Promise<{ success: boolean; message: string; results?: any[] }>
    copyToClipboard: (files: string[]) => Promise<{ success: boolean; message: string; results?: any[] }>
    move: (files: string[], destination: string) => Promise<{ success: boolean; message: string; results?: any[] }>
    rename: (oldPath: string, newPath: string) => Promise<{ success: boolean; message: string }>
    delete: (files: string[]) => Promise<{ success: boolean; message: string; results?: any[] }>
    openFile: (filePath: string) => Promise<{ success: boolean; message: string }>
    openInExplorer: (filePath: string) => Promise<{ success: boolean; message: string }>
  }
  
  // API requests
  api: {
    request: (options: any) => Promise<any>
  }
  
  // Settings management
  settings: {
    load: () => Promise<any>
    save: (settings: any) => Promise<void>
    get: () => Promise<any>
    reset: () => Promise<any>
  }
}

const api: ElectronAPI = {
  python: {
    start: () => ipcRenderer.invoke('python:start'),
    stop: () => ipcRenderer.invoke('python:stop'),
    status: () => ipcRenderer.invoke('python:status')
  },
  files: {
    selectDirectory: () => ipcRenderer.invoke('files:select-directory'),
    copy: (files: string[], destination: string) => ipcRenderer.invoke('files:copy', files, destination),
    copyToClipboard: (files: string[]) => ipcRenderer.invoke('files:copy-to-clipboard', files),
    move: (files: string[], destination: string) => ipcRenderer.invoke('files:move', files, destination),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('files:rename', oldPath, newPath),
    delete: (files: string[]) => ipcRenderer.invoke('files:delete', files),
    openFile: (filePath: string) => ipcRenderer.invoke('files:open-file', filePath),
    openInExplorer: (filePath: string) => ipcRenderer.invoke('files:open-in-explorer', filePath)
  },
  api: {
    request: (options: any) => ipcRenderer.invoke('api:request', options)
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings: any) => ipcRenderer.invoke('settings:save', settings),
    get: () => ipcRenderer.invoke('settings:get'),
    reset: () => ipcRenderer.invoke('settings:reset')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.electronAPI = api
}

export { electronAPI }