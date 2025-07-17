import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'

export interface SettingsData {
  // 搜索设置
  defaultSearchType: 'exact' | 'fuzzy' | 'path' | 'hybrid'
  searchResultLimit: number
  fuzzyThreshold: number
  searchDebounce: number
  autoSearch: boolean
  
  // UI设置
  theme: 'light' | 'dark' | 'system'
  language: 'zh' | 'en'
  listDensity: 'compact' | 'comfortable'
  showFileSize: boolean
  showLastModified: boolean
  showContentPreview: boolean
  
  // 文件类型过滤
  supportedFileTypes: string[]
  enabledFileTypes: string[]
  
  // 后端设置
  serverPort: number
  workerCount: number
  autoStartBackend: boolean
  
  // 高级设置
  indexingBatchSize: number
  maxFileSize: number
  enableChineseTokenizer: boolean
}

export const DEFAULT_SETTINGS: SettingsData = {
  defaultSearchType: 'hybrid',
  searchResultLimit: 1000,
  fuzzyThreshold: 30,
  searchDebounce: 150,
  autoSearch: true,
  
  theme: 'system',
  language: 'zh',
  listDensity: 'comfortable',
  showFileSize: true,
  showLastModified: true,
  showContentPreview: true,
  
  supportedFileTypes: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md'],
  enabledFileTypes: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md'],
  
  serverPort: 8001,
  workerCount: 8,
  autoStartBackend: true,
  
  indexingBatchSize: 1000,
  maxFileSize: 100, // MB
  enableChineseTokenizer: true
}

export class SettingsStore {
  private settingsPath: string
  private settings: SettingsData
  
  constructor() {
    this.settingsPath = join(app.getPath('userData'), 'settings.json')
    this.settings = { ...DEFAULT_SETTINGS }
  }

  async load(): Promise<SettingsData> {
    try {
      const data = await fs.readFile(this.settingsPath, 'utf8')
      const savedSettings = JSON.parse(data)
      
      // 合并默认设置和保存的设置，确保新字段有默认值
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...savedSettings
      }
      
      // 验证设置数据
      this.validateSettings()
      
      return this.settings
    } catch (error) {
      console.log('No settings file found, using defaults')
      return { ...DEFAULT_SETTINGS }
    }
  }

  async save(newSettings: SettingsData): Promise<void> {
    try {
      // 验证设置数据
      this.validateSettings(newSettings)
      
      this.settings = { ...newSettings }
      
      // 确保目录存在
      const dir = join(this.settingsPath, '..')
      await fs.mkdir(dir, { recursive: true })
      
      // 保存设置
      await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2))
    } catch (error) {
      console.error('Failed to save settings:', error)
      throw error
    }
  }

  get(): SettingsData {
    return { ...this.settings }
  }

  reset(): SettingsData {
    this.settings = { ...DEFAULT_SETTINGS }
    return this.settings
  }

  private validateSettings(settings: SettingsData = this.settings): void {
    // 验证搜索设置
    if (!['exact', 'fuzzy', 'path', 'hybrid'].includes(settings.defaultSearchType)) {
      settings.defaultSearchType = 'hybrid'
    }
    
    if (settings.searchResultLimit < 10 || settings.searchResultLimit > 10000) {
      settings.searchResultLimit = 1000
    }
    
    if (settings.fuzzyThreshold < 0 || settings.fuzzyThreshold > 100) {
      settings.fuzzyThreshold = 30
    }
    
    if (settings.searchDebounce < 0 || settings.searchDebounce > 1000) {
      settings.searchDebounce = 150
    }
    
    // 验证UI设置
    if (!['light', 'dark', 'system'].includes(settings.theme)) {
      settings.theme = 'system'
    }
    
    if (!['zh', 'en'].includes(settings.language)) {
      settings.language = 'zh'
    }
    
    if (!['compact', 'comfortable'].includes(settings.listDensity)) {
      settings.listDensity = 'comfortable'
    }
    
    // 验证文件类型
    if (!Array.isArray(settings.supportedFileTypes)) {
      settings.supportedFileTypes = DEFAULT_SETTINGS.supportedFileTypes
    }
    
    if (!Array.isArray(settings.enabledFileTypes)) {
      settings.enabledFileTypes = DEFAULT_SETTINGS.enabledFileTypes
    }
    
    // 验证服务器设置
    if (settings.serverPort < 1024 || settings.serverPort > 65535) {
      settings.serverPort = 8001
    }
    
    if (settings.workerCount < 1 || settings.workerCount > 32) {
      settings.workerCount = 8
    }
    
    // 验证高级设置
    if (settings.indexingBatchSize < 100 || settings.indexingBatchSize > 10000) {
      settings.indexingBatchSize = 1000
    }
    
    if (settings.maxFileSize < 1 || settings.maxFileSize > 1000) {
      settings.maxFileSize = 100
    }
  }
}