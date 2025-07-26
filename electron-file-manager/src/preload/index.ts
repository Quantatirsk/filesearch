import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { CustomElectronAPI } from '../types/electron'

// Implementation of custom APIs for renderer
const customElectronAPI: CustomElectronAPI = {
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
    openInExplorer: (filePath: string) => ipcRenderer.invoke('files:open-in-explorer', filePath),
    getDesktopPath: () => ipcRenderer.invoke('files:get-desktop-path'),
    createDirectory: (dirPath: string) => ipcRenderer.invoke('files:create-directory', dirPath)
  },
  api: {
    request: (options: unknown) => ipcRenderer.invoke('api:request', options)
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
    get: () => ipcRenderer.invoke('settings:get'),
    reset: () => ipcRenderer.invoke('settings:reset')
  },
  searchOverlay: {
    onShow: (callback: () => void) => {
      ipcRenderer.on('show-search-overlay', callback)
      return () => ipcRenderer.removeListener('show-search-overlay', callback)
    },
    onSetSearchWindow: (callback: (isSearchWindow: boolean) => void) => {
      ipcRenderer.on('set-search-window', callback)
      return () => ipcRenderer.removeListener('set-search-window', callback)
    },
    openMainWindow: (query: string, searchType: string) => 
      ipcRenderer.invoke('search:open-main-window', query, searchType),
    hide: () => ipcRenderer.invoke('search:hide-window'),
    notifyReady: () => ipcRenderer.send('search-window-ready')
  },
  platform: {
    isMac: process.platform === 'darwin'
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronAPI', customElectronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.electronAPI = customElectronAPI
}

export { electronAPI }