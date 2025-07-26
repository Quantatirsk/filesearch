import React, { useRef, useCallback, useEffect, useState } from 'react'
import { FileList } from './components/FileList'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { ChatAssistant } from './components/ChatAssistant'
import { SearchOverlay } from './components/SearchOverlay'
import { Toaster } from './components/ui/sonner'
import { toast } from 'sonner'
import { useAppStore } from './stores/app-store'
import { useApi } from './hooks/useApi'
import { useSearch } from './hooks/useSearch'

function App() {
  const fileListRef = useRef<HTMLDivElement>(null)
  
  // Chat Assistant state
  const [isChatAssistantOpen, setIsChatAssistantOpen] = useState(false)
  const [chatAssistantInitialQuery, setChatAssistantInitialQuery] = useState<string | null>(null)
  
  // Search Overlay state
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false)
  const [isSearchWindow, setIsSearchWindow] = useState(false)
  
  // IPC search state - for filling main interface search bar
  const [ipcSearchQuery, setIpcSearchQuery] = useState<string>('')
  const [ipcSearchType, setIpcSearchType] = useState<'exact' | 'fuzzy' | 'path' | 'hybrid' | 'quick' | 'smart'>('quick')
  
  const { 
    selectedFiles, 
    isBackendRunning,
    searchQuery,
    setCurrentDirectory, 
    clearSelection,
    setBackendRunning,
    setStats,
    loadSettings
  } = useAppStore()
  
  const { indexDirectory, getStats } = useApi()
  const { performImmediateSearch } = useSearch()

  // 启动时加载设置
  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Setup global shortcut listener
  useEffect(() => {
    const cleanup1 = window.electronAPI.searchOverlay.onShow(() => {
      setIsSearchOverlayOpen(true)
    })
    
    const cleanup2 = window.electronAPI.searchOverlay.onSetSearchWindow?.((isSearch) => {
      setIsSearchWindow(isSearch)
    })
    
    return () => {
      cleanup1()
      cleanup2?.()
    }
  }, [])

  // Setup local keyboard shortcuts for testing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Local shortcut for search overlay (Ctrl+K / Cmd+K)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOverlayOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])


  // 启动时自动启动后端服务（仅主窗口）
  useEffect(() => {
    // 只有主窗口才进行后端初始化，搜索窗口跳过
    if (isSearchWindow) {
      console.log('[SearchWindow] Skipping backend initialization')
      return
    }
    
    const initializeBackend = async () => {
      try {
        console.log('[MainWindow] Auto starting backend service...')
        const result = await window.electronAPI.python.start()
        if (result.success) {
          setBackendRunning(true)
          console.log('[MainWindow] Backend service started successfully')
          
          // 后端启动成功后，加载统计信息
          try {
            console.log('🔍 [MainWindow] Loading initial stats from backend initialization...')
            const stats = await getStats()
            if (stats) {
              setStats(stats)
              console.log('✅ [MainWindow] Initial stats loaded successfully')
            } else {
              setStats({
                success: true,
                document_count: 0,
                total_content_size: 0,
                database_size: 0,
                file_types: {}
              })
            }
          } catch (error) {
            console.error('[MainWindow] Failed to load initial stats:', error)
            setStats({
              success: true,
              document_count: 0,
              total_content_size: 0,
              database_size: 0,
              file_types: {}
            })
          }
        } else {
          console.error('[MainWindow] Failed to start backend:', result)
          setBackendRunning(false)
          setStats({
            success: false,
            document_count: 0,
            total_content_size: 0,
            database_size: 0,
            file_types: {},
            error: 'Backend service failed to start'
          })
        }
      } catch (error) {
        console.error('[MainWindow] Failed to initialize backend:', error)
        setBackendRunning(false)
        setStats({
          success: false,
          document_count: 0,
          total_content_size: 0,
          database_size: 0,
          file_types: {},
          error: 'Failed to initialize backend'
        })
      }
    }

    initializeBackend()
  }, [isSearchWindow]) // 添加 isSearchWindow 依赖

  const handleSelectDirectory = useCallback(async () => {
    try {
      const directory = await window.electronAPI.files.selectDirectory()
      if (directory) {
        setCurrentDirectory(directory)
        
        // 自动索引选中的目录
        if (isBackendRunning) {
          console.log('Auto-indexing directory:', directory)
          
          // Show progress toast for long operations
          const progressToast = toast.loading('正在索引目录，大型目录可能需要几分钟时间...')
          
          try {
            const result = await indexDirectory({
              directory: directory,
              force: false,
              workers: 8  // Increased workers for better performance
            })
            
            // Dismiss the progress toast
            toast.dismiss(progressToast)
            
            if (result.success) {
              console.log(`Auto-indexed ${result.indexed_files} files`)
              toast.success(`成功索引 ${result.indexed_files} 个文件`, { duration: 5000 })
              // 刷新统计信息
              console.log('🔍 [App.tsx] Loading stats after directory indexing...')
              const stats = await getStats()
              setStats(stats)
              console.log('✅ [App.tsx] Stats refreshed after indexing')
            } else {
              console.error('Auto-indexing failed:', result.error)
              toast.error(`索引失败: ${result.error}`, { duration: 8000 })
            }
          } catch (error) {
            // Dismiss the progress toast
            toast.dismiss(progressToast)
            console.error('Auto-indexing error:', error)
            toast.error(`索引时发生错误: ${error}`)
          }
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error)
    }
  }, [setCurrentDirectory, isBackendRunning, indexDirectory, getStats, setStats])

  const handleCopyFiles = useCallback(async () => {
    if (selectedFiles.length === 0) return
    
    try {
      // 生成时间戳
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                       new Date().toTimeString().split(' ')[0].replace(/:/g, '-')
      
      // 获取桌面路径
      const desktopPath = await window.electronAPI.files.getDesktopPath()
      if (!desktopPath) {
        toast.error('无法获取桌面路径')
        return
      }
      
      // 生成基于搜索关键词的目录名
      let folderName = 'copied_files' // 默认名称
      if (searchQuery && searchQuery.trim()) {
        // 清理搜索关键词，移除特殊字符，用下划线替换空格
        folderName = searchQuery.trim()
          .replace(/[<>:"/\\|?*]/g, '') // 移除Windows不允许的字符
          .replace(/\s+/g, '_') // 用下划线替换空格
          .slice(0, 100) // 限制长度
      }
      
      const baseDir = `${desktopPath}/File_${folderName}_${timestamp}`
      
      // 创建基础目录
      await window.electronAPI.files.createDirectory(baseDir)
      
      // 直接复制文件到基础目录
      const result = await window.electronAPI.files.copy(selectedFiles, baseDir)
      
      if (result.success) {
        clearSelection()
        toast.success(`成功导出 ${selectedFiles.length} 个文件到桌面 File_${folderName}_${timestamp} 目录`)
      } else {
        toast.error(`导出操作失败：${result.message}`)
      }
    } catch (error) {
      console.error('Failed to copy files:', error)
      toast.error(`导出文件时发生错误：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }, [selectedFiles, searchQuery, clearSelection])


  const handleDeleteFiles = useCallback(async () => {
    if (selectedFiles.length === 0) return
    const confirmed = confirm(`确定要删除 ${selectedFiles.length} 个文件吗？`)
    if (!confirmed) return
    try {
      const result = await window.electronAPI.files.delete(selectedFiles)
      if (result.success) {
        clearSelection()
      }
    } catch (error) {
      console.error('Failed to delete files:', error)
    }
  }, [selectedFiles, clearSelection])

  const handleSearch = useCallback((query: string, type: string) => {
    console.log('Search performed:', { query, type })
  }, [])

  // Chat Assistant handlers
  const handleOpenChatAssistant = useCallback(() => {
    setChatAssistantInitialQuery(null)
    setIsChatAssistantOpen(true)
  }, [])

  const handleOpenChatAssistantWithQuery = useCallback((query: string) => {
    console.log('handleOpenChatAssistantWithQuery called with:', query)
    setChatAssistantInitialQuery(query)
    setIsChatAssistantOpen(true)
    console.log('Chat assistant should now be open with query:', query)
  }, [])

  const handleCloseChatAssistant = useCallback(() => {
    setIsChatAssistantOpen(false)
    setChatAssistantInitialQuery(null)
  }, [])

  const handleClearChatAssistant = useCallback(() => {
    setChatAssistantInitialQuery(null)
  }, [])

  // Search Overlay handlers
  const handleCloseSearchOverlay = useCallback(() => {
    setIsSearchOverlayOpen(false)
  }, [])

  // Listen for search requests from search window
  useEffect(() => {
    const { ipcRenderer } = window.electron
    
    const handlePerformSearch = async (event: any, query: string, searchType: string) => {
      console.log('Received perform-search IPC:', { query, searchType })
      if (query && searchType) {
        try {
          // 设置搜索参数到状态，这样SearchBar会自动填充
          console.log('Setting IPC search params:', { query, searchType })
          setIpcSearchQuery(query)
          setIpcSearchType(searchType as any)
          
          // 延迟清理状态，确保SearchBar有时间接收到新值
          setTimeout(() => {
            console.log('Clearing IPC search query')
            setIpcSearchQuery('')
          }, 500) // 增加延迟时间
          
          if (searchType === 'smart') {
            // Open chat assistant for smart search
            console.log('Opening chat assistant with query:', query)
            handleOpenChatAssistantWithQuery(query)
          } else {
            // Perform regular search
            console.log('Performing immediate search:', query, searchType)
            await performImmediateSearch(query, searchType as any)
          }
        } catch (error) {
          console.error('Error performing search from IPC:', error)
        }
      }
    }

    ipcRenderer.on('perform-search', handlePerformSearch)
    
    return () => {
      ipcRenderer.removeListener('perform-search', handlePerformSearch)
    }
  }, [performImmediateSearch, handleOpenChatAssistantWithQuery])

  // 设置搜索窗口的透明背景和清除所有边距/内边距
  useEffect(() => {
    if (isSearchWindow) {
      // 设置透明背景
      document.body.style.background = 'transparent'
      document.body.style.backgroundColor = 'transparent'
      document.documentElement.style.background = 'transparent'
      document.documentElement.style.backgroundColor = 'transparent'
      
      // 清除所有边距和内边距
      document.body.style.margin = '0'
      document.body.style.padding = '0'
      document.documentElement.style.margin = '0'
      document.documentElement.style.padding = '0'
      
      // 确保root元素也无边距
      const rootElement = document.getElementById('root')
      if (rootElement) {
        rootElement.style.margin = '0'
        rootElement.style.padding = '0'
        rootElement.style.background = 'transparent'
        rootElement.style.backgroundColor = 'transparent'
      }
      
      // 清理函数：组件卸载时或不再是搜索窗口时恢复原来的样式
      return () => {
        document.body.style.background = ''
        document.body.style.backgroundColor = ''
        document.documentElement.style.background = ''
        document.documentElement.style.backgroundColor = ''
        document.body.style.margin = ''
        document.body.style.padding = ''
        document.documentElement.style.margin = ''
        document.documentElement.style.padding = ''
        
        const rootElement = document.getElementById('root')
        if (rootElement) {
          rootElement.style.margin = ''
          rootElement.style.padding = ''
          rootElement.style.background = ''
          rootElement.style.backgroundColor = ''
        }
      }
    }
  }, [isSearchWindow])

  // If this is a search window, only show the search overlay
  if (isSearchWindow) {
    return (
      <SearchOverlay
        isVisible={true}
        onClose={() => {
          // Hide the window instead of closing it for faster reactivation
          window.electronAPI?.searchOverlay?.hide?.() || window.close()
        }}
        onOpenChatAssistant={async (query) => {
          try {
            // 智能搜索也通过IPC打开主界面
            console.log('Smart search via IPC:', query)
            const result = await window.electronAPI.searchOverlay.openMainWindow(query, 'smart')
            if (!result.success) {
              console.error('Failed to open main window for smart search:', result.error)
            }
          } catch (error) {
            console.error('Error opening main window for smart search:', error)
          }
          // Window is already hidden by executeSearch in SearchOverlay
        }}
        onSearchAndOpenMain={async (query, searchType) => {
          try {
            // 通过 IPC 打开主界面并执行搜索
            const result = await window.electronAPI.searchOverlay.openMainWindow(query, searchType)
            if (!result.success) {
              console.error('Failed to open main window:', result.error)
            }
          } catch (error) {
            console.error('Error opening main window:', error)
          }
          // Window is already hidden by executeSearch in SearchOverlay
        }}
      />
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Toolbar with integrated SearchBar */}
      <Toolbar
        onSelectDirectory={handleSelectDirectory}
        onCopyFiles={handleCopyFiles}
        onDeleteFiles={handleDeleteFiles}
        onOpenChatAssistant={handleOpenChatAssistant}
        onOpenChatAssistantWithQuery={handleOpenChatAssistantWithQuery}
        onSearch={handleSearch}
        ipcSearchQuery={ipcSearchQuery}
        ipcSearchType={ipcSearchType}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File List - Now takes full width */}
        <div className="flex-1 overflow-hidden">
          <FileList containerRef={fileListRef} />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />


      {/* Search Overlay */}
      <SearchOverlay
        isVisible={isSearchOverlayOpen}
        onClose={handleCloseSearchOverlay}
        onOpenChatAssistant={handleOpenChatAssistantWithQuery}
      />

      {/* Chat Assistant */}
      <ChatAssistant
        isOpen={isChatAssistantOpen}
        onClose={handleCloseChatAssistant}
        onClear={handleClearChatAssistant}
        initialQuery={chatAssistantInitialQuery}
      />

      {/* Toast Notifications */}
      <Toaster position="top-right" duration={1000} />
    </div>
  )
}

export default App