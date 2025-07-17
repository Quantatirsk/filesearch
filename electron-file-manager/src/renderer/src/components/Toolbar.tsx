import React, { useCallback } from 'react'
import { 
  FolderOpen, 
  RefreshCw, 
  Copy, 
  Trash2, 
  Settings
} from 'lucide-react'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { useAppStore } from '../stores/app-store'
import { useApi } from '../hooks/useApi'
import { SettingsDialog } from './SettingsDialog'

interface ToolbarProps {
  onSelectDirectory: () => void
  onCopyFiles: () => void
  onDeleteFiles: () => void
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onSelectDirectory,
  onCopyFiles,
  onDeleteFiles
}) => {
  const { 
    isBackendRunning, 
    selectedFiles, 
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


  return (
    <div className="toolbar flex items-center justify-between px-4 py-2 bg-card border-b border-border">
      <div className="flex items-center space-x-2">

        {/* Directory operations */}
        <Button
          variant="outline"
          size="sm"
          onClick={onSelectDirectory}
          disabled={!isBackendRunning}
        >
          <FolderOpen className="h-4 w-4 mr-2" />
          添加目录
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshStats}
          disabled={!isBackendRunning}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          刷新
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* File operations */}
        <Button
          variant="outline"
          size="sm"
          onClick={onCopyFiles}
          disabled={selectedFiles.length === 0}
        >
          <Copy className="h-4 w-4 mr-2" />
          复制 ({selectedFiles.length})
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onDeleteFiles}
          disabled={selectedFiles.length === 0}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          删除 ({selectedFiles.length})
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        {/* Settings */}
        <SettingsDialog>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" />
          </Button>
        </SettingsDialog>
      </div>
    </div>
  )
}