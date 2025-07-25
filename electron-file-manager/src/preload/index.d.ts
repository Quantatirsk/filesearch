import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: import('../types/electron').CustomElectronAPI
  }
}