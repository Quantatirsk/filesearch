import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { FileItem, SearchOptions, AppState, DatabaseStats } from '../types'

interface AppStore extends AppState {
  // Actions
  setBackendRunning: (running: boolean) => void
  setCurrentDirectory: (directory: string | null) => void
  setSearchResults: (results: FileItem[]) => void
  setSelectedFiles: (files: string[]) => void
  toggleFileSelection: (filePath: string) => void
  selectAllFiles: () => void
  clearSelection: () => void
  setSearching: (searching: boolean) => void
  setSearchQuery: (query: string) => void
  setStats: (stats: DatabaseStats | null) => void
  
  // Computed
  getSelectedFileItems: () => FileItem[]
}

export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      isBackendRunning: false,
      currentDirectory: null,
      searchResults: [],
      selectedFiles: [],
      isSearching: false,
      searchQuery: '',
      stats: null,

      // Actions
      setBackendRunning: (running) => set({ isBackendRunning: running }),
      
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