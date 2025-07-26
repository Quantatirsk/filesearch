import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { FileItem, SearchOptions, AppState, DatabaseStats } from '../types'

interface SettingsData {
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
  enabledCategories: string[]
  enabledFormats: string[]
  
  // 后端设置
  serverPort: number
  workerCount: number
  autoStartBackend: boolean
  
  // 高级设置
  indexingBatchSize: number
  maxFileSize: number
  enableChineseTokenizer: boolean
}

interface AppStore extends AppState {
  // Settings
  settings: SettingsData
  settingsLoading: boolean
  
  // Backend initialization state
  backendInitialized: boolean
  
  // Actions
  setBackendRunning: (running: boolean) => void
  setBackendInitialized: (initialized: boolean) => void
  setCurrentDirectory: (directory: string | null) => void
  setSearchResults: (results: FileItem[]) => void
  setSelectedFiles: (files: string[]) => void
  toggleFileSelection: (filePath: string) => void
  selectAllFiles: () => void
  clearSelection: () => void
  setSearching: (searching: boolean) => void
  setSearchQuery: (query: string) => void
  setStats: (stats: DatabaseStats | null) => void
  
  // Settings Actions
  setSettings: (settings: SettingsData) => void
  setSettingsLoading: (loading: boolean) => void
  loadSettings: () => Promise<void>
  saveSettings: (newSettings: Partial<SettingsData>) => Promise<boolean>
  
  // Computed
  getSelectedFileItems: () => FileItem[]
}

const DEFAULT_SETTINGS: SettingsData = {
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
  
  enabledCategories: ['documents', 'programming', 'web', 'config', 'shell', 'docs', 'build'],
  enabledFormats: [
    // Default formats for common document types
    '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md',
    // Programming files
    '.py', '.js', '.ts', '.jsx', '.tsx', '.json', '.xml', '.html', '.css',
    // Config files
    '.yml', '.yaml', '.toml', '.ini', '.env', '.conf'
  ],
  
  serverPort: 8001,
  workerCount: 8,
  autoStartBackend: true,
  
  indexingBatchSize: 1000,
  maxFileSize: 100, // MB
  enableChineseTokenizer: true
}

export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      isBackendRunning: false,
      backendInitialized: false,
      currentDirectory: null,
      searchResults: [],
      selectedFiles: [],
      isSearching: false,
      searchQuery: '',
      stats: null,
      settings: DEFAULT_SETTINGS,
      settingsLoading: false,

      // Actions
      setBackendRunning: (running) => set({ isBackendRunning: running }),
      setBackendInitialized: (initialized) => set({ backendInitialized: initialized }),
      
      setCurrentDirectory: (directory) => set({ currentDirectory: directory }),
      
      setSearchResults: (results) => {
        set((state) => ({ 
          searchResults: results,
          selectedFiles: [] // Clear selection when new results come in
        }), false, 'setSearchResults')
      },
      
      setSelectedFiles: (files) => set({ selectedFiles: files }),
      
      toggleFileSelection: (filePath) => set((state) => {
        const isSelected = state.selectedFiles.includes(filePath)
        const newSelectedFiles = isSelected
          ? state.selectedFiles.filter(f => f !== filePath)
          : [...state.selectedFiles, filePath]
        
        return { selectedFiles: newSelectedFiles }
      }),
      
      selectAllFiles: () => set((state) => ({
        selectedFiles: state.searchResults.map(f => f.file_path)
      })),
      
      clearSelection: () => set({ selectedFiles: [] }),
      
      setSearching: (searching) => set({ isSearching: searching }),
      
      setSearchQuery: (query) => {
        set({ searchQuery: query })
      },
      
      setStats: (stats) => set({ stats }),
      
      // Settings Actions
      setSettings: (settings) => {
        console.log('🏪 Store - Setting settings:', settings)
        set({ settings })
      },
      
      setSettingsLoading: (loading) => set({ settingsLoading: loading }),
      
      loadSettings: async () => {
        set({ settingsLoading: true })
        try {
          console.log('🏪 Store - Loading settings...')
          const savedSettings = await window.electronAPI?.settings?.load()
          console.log('🏪 Store - Raw saved settings:', savedSettings)
          if (savedSettings) {
            const mergedSettings = { ...DEFAULT_SETTINGS, ...savedSettings }
            console.log('🏪 Store - Merged settings:', mergedSettings)
            console.log('🏪 Store - Enabled formats in merged:', mergedSettings.enabledFormats)
            set({ settings: mergedSettings })
          } else {
            console.log('🏪 Store - No saved settings found, using defaults')
            set({ settings: DEFAULT_SETTINGS })
          }
        } catch (error) {
          console.error('🏪 Store - Failed to load settings:', error)
        } finally {
          set({ settingsLoading: false })
        }
      },
      
      saveSettings: async (newSettings) => {
        try {
          const currentSettings = get().settings
          const updatedSettings = { ...currentSettings, ...newSettings }
          console.log('🏪 Store - Saving settings:')
          console.log('  - Current settings:', currentSettings)
          console.log('  - New settings:', newSettings)
          console.log('  - Updated settings:', updatedSettings)
          console.log('  - Enabled formats before save:', currentSettings.enabledFormats)
          console.log('  - Enabled formats after merge:', updatedSettings.enabledFormats)
          
          await window.electronAPI?.settings?.save(updatedSettings)
          set({ settings: updatedSettings })
          
          console.log('🏪 Store - Settings saved successfully!')
          console.log('🏪 Store - State updated, enabled formats:', updatedSettings.enabledFormats)
          
          return true
        } catch (error) {
          console.error('🏪 Store - Failed to save settings:', error)
          return false
        }
      },
      
      // Computed
      getSelectedFileItems: () => {
        const state = get()
        return state.searchResults.filter(f => state.selectedFiles.includes(f.file_path))
      }
    }),
    {
      name: 'app-store'
    }
  )
)