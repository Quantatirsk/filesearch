import React, { useEffect, useState } from 'react'
import { useAppStore } from '../stores/app-store'
import { Progress } from './ui/progress'
import { FileText } from 'lucide-react'

interface StatusBarProps {
  isIndexing?: boolean
  showProgressCard?: boolean
  onToggleProgress?: () => void
}

export const StatusBar: React.FC<StatusBarProps> = ({ 
  isIndexing = false, 
  showProgressCard = false, 
  onToggleProgress 
}) => {
  const { 
    searchResults, 
    selectedFiles, 
    isSearching, 
    searchQuery,
    isBackendRunning,
    stats
  } = useAppStore()

  // Local state for indexing progress
  const [indexingStats, setIndexingStats] = useState<{
    processed: number
    total: number
    status: string
  } | null>(null)

  // Fetch indexing progress when indexing is active
  useEffect(() => {
    if (!isIndexing) {
      setIndexingStats(null)
      return
    }

    const fetchProgress = async () => {
      try {
        const response = await fetch('http://localhost:8001/api/indexing/progress')
        if (response.ok) {
          const data = await response.json()
          setIndexingStats({
            processed: data.processed,
            total: data.total,
            status: data.status
          })
        }
      } catch (error) {
        console.error('Failed to fetch progress in StatusBar:', error)
      }
    }

    // Poll every 1 second
    const interval = setInterval(fetchProgress, 1000)
    fetchProgress() // Initial call

    return () => clearInterval(interval)
  }, [isIndexing])

  const getStatusText = () => {
    if (!isBackendRunning) {
      return '后端服务未运行'
    }
    
    if (isSearching) {
      return '搜索中...'
    }
    
    if (searchQuery && searchResults.length > 0) {
      return `搜索结果: ${searchResults.length} 个文件`
    }
    
    if (searchQuery && searchResults.length === 0) {
      return '搜索结果: 0 个文件'
    }
    
    return `已索引 ${stats?.document_count || 0} 个文档`
  }

  return (
    <div className="status-bar flex items-center justify-between px-4 py-1 bg-card border-t border-border text-xs">
      <div className="flex items-center space-x-4">
        <span className="text-muted-foreground">
          {getStatusText()}
        </span>
        
        {selectedFiles.length > 0 && (
          <span className="text-primary">
            已选择 {selectedFiles.length} 个文件
          </span>
        )}

        {/* Indexing Progress Badge */}
        {isIndexing && indexingStats && (
          <button
            onClick={onToggleProgress}
            className="flex items-center space-x-1 px-2 py-0.5 text-xs rounded-sm bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
            title={showProgressCard ? "收起详细进度" : "展开详细进度"}
          >
            <FileText className="h-3 w-3" />
            <span>索引中 {indexingStats.processed}/{indexingStats.total}</span>
            <div className="w-12">
              <Progress 
                value={indexingStats.total > 0 ? (indexingStats.processed / indexingStats.total) * 100 : 0} 
                className="h-0.5"
              />
            </div>
          </button>
        )}
      </div>
      
      <div className="flex items-center space-x-4">
        <div className={`flex items-center space-x-1 ${isBackendRunning ? 'text-chart-2' : 'text-destructive'}`}>
          <div className={`w-2 h-2 rounded-full ${isBackendRunning ? 'bg-chart-2' : 'bg-destructive'}`} />
          <span>{isBackendRunning ? '服务运行中' : '服务已停止'}</span>
        </div>
        
        {stats && (
          <span className="text-muted-foreground">
            v1.0.0
          </span>
        )}
      </div>
    </div>
  )
}