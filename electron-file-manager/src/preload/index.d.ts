import { ElectronAPI } from '@electron-toolkit/preload'
import { ElectronAPI as CustomElectronAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: CustomElectronAPI
  }
}