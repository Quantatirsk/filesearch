import React, { useRef, useCallback, useEffect, useState } from 'react'
import { SearchBar } from './components/SearchBar'
import { FileList } from './components/FileList'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { FolderNameDialog } from './components/FolderNameDialog'
import { ChatAssistant } from './components/ChatAssistant'
import { Toaster } from './components/ui/sonner'
import { toast } from 'sonner'
import { useAppStore } from './stores/app-store'
import { useApi } from './hooks/useApi'

function App() {
  const fileListRef = useRef<HTMLDivElement>(null)
  const [showFolderDialog, setShowFolderDialog] = useState(false)
  const [pendingCopyData, setPendingCopyData] = useState<{
    files: string[]
    baseDirectory: string
    suggestedName: string
  } | null>(null)
  
  // Chat Assistant state
  const [isChatAssistantOpen, setIsChatAssistantOpen] = useState(false)
  const [isChatAssistantMinimized, setIsChatAssistantMinimized] = useState(false)
  
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

  // 启动时加载设置
  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // 启动时自动启动后端服务
  useEffect(() => {
    const initializeBackend = async () => {
      try {
        console.log('Auto starting backend service...')
        const result = await window.electronAPI.python.start()
        if (result.success) {
          setBackendRunning(true)
          console.log('Backend service started successfully')
          
          // 后端启动成功后，立即加载统计信息
          setTimeout(async () => {
            try {
              console.log('Loading initial stats...')
              const stats = await getStats()
              if (stats) {
                setStats(stats)
                console.log('Initial stats loaded:', stats)
              } else {
                console.log('Stats response is empty, setting default values')
                // 设置默认的空统计信息
                setStats({
                  success: true,
                  document_count: 0,
                  total_content_size: 0,
                  database_size: 0,
                  file_types: {}
                })
              }
            } catch (error) {
              console.error('Failed to load initial stats:', error)
              // 设置默认的空统计信息
              setStats({
                success: true,
                document_count: 0,
                total_content_size: 0,
                database_size: 0,
                file_types: {}
              })
            }
          }, 2000) // 增加等待时间确保后端完全启动
        } else {
          console.error('Failed to start backend:', result.error)
          setBackendRunning(false)
          // 后端启动失败时也设置默认统计信息
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
        console.error('Failed to initialize backend:', error)
        setBackendRunning(false)
        // 初始化失败时也设置默认统计信息
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
  }, [setBackendRunning, getStats, setStats])

  const handleSelectDirectory = useCallback(async () => {
    try {
      const directory = await window.electronAPI.files.selectDirectory()
      if (directory) {
        setCurrentDirectory(directory)
        
        // 自动索引选中的目录
        if (isBackendRunning) {
          console.log('Auto-indexing directory:', directory)
          try {
            const result = await indexDirectory({
              directory: directory,
              force: false,
              workers: 4
            })
            
            if (result.success) {
              console.log(`Auto-indexed ${result.indexed_files} files`)
              toast.success(`成功索引 ${result.indexed_files} 个文件`)
              // 刷新统计信息
              const stats = await getStats()
              setStats(stats)
            } else {
              console.error('Auto-indexing failed:', result.error)
              toast.error(`索引失败: ${result.error}`)
            }
          } catch (error) {
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
      // 调试：检查搜索关键词
      console.log('DEBUG: searchQuery value:', searchQuery)
      console.log('DEBUG: searchQuery type:', typeof searchQuery)
      console.log('DEBUG: searchQuery exists:', !!searchQuery)
      
      // 生成基于搜索关键词的目录名
      let folderName = 'copied_files' // 默认名称
      if (searchQuery && searchQuery.trim()) {
        // 清理搜索关键词，移除特殊字符，用下划线替换空格
        folderName = searchQuery.trim()
          .replace(/[<>:"/\\|?*]/g, '') // 移除Windows不允许的字符
          .replace(/\s+/g, '_') // 用下划线替换空格
          .slice(0, 100) // 限制长度
        console.log('DEBUG: Generated folderName:', folderName)
      } else {
        console.log('DEBUG: Using default folderName because searchQuery is empty or falsy')
      }
      
      // 让用户选择基目录
      const baseDirectory = await window.electronAPI.files.selectDirectory()
      if (baseDirectory) {
        // 设置待处理的导出数据并显示对话框
        setPendingCopyData({
          files: selectedFiles,
          baseDirectory,
          suggestedName: folderName
        })
        setShowFolderDialog(true)
      }
    } catch (error) {
      console.error('Failed to copy files:', error)
      toast.error(`导出文件时发生错误：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }, [selectedFiles, searchQuery])

  const handleFolderNameConfirm = useCallback(async (folderName: string) => {
    if (!pendingCopyData) return
    
    try {
      // 构建完整的目标路径
      const destination = `${pendingCopyData.baseDirectory}${pendingCopyData.baseDirectory.endsWith('/') || pendingCopyData.baseDirectory.endsWith('\\') ? '' : '/'}${folderName}`
      
      // 导出文件到目标目录
      const result = await window.electronAPI.files.copy(pendingCopyData.files, destination)
      if (result.success) {
        clearSelection()
        toast.success(`成功导出 ${pendingCopyData.files.length} 个文件到：${destination}`)
      } else {
        toast.error(`导出操作失败：${result.message}`)
      }
    } catch (error) {
      console.error('Failed to copy files:', error)
      toast.error(`导出文件时发生错误：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setShowFolderDialog(false)
      setPendingCopyData(null)
    }
  }, [pendingCopyData, clearSelection])

  const handleFolderNameCancel = useCallback(() => {
    setShowFolderDialog(false)
    setPendingCopyData(null)
  }, [])

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
    setIsChatAssistantOpen(true)
    setIsChatAssistantMinimized(false)
  }, [])

  const handleCloseChatAssistant = useCallback(() => {
    setIsChatAssistantOpen(false)
    setIsChatAssistantMinimized(false)
  }, [])

  const handleToggleMinimizeChatAssistant = useCallback(() => {
    setIsChatAssistantMinimized(prev => !prev)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Toolbar */}
      <Toolbar
        onSelectDirectory={handleSelectDirectory}
        onCopyFiles={handleCopyFiles}
        onDeleteFiles={handleDeleteFiles}
        onOpenChatAssistant={handleOpenChatAssistant}
      />

      {/* Search Bar */}
      <div className="px-4 py-3 bg-card border-b border-border">
        <SearchBar onSearch={handleSearch} />
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* File List */}
        <div className="flex-1 overflow-hidden">
          <FileList containerRef={fileListRef} />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Folder Name Dialog */}
      <FolderNameDialog
        open={showFolderDialog}
        defaultName={pendingCopyData?.suggestedName || 'copied_files'}
        onConfirm={handleFolderNameConfirm}
        onCancel={handleFolderNameCancel}
      />

      {/* Chat Assistant */}
      <ChatAssistant
        isOpen={isChatAssistantOpen}
        onClose={handleCloseChatAssistant}
        onToggleMinimize={handleToggleMinimizeChatAssistant}
        isMinimized={isChatAssistantMinimized}
      />

      {/* Toast Notifications */}
      <Toaster position="top-right" duration={1000} />
    </div>
  )
}

export default App