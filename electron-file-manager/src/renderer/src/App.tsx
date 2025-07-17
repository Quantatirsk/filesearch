import React, { useRef, useCallback, useEffect } from 'react'
import { SearchBar } from './components/SearchBar'
import { FileList } from './components/FileList'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { useAppStore } from './stores/app-store'
import { useApi } from './hooks/useApi'

function App() {
  const fileListRef = useRef<HTMLDivElement>(null)
  
  const { 
    selectedFiles, 
    isBackendRunning,
    setCurrentDirectory, 
    clearSelection,
    setBackendRunning,
    setStats
  } = useAppStore()
  
  const { indexDirectory, getStats } = useApi()

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
              // 刷新统计信息
              const stats = await getStats()
              setStats(stats)
            } else {
              console.error('Auto-indexing failed:', result.error)
            }
          } catch (error) {
            console.error('Auto-indexing error:', error)
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
      const destination = await window.electronAPI.files.selectDirectory()
      if (destination) {
        const result = await window.electronAPI.files.copy(selectedFiles, destination)
        if (result.success) {
          clearSelection()
        }
      }
    } catch (error) {
      console.error('Failed to copy files:', error)
    }
  }, [selectedFiles, clearSelection])

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

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Toolbar */}
      <Toolbar
        onSelectDirectory={handleSelectDirectory}
        onCopyFiles={handleCopyFiles}
        onDeleteFiles={handleDeleteFiles}
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
    </div>
  )
}

export default App