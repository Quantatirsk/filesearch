import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FileItem } from '../types'
import { useAppStore } from '../stores/app-store'
import { useApi } from '../hooks/useApi'
import { formatFileSize, formatDate, getFileIcon } from '../lib/utils'
import { cn } from '../lib/utils'
import { Checkbox } from './ui/checkbox'
import { PreviewDialog } from './PreviewDialog'
import { Button } from './ui/button'
import { toast } from 'sonner'
// Table components are no longer needed - using flex layout
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'
import { ScrollArea } from './ui/scroll-area'
import { Skeleton } from './ui/skeleton'
import { Input } from './ui/input'
import { 
  Eye, 
  ExternalLink, 
  Folder, 
  MoreHorizontal, 
  Copy, 
  Edit, 
  Trash2,
  Sparkles,
  RefreshCw,
  Bot
} from 'lucide-react'
import { FinalStreamingRenderer } from './FinalStreamingRenderer'

interface FileListProps {
  containerRef: React.RefObject<HTMLDivElement>
}

const ROW_HEIGHT = 46 // 调整行高到 46px，紧凑的间距

export const FileList: React.FC<FileListProps> = React.memo(({ containerRef }) => {
  // 虚拟化容器引用
  const virtualScrollRef = useRef<HTMLDivElement>(null)
  
  // API hooks
  const { removeFileFromIndex, updateFilePath, streamSummarizeFileContent } = useApi()
  
  // 优化状态选择 - 使用单一选择器减少重渲染
  const appState = useAppStore(useCallback((state) => ({
    searchResults: state.searchResults,
    selectedFiles: state.selectedFiles,
    isBackendRunning: state.isBackendRunning,
    searchQuery: state.searchQuery,
    selectAllFiles: state.selectAllFiles,
    clearSelection: state.clearSelection
  }), []))
  
  // 使用 Set 提升选中状态查找性能
  const selectedFilesSet = useMemo(() => 
    new Set(appState.selectedFiles), [appState.selectedFiles]
  )
  
  // 缓存是否全选状态
  const isAllSelected = useMemo(() => 
    appState.searchResults.length > 0 && appState.selectedFiles.length === appState.searchResults.length,
    [appState.searchResults.length, appState.selectedFiles.length]
  )
  
  // 虚拟化配置
  const virtualizer = useVirtualizer({
    count: appState.searchResults.length,
    getScrollElement: () => virtualScrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10, // 预渲染 10 行以提升滚动体验
  })

  // 动态计算滚动条宽度
  const [scrollbarWidth, setScrollbarWidth] = useState(0)
  
  useEffect(() => {
    if (virtualScrollRef.current) {
      const scrollbarWidth = virtualScrollRef.current.offsetWidth - virtualScrollRef.current.clientWidth
      setScrollbarWidth(scrollbarWidth)
    }
  }, [appState.searchResults.length])

  // 强制重新测量所有项目以应用新的行高
  useEffect(() => {
    virtualizer.measure()
  }, [ROW_HEIGHT, virtualizer])

  // Preview dialog state
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  
  // Rename dialog state
  const [renameFilePath, setRenameFilePath] = useState<string | null>(null)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  
  // Summary dialog state
  const [summaryFilePath, setSummaryFilePath] = useState<string | null>(null)
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)
  const [summaryStream, setSummaryStream] = useState<ReadableStream<string> | null>(null)
  const [isSummarizing, setIsSummarizing] = useState(false)

  // 优化复选框处理 - 不依赖 selectedFiles 状态
  const handleCheckboxChange = useCallback((filePath: string, checked: boolean) => {
    useAppStore.setState((state) => {
      if (checked) {
        // 添加到选中列表（避免重复）
        const newSelection = state.selectedFiles.includes(filePath) 
          ? state.selectedFiles 
          : [...state.selectedFiles, filePath]
        return { selectedFiles: newSelection }
      } else {
        // 从选中列表移除
        const newSelection = state.selectedFiles.filter(f => f !== filePath)
        return { selectedFiles: newSelection }
      }
    })
  }, [])

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
          toast.error(`无法打开文件: ${fallbackResult.message}`)
        }
      } catch (fallbackError) {
        console.error('Failed to open in explorer:', fallbackError)
        toast.error(`无法打开文件: ${fallbackError}`)
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
        toast.error(`无法打开目录: ${result.message}`)
      }
    } catch (error) {
      console.error('Failed to open directory:', error)
      toast.error(`无法打开目录: ${error}`)
    }
  }, [])

  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false)
    setPreviewFilePath(null)
  }, [])

  // 优化的事件处理函数，使用 useCallback 并移除依赖
  const handleSummarizeClick = useCallback((filePath: string) => {
    setSummaryStream(null)
    setSummaryFilePath(filePath)
    setIsSummaryOpen(true)
    setIsSummarizing(true)
    
    streamSummarizeFileContent(filePath)
      .then(stream => setSummaryStream(stream))
      .catch(error => {
        console.error('Failed to summarize file:', error)
        toast.error(`文件摘要生成失败: ${error}`)
        setIsSummarizing(false)
      })
  }, [streamSummarizeFileContent])

  // Auto-start analysis when dialog opens
  useEffect(() => {
    if (isSummaryOpen && summaryFilePath && !summaryStream && !isSummarizing) {
      handleSummarizeClick(summaryFilePath)
    }
  }, [isSummaryOpen, summaryFilePath, summaryStream, isSummarizing, handleSummarizeClick])

  const handleCloseSummary = useCallback(() => {
    setIsSummaryOpen(false)
    setSummaryFilePath(null)
    setSummaryStream(null)
    setIsSummarizing(false)
  }, [])

  const handleConfirmRename = useCallback(async () => {
    if (!renameFilePath || !newFileName.trim()) {
      return
    }
    
    try {
      const oldFileName = renameFilePath.split('/').pop() || ''
      const newFullFileName = newFileName.trim()
      
      const directory = renameFilePath.substring(0, renameFilePath.lastIndexOf('/'))
      const newFilePath = `${directory}/${newFullFileName}`
      
      // 检查新文件名是否与旧文件名相同
      if (newFullFileName === oldFileName) {
        setIsRenameOpen(false)
        setRenameFilePath(null)
        setNewFileName('')
        return
      }
      
      // 使用专门的 rename 操作来重命名文件
      const result = await window.electronAPI.files.rename(renameFilePath, newFilePath)
      
      if (result.success) {
        console.log('File renamed successfully:', renameFilePath, 'to', newFilePath)
        
        // 同步更新数据库索引中的文件路径
        try {
          const updateResult = await updateFilePath(renameFilePath, newFilePath)
          if (updateResult.success) {
            console.log('Database index updated successfully')
          } else {
            console.warn('Failed to update database index:', updateResult.error)
          }
        } catch (dbError) {
          console.warn('Failed to update database index:', dbError)
        }
        
        // 优化状态更新 - 使用函数式更新避免依赖
        useAppStore.setState((state) => {
          const updatedResults = state.searchResults.map(file => {
            if (file.file_path === renameFilePath) {
              return {
                ...file,
                file_path: newFilePath,
                file_name: newFullFileName
              }
            }
            return file
          })
          
          const updatedSelection = state.selectedFiles.includes(renameFilePath)
            ? state.selectedFiles.map(f => f === renameFilePath ? newFilePath : f)
            : state.selectedFiles
          
          return {
            searchResults: updatedResults,
            selectedFiles: updatedSelection
          }
        })
        
        toast.success('文件重命名成功')
      } else {
        console.error('Failed to rename file:', result.message)
        toast.error(`重命名文件失败: ${result.message}`)
      }
      
      setIsRenameOpen(false)
      setRenameFilePath(null)
      setNewFileName('')
    } catch (error) {
      console.error('Failed to rename file:', error)
      toast.error(`重命名文件失败: ${error}`)
    }
  }, [renameFilePath, newFileName, updateFilePath])


  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) {
      if (event.key === 'a') {
        event.preventDefault()
        appState.selectAllFiles()
      }
    }
    
    if (event.key === 'Escape') {
      appState.clearSelection()
    }
  }, [appState.selectAllFiles, appState.clearSelection])

  // 优化的事件处理函数，使用 useCallback 并移除依赖
  const handlePreviewClick = useCallback((filePath: string) => {
    console.log('Preview file:', filePath)
    setPreviewFilePath(filePath)
    setIsPreviewOpen(true)
  }, [])

  const handleCopyClick = useCallback(async (filePath: string) => {
    try {
      console.log('📋 Copying file to clipboard:', filePath)
      const result = await window.electronAPI.files.copyToClipboard([filePath])
      
      if (result.success) {
        if (result.message.includes('file paths to clipboard as text')) {
          toast.success('文件路径已复制到剪贴板')
        } else {
          toast.success('文件已复制到剪贴板')
        }
      } else {
        toast.error(`复制文件到剪贴板失败: ${result.message}`)
      }
    } catch (error) {
      console.error('❌ Failed to copy file to clipboard:', error)
      toast.error(`复制文件到剪贴板失败: ${error}`)
    }
  }, [])

  const handleRenameClick = useCallback((filePath: string) => {
    const fileName = filePath.split('/').pop() || ''
    setRenameFilePath(filePath)
    setNewFileName(fileName)
    setIsRenameOpen(true)
  }, [])

  const handleDeleteClick = useCallback(async (filePath: string) => {
    const confirmed = window.confirm(`确定要删除文件 "${filePath.split('/').pop()}" 吗？\\n\\n此操作不可撤销！`)
    
    if (!confirmed) return
    
    try {
      const result = await window.electronAPI.files.delete([filePath])
      
      if (result.success) {
        // 同步删除数据库索引
        try {
          await removeFileFromIndex(filePath)
        } catch (dbError) {
          console.warn('Failed to remove file from database index:', dbError)
        }
        
        // 优化状态更新 - 使用函数式更新避免依赖
        useAppStore.setState((state) => ({
          searchResults: state.searchResults.filter(file => file.file_path !== filePath),
          selectedFiles: state.selectedFiles.filter(f => f !== filePath)
        }))
        
        toast.success('文件删除成功')
      } else {
        toast.error(`删除文件失败: ${result.message}`)
      }
    } catch (error) {
      console.error('Failed to delete file:', error)
      toast.error(`删除文件失败: ${error}`)
    }
  }, [removeFileFromIndex])

  // 优化的行组件 - 使用 flex 布局替代表格，实现完全紧凑的布局
  const OptimizedTableCells = React.memo(({ 
    file, 
    isSelected, 
    onCheckboxChange 
  }: { 
    file: FileItem, 
    isSelected: boolean,
    onCheckboxChange: (filePath: string, checked: boolean) => void
  }) => (
    <>
      {/* 勾选框列 */}
      <div className="px-1 py-0.5 flex items-center justify-center border-r border-border/20">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onCheckboxChange(file.file_path, checked as boolean)}
        />
      </div>
      
      {/* 文件信息列 */}
      <div className="px-2 py-0.5 min-w-0 flex items-center border-r border-border/20">
        <div className="flex items-center space-x-1.5 min-w-0 w-full">
          <div className="text-sm flex-shrink-0">
            {getFileIcon(file.file_type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate leading-none">
              {file.file_name}
            </div>
            <div className="text-xs text-muted-foreground truncate leading-none opacity-70">
              {file.file_path}
            </div>
          </div>
        </div>
      </div>
      
      {/* 类型列 */}
      <div className="px-1 py-0.5 flex items-center justify-center border-r border-border/20">
        <span className="text-xs bg-secondary/50 px-1 py-0.5 rounded text-center">
          {file.file_type.toUpperCase()}
        </span>
      </div>
      
      {/* 大小列 */}
      <div className="text-xs text-muted-foreground px-1 py-0.5 flex items-center justify-center border-r border-border/20">
        {formatFileSize(file.file_size)}
      </div>
      
      {/* 修改时间列 */}
      <div className="text-xs text-muted-foreground px-1 py-0.5 flex items-center justify-center border-r border-border/20">
        {formatDate(file.last_modified)}
      </div>
      
      {/* 匹配度列 */}
      <div className="px-1 py-0.5 flex items-center justify-center border-r border-border/20">
        <span className="text-xs bg-primary/10 text-primary px-1 py-0.5 rounded">
          {file.match_score ? Math.round(file.match_score) : 100}%
        </span>
      </div>
      
      {/* 操作列 */}
      <div className="px-1 py-0.5 flex items-center justify-center">
        <FileActions filePath={file.file_path} />
      </div>
    </>
  ))

  // 操作列组件 - 移除所有依赖，只传递必要的props
  const FileActions = React.memo(({ filePath }: { filePath: string }) => (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center gap-0">
        {/* 预览按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => handlePreviewClick(filePath)}
            >
              <Eye className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>预览</p>
          </TooltipContent>
        </Tooltip>

        {/* AI解读按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => handleSummarizeClick(filePath)}
            >
              <Sparkles className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>AI速览</p>
          </TooltipContent>
        </Tooltip>

        {/* 打开文件按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => handleOpenFile(filePath, e)}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>打开</p>
          </TooltipContent>
        </Tooltip>

        {/* 复制文件按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => handleCopyClick(filePath)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>复制</p>
          </TooltipContent>
        </Tooltip>

        {/* 更多操作菜单 */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>更多操作</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => handleOpenDirectory(filePath, e)}>
              <Folder className="mr-2 h-4 w-4" />
              打开目录
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleRenameClick(filePath)}>
              <Edit className="mr-2 h-4 w-4" />
              重命名
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => handleDeleteClick(filePath)}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  ))

  if (!appState.isBackendRunning) {
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

  if (appState.searchResults.length === 0) {
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
    <div ref={containerRef} className="h-full flex flex-col">
      {/* 固定表头 - 使用与数据行相同的flex布局 */}
      <div className="flex-shrink-0 border-b bg-background sticky top-0 z-10">
        <div 
          className="w-full border-b border-border/30 grid"
          style={{ 
            height: '36px',
            gridTemplateColumns: '32px 1fr 80px 96px 128px 80px 160px', // 精确的列宽定义
            paddingRight: `${scrollbarWidth}px` // 动态为滚动条预留空间
          }}
        >
          {/* 勾选框列表头 */}
          <div className="px-1 py-0.5 flex items-center justify-center font-medium text-sm text-muted-foreground border-r border-border/20">
            <Checkbox
              checked={isAllSelected}
              onCheckedChange={(checked) => {
                if (checked) {
                  appState.selectAllFiles()
                } else {
                  appState.clearSelection()
                }
              }}
            />
          </div>
          
          {/* 文件信息列表头 */}
          <div className="px-2 py-0.5 flex items-center font-medium text-sm text-muted-foreground border-r border-border/20">
            文件
          </div>
          
          {/* 类型列表头 */}
          <div className="px-1 py-0.5 flex items-center justify-center font-medium text-sm text-muted-foreground border-r border-border/20">
            类型
          </div>
          
          {/* 大小列表头 */}
          <div className="px-1 py-0.5 flex items-center justify-center font-medium text-sm text-muted-foreground border-r border-border/20">
            大小
          </div>
          
          {/* 修改时间列表头 */}
          <div className="px-1 py-0.5 flex items-center justify-center font-medium text-sm text-muted-foreground border-r border-border/20">
            修改时间
          </div>
          
          {/* 匹配度列表头 */}
          <div className="px-1 py-0.5 flex items-center justify-center font-medium text-sm text-muted-foreground border-r border-border/20">
            匹配度
          </div>
          
          {/* 操作列表头 */}
          <div className="px-1 py-0.5 flex items-center justify-center font-medium text-sm text-muted-foreground">
            操作
          </div>
        </div>
      </div>
      
      {/* 虚拟化滚动容器 */}
      <div
        ref={virtualScrollRef}
        className="flex-1 overflow-auto virtualized-container"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const file = appState.searchResults[virtualItem.index]
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${ROW_HEIGHT}px`, // 强制使用当前的 ROW_HEIGHT
                  transform: `translateY(${virtualItem.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr 80px 96px 128px 80px 160px', // 与表头完全相同的列宽
                  borderBottom: '1px solid hsl(var(--border))',
                }}
                className={cn(
                  "hover:bg-muted/50",
                  selectedFilesSet.has(file.file_path) && "bg-primary/5"
                )}
              >
                <OptimizedTableCells
                  file={file}
                  isSelected={selectedFilesSet.has(file.file_path)}
                  onCheckboxChange={handleCheckboxChange}
                />
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Preview Dialog */}
      <PreviewDialog
        filePath={previewFilePath}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        searchQuery={appState.searchQuery}
      />
      
      {/* Rename Dialog */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名文件</DialogTitle>
            <DialogDescription>
              输入新的文件名（包含扩展名）
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="新文件名"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmRename()
                } else if (e.key === 'Escape') {
                  setIsRenameOpen(false)
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmRename} disabled={!newFileName.trim()}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* AI 解读弹窗 - 使用现代化设计 */}
      <Dialog open={isSummaryOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseSummary()
        }
      }}>
        <DialogContent className="w-[calc(100vw-4rem)] h-[calc(100vh-4rem)] max-w-none flex flex-col p-0 gap-0 [&>button]:hidden">
          <DialogHeader className="px-2 py-3 border-b flex-shrink-0">
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">AI速览</span>
                    {summaryFilePath && (
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                        <span className="text-base font-medium text-foreground">
                          {summaryFilePath.split('/').pop()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex-shrink-0">智能文档分析助手</span>
                    {summaryFilePath && (
                      <>
                        <span className="flex-shrink-0">•</span>
                        <div className="overflow-x-auto scrollbar-hide flex-1 min-w-0">
                          <span className="whitespace-nowrap inline-block">
                            {summaryFilePath}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              {/* 刷新按钮移到右侧 */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => summaryFilePath && handleSummarizeClick(summaryFilePath)}
                disabled={isSummarizing || !summaryFilePath}
                title="重新生成摘要"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 p-3 overflow-hidden">
            <ScrollArea className="h-full rounded-md border bg-muted/30">
              <div className="p-4">
                {summaryStream ? (
                  <FinalStreamingRenderer 
                    key={summaryFilePath}
                    stream={summaryStream} 
                    className=""
                    placeholder="AI正在分析文件内容..."
                    onComplete={() => setIsSummarizing(false)}
                    autoScroll={true}
                  />
                ) : isSummarizing ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                      <span className="text-muted-foreground text-sm">AI正在深度分析文件内容...</span>
                    </div>
                    
                    {/* 骨架屏效果 */}
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-[90%]" />
                      <Skeleton className="h-3 w-[95%]" />
                      <Skeleton className="h-3 w-[85%]" />
                      <div className="pt-3">
                        <Skeleton className="h-4 w-[40%] mb-2" />
                        <Skeleton className="h-3 w-[100%]" />
                        <Skeleton className="h-3 w-[88%]" />
                        <Skeleton className="h-3 w-[92%]" />
                      </div>
                      <div className="pt-3">
                        <Skeleton className="h-4 w-[35%] mb-2" />
                        <Skeleton className="h-3 w-[96%]" />
                        <Skeleton className="h-3 w-[80%]" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="mx-auto w-12 h-12 mb-3 rounded-full bg-muted flex items-center justify-center">
                      <Sparkles className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-base font-medium text-muted-foreground mb-1">
                      准备开始 AI 分析
                    </p>
                    <p className="text-xs text-muted-foreground">
                      点击"开始分析"按钮，让 AI 为您解读文件内容
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="px-3 py-2 border-t bg-muted/20 flex-shrink-0">
            <div className="flex items-center justify-end w-full">
              <Button 
                onClick={handleCloseSummary}
                className="min-w-[80px]"
              >
                关闭
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})

FileList.displayName = 'FileList'