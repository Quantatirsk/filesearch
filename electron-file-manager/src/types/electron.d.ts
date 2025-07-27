// Electron API type definitions
export interface ElectronFileAPI {
  selectDirectory: () => Promise<string | null>
  copy: (files: string[], destination: string) => Promise<{ success: boolean; message: string; results?: unknown[] }>
  copyToClipboard: (files: string[]) => Promise<{ success: boolean; message: string; results?: unknown[] }>
  move: (files: string[], destination: string) => Promise<{ success: boolean; message: string; results?: unknown[] }>
  rename: (oldPath: string, newPath: string) => Promise<{ success: boolean; message: string }>
  delete: (files: string[]) => Promise<{ success: boolean; message: string; results?: unknown[] }>
  openFile: (filePath: string) => Promise<{ success: boolean; message: string }>
  openInExplorer: (filePath: string) => Promise<{ success: boolean; message: string }>
  getDesktopPath: () => Promise<string | null>
  createDirectory: (dirPath: string) => Promise<{ success: boolean; message: string }>
}

export interface ElectronPythonAPI {
  start: () => Promise<{ success: boolean; message: string }>
  stop: () => Promise<{ success: boolean; message: string }>
  status: () => Promise<boolean>
}

export interface ElectronAPIRequest {
  request: (options: unknown) => Promise<unknown>
}

export interface ElectronSettingsAPI {
  load: () => Promise<unknown>
  save: (settings: unknown) => Promise<void>
  get: () => Promise<unknown>
  reset: () => Promise<unknown>
}

export interface ElectronSearchOverlayAPI {
  onShow: (callback: () => void) => () => void
  onSetSearchWindow: (callback: (isSearchWindow: boolean) => void) => () => void
  openMainWindow: (query: string, searchType: string) => Promise<{ success: boolean; error?: string }>
  hide: () => Promise<{ success: boolean; error?: string }>
  notifyReady: () => void
}

export interface ElectronPlatformAPI {
  isMac: boolean
}

export interface CustomElectronAPI {
  python: ElectronPythonAPI
  files: ElectronFileAPI
  api: ElectronAPIRequest
  settings: ElectronSettingsAPI
  searchOverlay: ElectronSearchOverlayAPI
  platform: ElectronPlatformAPI
}

declare global {
  interface Window {
    electronAPI: CustomElectronAPI
    electron: {
      ipcRenderer: {
        on: (channel: string, callback: (...args: unknown[]) => void) => void
        removeListener: (channel: string, callback: (...args: unknown[]) => void) => void
        send: (channel: string, ...args: unknown[]) => void
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      }
    }
  }
}