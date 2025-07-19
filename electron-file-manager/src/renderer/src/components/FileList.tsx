import React, { useCallback, useMemo, useState } from 'react'
import { FileItem } from '../types'
import { useAppStore } from '../stores/app-store'
import { useApi } from '../hooks/useApi'
import { formatFileSize, formatDate, getFileIcon } from '../lib/utils'
import { cn } from '../lib/utils'
import { Checkbox } from './ui/checkbox'
import { PreviewDialog } from './PreviewDialog'
import { Button } from './ui/button'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
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
import { Input } from './ui/input'
import { 
  Eye, 
  ExternalLink, 
  Folder, 
  MoreHorizontal, 
  Copy, 
  Edit, 
  Trash2 
} from 'lucide-react'

interface FileListProps {
  containerRef: React.RefObject<HTMLDivElement>
}

export const FileList: React.FC<FileListProps> = React.memo(({ containerRef }) => {
  // API hooks
  const { removeFileFromIndex, updateFilePath } = useApi()
  
  // 精确选择需要的状态，避免不必要的重新渲染
  const searchResults = useAppStore(state => state.searchResults)
  const selectedFiles = useAppStore(state => state.selectedFiles)
  const toggleFileSelection = useAppStore(state => state.toggleFileSelection)
  const selectAllFiles = useAppStore(state => state.selectAllFiles)
  const clearSelection = useAppStore(state => state.clearSelection)
  const isBackendRunning = useAppStore(state => state.isBackendRunning)
  const searchQuery = useAppStore(state => state.searchQuery)

  // Preview dialog state
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  
  // Rename dialog state
  const [renameFilePath, setRenameFilePath] = useState<string | null>(null)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [newFileName, setNewFileName] = useState('')

  const handleCheckboxChange = useCallback((filePath: string, checked: boolean) => {
    if (checked) {
      // 添加到选中列表
      const newSelection = [...selectedFiles, filePath]
      useAppStore.setState({ selectedFiles: newSelection })
    } else {
      // 从选中列表移除
      const newSelection = selectedFiles.filter(f => f !== filePath)
      useAppStore.setState({ selectedFiles: newSelection })
    }
  }, [selectedFiles])

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

  const handlePreview = useCallback(async (filePath: string) => {
    console.log('Preview file:', filePath)
    setPreviewFilePath(filePath)
    setIsPreviewOpen(true)
  }, [])

  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false)
    setPreviewFilePath(null)
  }, [])

  // 文件操作处理函数
  const handleCopyFile = useCallback(async (filePath: string) => {
    try {
      console.log('📋 Copying file to clipboard:', filePath)
      // 使用系统剪贴板复制功能，类似 Ctrl+C / Cmd+C
      const result = await window.electronAPI.files.copyToClipboard([filePath])
      
      console.log('📋 Copy result:', result)
      
      if (result.success) {
        console.log('✅ Copy operation completed:', result.message)
        console.log('💡 You can now paste using Ctrl+V (Windows/Linux) or Cmd+V (macOS)')
        
        // 根据消息判断是否是真正的文件复制还是文本路径复制
        if (result.message.includes('file paths to clipboard as text')) {
          console.log('⚠️ Note: Files were copied as text paths, not as actual files')
          toast.success('文件路径已复制到剪贴板')
        } else {
          toast.success('文件已复制到剪贴板')
        }
      } else {
        console.error('❌ Failed to copy file to clipboard:', result.message)
        toast.error(`复制文件到剪贴板失败: ${result.message}`)
      }
    } catch (error) {
      console.error('❌ Failed to copy file to clipboard:', error)
      toast.error(`复制文件到剪贴板失败: ${error}`)
    }
  }, [])

  const handleRenameFile = useCallback(async (filePath: string) => {
    const fileName = filePath.split('/').pop() || ''
    setRenameFilePath(filePath)
    setNewFileName(fileName) // 包含完整文件名和扩展名
    setIsRenameOpen(true)
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
        
        // 更新搜索结果中的文件信息
        const updatedResults = searchResults.map(file => {
          if (file.file_path === renameFilePath) {
            return {
              ...file,
              file_path: newFilePath,
              file_name: newFullFileName
            }
          }
          return file
        })
        useAppStore.setState({ searchResults: updatedResults })
        
        // 如果文件在选中列表中，也要更新
        if (selectedFiles.includes(renameFilePath)) {
          const updatedSelection = selectedFiles.map(f => f === renameFilePath ? newFilePath : f)
          useAppStore.setState({ selectedFiles: updatedSelection })
        }
        
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
  }, [renameFilePath, newFileName, searchResults, selectedFiles, updateFilePath])

  const handleDeleteFile = useCallback(async (filePath: string) => {
    const confirmed = window.confirm(`确定要删除文件 "${filePath.split('/').pop()}" 吗？\n\n此操作不可撤销！`)
    
    if (!confirmed) {
      return
    }
    
    try {
      const result = await window.electronAPI.files.delete([filePath])
      
      if (result.success) {
        console.log('File deleted successfully:', filePath)
        
        // 同步删除数据库索引中的文件
        try {
          const removeResult = await removeFileFromIndex(filePath)
          if (removeResult.success) {
            console.log('File removed from database index successfully')
          } else {
            console.warn('Failed to remove file from database index:', removeResult.error)
          }
        } catch (dbError) {
          console.warn('Failed to remove file from database index:', dbError)
        }
        
        // 从搜索结果中移除已删除的文件
        const updatedResults = searchResults.filter(file => file.file_path !== filePath)
        useAppStore.setState({ searchResults: updatedResults })
        
        // 如果文件在选中列表中，也要移除
        if (selectedFiles.includes(filePath)) {
          const updatedSelection = selectedFiles.filter(f => f !== filePath)
          useAppStore.setState({ selectedFiles: updatedSelection })
        }
        
        toast.success('文件删除成功')
      } else {
        console.error('Failed to delete file:', result.message)
        toast.error(`删除文件失败: ${result.message}`)
      }
    } catch (error) {
      console.error('Failed to delete file:', error)
      toast.error(`删除文件失败: ${error}`)
    }
  }, [searchResults, selectedFiles, removeFileFromIndex])

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

  // 操作列组件
  const FileActions = React.memo(({ file }: { file: FileItem }) => (
    <div className="flex items-center space-x-0.5">
      {/* 预览按钮 */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => handlePreview(file.file_path)}
        title="预览文件内容"
      >
        <Eye className="h-4 w-4" />
      </Button>

      {/* 打开文件按钮 */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={(e) => handleOpenFile(file.file_path, e)}
        title="打开文件"
      >
        <ExternalLink className="h-4 w-4" />
      </Button>

      {/* 复制文件按钮 */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => handleCopyFile(file.file_path)}
        title="复制文件"
      >
        <Copy className="h-4 w-4" />
      </Button>

      {/* 更多操作菜单 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="更多操作"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => handleOpenDirectory(file.file_path, e)}>
            <Folder className="mr-2 h-4 w-4" />
            打开所在目录
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleRenameFile(file.file_path)}>
            <Edit className="mr-2 h-4 w-4" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => handleDeleteFile(file.file_path)}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ))

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
    <div className="h-full flex flex-col">
      {/* 表格容器 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedFiles.length === searchResults.length && searchResults.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      selectAllFiles()
                    } else {
                      clearSelection()
                    }
                  }}
                />
              </TableHead>
              <TableHead className="whitespace-nowrap">文件</TableHead>
              <TableHead className="w-16 whitespace-nowrap">类型</TableHead>
              <TableHead className="w-20 whitespace-nowrap">大小</TableHead>
              <TableHead className="w-28 whitespace-nowrap">修改时间</TableHead>
              <TableHead className="w-16 whitespace-nowrap">匹配度</TableHead>
              <TableHead className="w-36 whitespace-nowrap text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {searchResults.map((file) => {
              const isSelected = selectedFiles.includes(file.file_path)
              
              return (
                <TableRow
                  key={file.file_path}
                  className={cn(
                    "hover:bg-muted/50",
                    isSelected && "bg-primary/5"
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => handleCheckboxChange(file.file_path, checked as boolean)}
                    />
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="text-xl flex-shrink-0">
                        {getFileIcon(file.file_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {file.file_name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {file.file_path}
                        </div>
                        {file.content_preview && (
                          <div className="text-xs text-muted-foreground truncate mt-1 opacity-75">
                            {file.content_preview}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <span className="text-xs bg-secondary/50 px-2 py-1 rounded-md">
                      {file.file_type.toUpperCase()}
                    </span>
                  </TableCell>
                  
                  <TableCell className="text-xs text-muted-foreground">
                    {formatFileSize(file.file_size)}
                  </TableCell>
                  
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(file.last_modified)}
                  </TableCell>
                  
                  <TableCell>
                    {file.match_score && file.match_score < 100 ? (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md">
                        {Math.round(file.match_score)}%
                      </span>
                    ) : null}
                  </TableCell>
                  
                  <TableCell>
                    <FileActions file={file} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      
      {/* Preview Dialog */}
      <PreviewDialog
        filePath={previewFilePath}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        searchQuery={searchQuery}
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
    </div>
  )
})

FileList.displayName = 'FileList'