import React, { useCallback } from 'react'
import { 
  FolderOpen, 
  RefreshCw, 
  Copy, 
  Trash2, 
  Settings,
  CheckSquare,
  MessageCircle
} from 'lucide-react'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { useAppStore } from '../stores/app-store'
import { useApi } from '../hooks/useApi'
import { SettingsDialog } from './SettingsDialog'
import { SearchBar } from './SearchBar'

interface ToolbarProps {
  onSelectDirectory: () => void
  onCopyFiles: () => void
  onDeleteFiles: () => void
  onOpenChatAssistant: () => void
  onSearch?: (query: string, type: string) => void
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onSelectDirectory,
  onCopyFiles,
  onDeleteFiles,
  onOpenChatAssistant,
  onSearch
}) => {
  const { 
    isBackendRunning, 
    selectedFiles,
    searchResults,
    selectAllFiles,
    clearSelection,
    setStats
  } = useAppStore()
  
  const { getStats } = useApi()

  const handleRefreshStats = useCallback(async () => {
    if (!isBackendRunning) return

    try {
      const stats = await getStats()
      setStats(stats)
    } catch (error) {
      console.error('Failed to refresh stats:', error)
    }
  }, [isBackendRunning, getStats, setStats])

  const handleSelectAll = useCallback(() => {
    if (selectedFiles.length === searchResults.length) {
      // 如果已全选，则取消全选
      clearSelection()
    } else {
      // 否则全选
      selectAllFiles()
    }
  }, [selectedFiles.length, searchResults.length, selectAllFiles, clearSelection])

  const isAllSelected = searchResults.length > 0 && selectedFiles.length === searchResults.length

  return (
    <div className="toolbar flex items-center justify-between px-2 py-1 bg-card border-b border-border">
      {/* Left section - Search Bar */}
      <div className="flex-1">
        <SearchBar onSearch={onSearch} />
      </div>

      {/* Center section - Operation Buttons */}
      <div className="flex items-center space-x-1 mx-4">
        {/* Directory operations */}
        <Button
          variant="outline"
          size="sm"
          onClick={onSelectDirectory}
          disabled={!isBackendRunning}
          className="h-7 px-2 text-xs"
        >
          <FolderOpen className="h-3 w-3 mr-1" />
          添加目录
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshStats}
          disabled={!isBackendRunning}
          className="h-7 px-2 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          刷新
        </Button>

        <Separator orientation="vertical" className="h-5" />

        {/* Selection operations */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          disabled={searchResults.length === 0}
          className="h-7 px-2 text-xs"
        >
          <CheckSquare className="h-3 w-3 mr-1" />
          {isAllSelected ? '取消全选' : '全选'}
        </Button>

        <Separator orientation="vertical" className="h-5" />

        {/* File operations */}
        <Button
          variant="outline"
          size="sm"
          onClick={onCopyFiles}
          disabled={selectedFiles.length === 0}
          className="h-7 px-2 text-xs"
        >
          <Copy className="h-3 w-3 mr-1" />
          导出 ({selectedFiles.length})
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onDeleteFiles}
          disabled={selectedFiles.length === 0}
          className="h-7 px-2 text-xs"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          删除 ({selectedFiles.length})
        </Button>
      </div>

      {/* Right section */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        {/* Smart Assistant */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenChatAssistant}
          disabled={!isBackendRunning}
          className="h-7 px-2 text-xs"
        >
          <MessageCircle className="h-3 w-3 mr-1" />
          智能助手
        </Button>

        {/* Settings */}
        <SettingsDialog>
          <Button variant="outline" size="sm" className="h-7 px-2">
            <Settings className="h-3 w-3" />
          </Button>
        </SettingsDialog>
      </div>
    </div>
  )
}