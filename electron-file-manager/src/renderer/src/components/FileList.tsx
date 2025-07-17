import React, { useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FileItem } from '../types'
import { useAppStore } from '../stores/app-store'
import { formatFileSize, formatDate, getFileIcon } from '../lib/utils'
import { cn } from '../lib/utils'

interface FileListProps {
  containerRef: React.RefObject<HTMLDivElement>
}

export const FileList: React.FC<FileListProps> = React.memo(({ containerRef }) => {
  // 精确选择需要的状态，避免不必要的重新渲染
  const searchResults = useAppStore(state => state.searchResults)
  const selectedFiles = useAppStore(state => state.selectedFiles)
  const toggleFileSelection = useAppStore(state => state.toggleFileSelection)
  const selectAllFiles = useAppStore(state => state.selectAllFiles)
  const clearSelection = useAppStore(state => state.clearSelection)
  const isBackendRunning = useAppStore(state => state.isBackendRunning)

  // 正确使用 useVirtualizer hook
  const virtualizer = useVirtualizer({
    count: searchResults.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 56, // Estimated row height
    overscan: 10
  })

  const handleItemClick = useCallback((filePath: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + click for multi-select
      toggleFileSelection(filePath)
    } else if (event.shiftKey && selectedFiles.length > 0) {
      // Shift + click for range select
      const lastSelected = selectedFiles[selectedFiles.length - 1]
      const lastIndex = searchResults.findIndex(f => f.file_path === lastSelected)
      const currentIndex = searchResults.findIndex(f => f.file_path === filePath)
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeFiles = searchResults.slice(start, end + 1).map(f => f.file_path)
        
        // Add range to selection
        const newSelection = [...new Set([...selectedFiles, ...rangeFiles])]
        useAppStore.setState({ selectedFiles: newSelection })
      }
    } else {
      // Normal click - single select
      useAppStore.setState({ selectedFiles: [filePath] })
    }
  }, [selectedFiles, searchResults, toggleFileSelection])

  const handleOpenFile = useCallback(async (filePath: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    
    console.log('Opening file:', filePath)
    
    try {
      const result = await window.electronAPI.files.openFile(filePath)
      console.log('Open file result:', result)
      
      if (!result.success) {
        throw new Error(result.message)
      }
    } catch (error) {
      console.error('Failed to open file:', error)
      // 如果直接打开失败，则尝试在资源管理器中显示
      try {
        const fallbackResult = await window.electronAPI.files.openInExplorer(filePath)
        console.log('Fallback explorer result:', fallbackResult)
        
        if (fallbackResult.success) {
          console.log('File shown in explorer as fallback')
        } else {
          console.error('Both open methods failed:', fallbackResult.message)
          alert(`无法打开文件: ${fallbackResult.message}`)
        }
      } catch (fallbackError) {
        console.error('Failed to open in explorer:', fallbackError)
        alert(`无法打开文件: ${fallbackError}`)
      }
    }
  }, [])

  const handleOpenDirectory = useCallback(async (filePath: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    
    console.log('Opening directory for file:', filePath)
    
    try {
      const result = await window.electronAPI.files.openInExplorer(filePath)
      console.log('Open directory result:', result)
      
      if (!result.success) {
        alert(`无法打开目录: ${result.message}`)
      }
    } catch (error) {
      console.error('Failed to open directory:', error)
      alert(`无法打开目录: ${error}`)
    }
  }, [])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) {
      if (event.key === 'a') {
        event.preventDefault()
        selectAllFiles()
      }
    }
    
    if (event.key === 'Escape') {
      clearSelection()
    }
  }, [selectAllFiles, clearSelection])

  // 进一步优化FileRow组件，减少不必要的重新渲染
  const FileRow = React.memo(({ file, isSelected, onItemClick, onOpenFile, onOpenDirectory }: { 
    file: FileItem; 
    isSelected: boolean;
    onItemClick: (filePath: string, event: React.MouseEvent) => void;
    onOpenFile: (filePath: string, event: React.MouseEvent) => void;
    onOpenDirectory: (filePath: string, event: React.MouseEvent) => void;
  }) => {
    return (
      <div
        className={cn(
          "file-item flex items-center px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors",
          isSelected && "selected bg-primary/10 border-l-2 border-primary"
        )}
        onClick={(e) => {
          // 只在点击空白区域时选择文件
          if (e.target === e.currentTarget) {
            onItemClick(file.file_path, e)
          }
        }}
        style={{ userSelect: 'none' }}
      >
    
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        <div className="text-2xl flex-shrink-0">
          {getFileIcon(file.file_type)}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* 文件名 - 可点击打开文件 */}
          <div className="font-medium text-sm truncate">
            <button
              className="text-left text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:underline w-full truncate"
              onClick={(e) => onOpenFile(file.file_path, e)}
              title={`点击打开: ${file.file_name}`}
            >
              {file.file_name}
            </button>
          </div>
          
          {/* 文件路径 - 可点击打开目录 */}
          <div className="text-xs text-muted-foreground truncate">
            <button
              className="text-left text-gray-500 hover:text-gray-700 hover:underline focus:outline-none focus:underline w-full truncate"
              onClick={(e) => onOpenDirectory(file.file_path, e)}
              title={`点击打开目录: ${file.file_path}`}
            >
              {file.file_path}
            </button>
          </div>
          
          {/* 内容预览 */}
          {file.content_preview && (
            <div className="text-xs text-muted-foreground mt-1 truncate">
              {file.content_preview}
            </div>
          )}
        </div>
        
        <div className="flex-shrink-0 text-right">
          <div className="text-xs text-muted-foreground">
            {formatFileSize(file.file_size)}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDate(file.last_modified)}
          </div>
          {file.match_score && (
            <div className="text-xs text-primary font-medium">
              {Math.round(file.match_score)}%
            </div>
          )}
        </div>
      </div>
    </div>
    )
  })

  const items = virtualizer.getVirtualItems()

  if (!isBackendRunning) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <div className="text-6xl mb-4">🔌</div>
          <div className="text-lg">Python后端服务未运行</div>
          <div className="text-sm">请先启动后端服务以开始搜索文件</div>
        </div>
      </div>
    )
  }

  if (searchResults.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <div className="text-lg">输入搜索关键词</div>
          <div className="text-sm">在搜索框中输入关键词，然后按Enter或点击搜索按钮</div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="file-list-container overflow-auto"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {items.map((virtualItem) => {
          const file = searchResults[virtualItem.index]
          const isSelected = selectedFiles.includes(file.file_path)
          
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`
              }}
            >
              <FileRow 
                file={file} 
                isSelected={isSelected} 
                onItemClick={handleItemClick}
                onOpenFile={handleOpenFile}
                onOpenDirectory={handleOpenDirectory}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
})

FileList.displayName = 'FileList'