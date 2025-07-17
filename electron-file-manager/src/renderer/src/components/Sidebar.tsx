import React, { useCallback, useState } from 'react'
import { FileText, Database, BarChart3, Trash2 } from 'lucide-react'
import { Separator } from './ui/separator'
import { Button } from './ui/button'
import { useAppStore } from '../stores/app-store'
import { useApi } from '../hooks/useApi'
import { formatFileSize } from '../lib/utils'

export const Sidebar: React.FC = () => {
  const { stats, isBackendRunning, setStats, setSearchResults } = useAppStore()
  const { clearIndex, getStats } = useApi()
  const [isClearing, setIsClearing] = useState(false)

  const fileTypeStats = stats?.file_types || {}
  const totalFiles = Object.values(fileTypeStats).reduce((sum, count) => sum + count, 0)

  const handleClearIndex = useCallback(async () => {
    if (!isBackendRunning) {
      alert('后端服务未运行')
      return
    }

    const confirmed = confirm('确定要清空所有索引数据吗？此操作不可逆！')
    if (!confirmed) return

    setIsClearing(true)
    try {
      console.log('Clearing index...')
      const result = await clearIndex()
      
      if (result.success) {
        console.log('Index cleared successfully:', result.message)
        
        // 清空成功后重新获取统计信息
        const newStats = await getStats()
        setStats(newStats)
        
        // 清空搜索结果
        setSearchResults([])
        
        alert('索引已成功清空')
      } else {
        console.error('Failed to clear index:', result.message)
        alert(`清空索引失败: ${result.message}`)
      }
    } catch (error) {
      console.error('Error clearing index:', error)
      alert(`清空索引失败: ${error}`)
    } finally {
      setIsClearing(false)
    }
  }, [isBackendRunning, clearIndex, getStats, setStats, setSearchResults])

  return (
    <div className="sidebar w-64 bg-card border-r border-border flex flex-col">
      {/* Database Stats */}
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold mb-3 flex items-center">
          <Database className="h-4 w-4 mr-2" />
          数据库统计
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">文档数量:</span>
            <span>{stats?.document_count || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">数据库大小:</span>
            <span>{formatFileSize(stats?.database_size || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">内容大小:</span>
            <span>{formatFileSize(stats?.total_content_size || 0)}</span>
          </div>
        </div>
      </div>

      {/* File Types */}
      <div className="p-4 flex-1 overflow-y-auto">
        <h3 className="text-sm font-semibold mb-3 flex items-center">
          <BarChart3 className="h-4 w-4 mr-2" />
          文件类型
        </h3>
        <div className="space-y-2">
          {Object.entries(fileTypeStats).map(([type, count]) => (
            <div key={type} className="flex items-center justify-between text-sm">
              <span className="flex items-center">
                <FileText className="h-3 w-3 mr-2 text-muted-foreground" />
                {type.toUpperCase()}
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-muted-foreground">{count}</span>
                <div className="w-16 bg-secondary rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full" 
                    style={{ width: `${(count / totalFiles) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-t border-border">
        <h3 className="text-sm font-semibold mb-3">快速操作</h3>
        <Button
          variant="destructive"
          size="sm"
          className="w-full justify-start"
          onClick={handleClearIndex}
          disabled={!isBackendRunning || isClearing}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {isClearing ? '清空中...' : '清空索引'}
        </Button>
      </div>
    </div>
  )
}