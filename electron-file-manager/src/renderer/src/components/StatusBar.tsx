import React from 'react'
import { useAppStore } from '../stores/app-store'

export const StatusBar: React.FC = () => {
  const { 
    searchResults, 
    selectedFiles, 
    isSearching, 
    searchQuery,
    isBackendRunning,
    stats
  } = useAppStore()

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
      </div>
      
      <div className="flex items-center space-x-4">
        <div className={`flex items-center space-x-1 ${isBackendRunning ? 'text-green-600' : 'text-red-600'}`}>
          <div className={`w-2 h-2 rounded-full ${isBackendRunning ? 'bg-green-600' : 'bg-red-600'}`} />
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