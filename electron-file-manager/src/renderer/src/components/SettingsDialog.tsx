import React, { useState, useEffect, useCallback } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogTrigger 
} from './ui/dialog'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Switch } from './ui/switch'
import { Separator } from './ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { 
  Search, 
  Monitor, 
  FileText, 
  Server, 
  Palette,
  Globe,
  Zap,
  Settings as SettingsIcon,
  Code,
  Terminal,
  BookOpen,
  Package,
  CheckCircle,
  Circle,
  Database,
  BarChart3,
  Trash2,
  PieChart
} from 'lucide-react'

import { useApi } from '../hooks/useApi'
import { useAppStore } from '../stores/app-store'
import { formatFileSize } from '../lib/utils'
import { toast } from 'sonner'

interface SettingsData {
  // 搜索设置
  defaultSearchType: 'exact' | 'fuzzy' | 'path' | 'hybrid' | 'quick' | 'smart'
  searchResultLimit: number
  fuzzyThreshold: number
  searchDebounce: number
  autoSearch: boolean
  
  // UI设置
  theme: 'light' | 'dark' | 'system'
  language: 'zh' | 'en'
  listDensity: 'compact' | 'comfortable'
  showFileSize: boolean
  showLastModified: boolean
  showContentPreview: boolean
  
  // 文件类型过滤 - 改进版
  enabledCategories: string[]
  enabledFormats: string[]
  
  // 后端设置
  serverPort: number
  workerCount: number
  autoStartBackend: boolean
  
  // 高级设置
  indexingBatchSize: number
  maxFileSize: number
  enableChineseTokenizer: boolean
}

const DEFAULT_SETTINGS: SettingsData = {
  defaultSearchType: 'quick',
  searchResultLimit: 9999,
  fuzzyThreshold: 60,
  searchDebounce: 150,
  autoSearch: false,
  
  theme: 'system',
  language: 'zh',
  listDensity: 'comfortable',
  showFileSize: true,
  showLastModified: true,
  showContentPreview: true,
  
  enabledCategories: ['text_files', 'archive_files'],
  enabledFormats: [
    // 文本文件类
    '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md', '.rtf', '.ppt', '.pptx', '.odt', '.ods', '.odp',
    '.epub', '.mobi', '.azw', '.azw3', '.fb2',
    '.log', '.tmp', '.bak', '.old', '.orig', '.backup',
    '.db', '.sqlite', '.sqlite3', '.mdb',
    // 压缩文件类
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.lz', '.lzma', '.z',
    '.dmg', '.iso', '.img', '.toast',
    '.pkg', '.deb', '.rpm', '.msi', '.exe', '.app'
  ],
  
  serverPort: 8001,
  workerCount: 8,
  autoStartBackend: true,
  
  indexingBatchSize: 1000,
  maxFileSize: 100, // MB
  enableChineseTokenizer: true
}

interface SettingsDialogProps {
  children: React.ReactNode
  onSettingsChange?: (settings: SettingsData) => void
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ 
  children, 
  onSettingsChange 
}) => {
  const { settings, saveSettings, stats, isBackendRunning, setStats, setSearchResults } = useAppStore()
  const [localSettings, setLocalSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [isOpen, setIsOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const { clearIndex, getStats } = useApi()

  // 同步设置数据
  useEffect(() => {
    if (isOpen) {
      console.log('📋 SettingsDialog - Syncing settings:')
      console.log('  - Settings from global store:', settings)
      console.log('  - Settings.enabledFormats:', settings.enabledFormats)
      // 直接使用全局store中的设置，如果字段不存在才使用默认值
      const syncedSettings = {
        ...DEFAULT_SETTINGS,
        ...settings,
        // 确保 enabledFormats 正确同步
        enabledFormats: settings.enabledFormats || DEFAULT_SETTINGS.enabledFormats
      }
      console.log('  - Synced settings:', syncedSettings)
      console.log('  - Final enabledFormats:', syncedSettings.enabledFormats)
      setLocalSettings(syncedSettings)
    }
  }, [isOpen, settings])

  // 首次使用时设置默认格式
  useEffect(() => {
    if (!isOpen) return
    
    // 只在用户首次使用且没有保存过任何设置时，才设置默认格式
    // 注意：永远不要覆盖用户已经保存的选择，即使是空数组
    if (settings.enabledFormats.length === 0) {
      console.log('📋 First time user, setting default formats')
      // 默认启用文本文件类和压缩文件类
      const defaultFormats = [
        ...staticCategories.text_files.formats.map(f => f.startsWith('.') ? f : `.${f}`),
        ...staticCategories.archive_files.formats.map(f => f.startsWith('.') ? f : `.${f}`)
      ]
      const updatedSettings = {
        ...localSettings,
        enabledFormats: defaultFormats,
        enabledCategories: ['text_files', 'archive_files']
      }
      console.log('📋 Setting default formats:', defaultFormats)
      setLocalSettings(updatedSettings)
    } else {
      console.log('📋 Using existing user settings, not setting defaults')
      console.log('  - settings object:', settings)
      console.log('  - enabledFormats:', settings?.enabledFormats)
    }
  }, [isOpen])

  // 保存设置
  const handleSave = async () => {
    try {
      console.log('💾 SettingsDialog - Saving settings...')
      console.log('  - Local settings to save:', localSettings)
      console.log('  - enabledFormats to save:', localSettings.enabledFormats)
      
      const saveResult = await saveSettings(localSettings)
      console.log('  - Save result:', saveResult)
      
      onSettingsChange?.(localSettings)
      console.log('  - onSettingsChange called with:', localSettings)
      
      setIsOpen(false)
      console.log('  - Dialog closed')
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  // 重置设置
  const handleReset = () => {
    setLocalSettings(DEFAULT_SETTINGS)
  }

  // 设置更新函数
  const updateSetting = <K extends keyof SettingsData>(
    key: K, 
    value: SettingsData[K]
  ) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }))
  }

  // 静态分类定义 - 5个分类
  const staticCategories = {
    text_files: {
      name: '文本文件类',
      description: '办公文件、文档、数据库等可读文本文件',
      icon: 'FileText',
      formats: [
        // 办公文件
        'pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md', 'rtf', 'ppt', 'pptx', 'odt', 'ods', 'odp',
        // 电子书
        'epub', 'mobi', 'azw', 'azw3', 'fb2',
        // 日志和备份文件
        'log', 'tmp', 'bak', 'old', 'orig', 'backup',
        // 数据库文件
        'db', 'sqlite', 'sqlite3', 'mdb'
      ]
    },
    media_files: {
      name: '多媒体类',
      description: '图片、音频、视频、字幕等媒体文件',
      icon: 'Monitor',
      formats: [
        // 图片
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif', 'raw',
        // 音频
        'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'ape',
        // 视频
        'mp4', 'avi', 'mov', 'wmv', 'mkv', 'webm', 'flv', 'm4v', '3gp',
        // 字幕
        'srt', 'vtt', 'ass', 'ssa', 'sub', 'sbv', 'lrc',
        // 字体
        'ttf', 'otf', 'woff', 'woff2', 'eot'
      ]
    },
    code_files: {
      name: '代码类',
      description: '编程语言源代码、脚本、配置文件、构建文件',
      icon: 'Code',
      formats: [
        // 编程语言
        'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'sass', 'less',
        'java', 'cpp', 'c', 'h', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'dart', 'scala',
        'vue', 'svelte', 'astro',
        // 脚本
        'sh', 'bash', 'zsh', 'fish', 'bat', 'ps1', 'cmd',
        // 配置文件（从文本类移过来）
        'json', 'xml', 'yml', 'yaml', 'toml', 'ini', 'env', 'conf', 'config', 'cfg', 'properties',
        // 构建和开发配置
        'makefile', 'dockerfile', 'gitignore', 'gitattributes', 'editorconfig',
        'cmake', 'gradle', 'maven', 'package', 'lock'
      ]
    },
    archive_files: {
      name: '压缩文件类',
      description: '各种压缩包和归档文件',
      icon: 'Package',
      formats: [
        // 压缩包
        'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'lz', 'lzma', 'z',
        // 磁盘镜像
        'dmg', 'iso', 'img', 'toast',
        // 安装包
        'pkg', 'deb', 'rpm', 'msi', 'exe', 'app'
      ]
    },
    other_files: {
      name: '其他',
      description: '泛指所有上述4个分类没有涵盖的文件类型',
      icon: 'Circle',
      formats: []  // 空数组，泛指所有其他类型
    }
  }

  // 格式管理函数
  const toggleCategory = (categoryKey: string) => {
    const category = staticCategories[categoryKey as keyof typeof staticCategories]
    if (!category) return

    const isEnabled = localSettings.enabledCategories.includes(categoryKey)
    
    if (isEnabled) {
      // 禁用分类：从启用分类中移除
      updateSetting('enabledCategories', localSettings.enabledCategories.filter(c => c !== categoryKey))
      
      // 如果不是"其他"类别，则移除该分类的所有格式
      if (categoryKey !== 'other_files') {
        const formatsWithDots = category.formats.map(f => f.startsWith('.') ? f : `.${f}`)
        updateSetting('enabledFormats', localSettings.enabledFormats.filter(f => !formatsWithDots.includes(f)))
      }
    } else {
      // 启用分类：添加到启用分类
      updateSetting('enabledCategories', [...localSettings.enabledCategories, categoryKey])
      
      // 如果不是"其他"类别，则添加该分类的所有格式
      if (categoryKey !== 'other_files') {
        const formatsWithDots = category.formats.map(f => f.startsWith('.') ? f : `.${f}`)
        updateSetting('enabledFormats', [...new Set([...localSettings.enabledFormats, ...formatsWithDots])])
      }
    }
  }

  const toggleFormat = (format: string) => {
    const formatWithDot = format.startsWith('.') ? format : `.${format}`
    const isEnabled = localSettings.enabledFormats.includes(formatWithDot)
    
    if (isEnabled) {
      updateSetting('enabledFormats', localSettings.enabledFormats.filter(f => f !== formatWithDot))
    } else {
      updateSetting('enabledFormats', [...localSettings.enabledFormats, formatWithDot])
    }
  }

  const selectAllFormats = () => {
    const allFormats: string[] = []
    const allCategories = Object.keys(staticCategories)
    
    allCategories.forEach(categoryKey => {
      const category = staticCategories[categoryKey as keyof typeof staticCategories]
      const formatsWithDots = category.formats.map(f => f.startsWith('.') ? f : `.${f}`)
      allFormats.push(...formatsWithDots)
    })
    
    updateSetting('enabledFormats', [...new Set(allFormats)])
    updateSetting('enabledCategories', allCategories)
  }

  const deselectAllFormats = () => {
    updateSetting('enabledFormats', [])
    updateSetting('enabledCategories', [])
  }

  // Check if all formats are selected (for "other all formats" logic)
  const isAllFormatsSelected = () => {
    const allFormats: string[] = []
    Object.values(staticCategories).forEach(category => {
      const formatsWithDots = category.formats.map(f => f.startsWith('.') ? f : `.${f}`)
      allFormats.push(...formatsWithDots)
    })
    const uniqueFormats = [...new Set(allFormats)]
    return localSettings.enabledFormats.length === uniqueFormats.length &&
           uniqueFormats.every(format => localSettings.enabledFormats.includes(format))
  }

  // 清空索引函数
  const handleClearIndex = useCallback(async () => {
    if (!isBackendRunning) {
      toast.error('后端服务未运行')
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
        
        toast.success('索引已成功清空')
      } else {
        console.error('Failed to clear index:', result.message)
        toast.error(`清空索引失败: ${result.message}`)
      }
    } catch (error) {
      console.error('Error clearing index:', error)
      toast.error(`清空索引失败: ${error}`)
    } finally {
      setIsClearing(false)
    }
  }, [isBackendRunning, clearIndex, getStats, setStats, setSearchResults])

  // 获取图标组件
  const getIconComponent = (iconName: string) => {
    const icons: { [key: string]: React.ComponentType<{ className?: string; size?: number | string }> } = {
      FileText,
      Code,
      Globe,
      Settings: SettingsIcon,
      Terminal,
      BookOpen,
      Package
    }
    return icons[iconName] || FileText
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-4rem)] h-[calc(100vh-4rem)] max-w-none flex flex-col overflow-hidden">
        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="flex-shrink-0 grid w-full grid-cols-6 mb-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              概览
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              搜索
            </TabsTrigger>
            <TabsTrigger value="display" className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              显示
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              文件
            </TabsTrigger>
            <TabsTrigger value="server" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              服务
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              高级
            </TabsTrigger>
          </TabsList>

          {/* 概览页签 */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto space-y-4 pb-4" style={{height: 0}}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 数据库统计 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    数据库统计
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">文档数量:</span>
                      <Badge variant="secondary">{stats?.document_count || 0}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">数据库大小:</span>
                      <Badge variant="outline">{formatFileSize(stats?.database_size || 0)}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">内容大小:</span>
                      <Badge variant="outline">{formatFileSize(stats?.total_content_size || 0)}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 快速操作 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    快速操作
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                  <div className="text-xs text-muted-foreground">
                    清空所有索引数据，此操作不可逆
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 文件类型分布 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  文件类型分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const fileTypeStats = stats?.file_types || {}
                  const totalFiles = Object.values(fileTypeStats).reduce((sum, count) => sum + count, 0)
                  
                  if (totalFiles === 0) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>暂无索引文件</p>
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-3">
                      {Object.entries(fileTypeStats).map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between">
                          <span className="flex items-center">
                            <FileText className="h-3 w-3 mr-2 text-muted-foreground" />
                            {type.toUpperCase()}
                          </span>
                          <div className="flex items-center space-x-3">
                            <Badge variant="secondary">{count}</Badge>
                            <div className="w-20 bg-secondary rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full" 
                                style={{ width: `${(count / totalFiles) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-8">
                              {Math.round((count / totalFiles) * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 搜索设置 */}
          <TabsContent value="search" className="flex-1 overflow-y-auto space-y-4 pb-4" style={{height: 0}}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  搜索行为设置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>默认搜索类型</Label>
                    <Select 
                      value={localSettings.defaultSearchType} 
                      onValueChange={(value) => updateSetting('defaultSearchType', value as 'exact' | 'fuzzy' | 'path' | 'hybrid' | 'quick' | 'smart')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quick">快速搜索</SelectItem>
                        <SelectItem value="smart">智能搜索</SelectItem>
                        <SelectItem value="exact">精确搜索</SelectItem>
                        <SelectItem value="path">路径搜索</SelectItem>
                        <SelectItem value="fuzzy">模糊搜索</SelectItem>
                        <SelectItem value="hybrid">混合搜索</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>搜索结果限制</Label>
                    <Input 
                      type="number"
                      value={localSettings.searchResultLimit}
                      onChange={(e) => updateSetting('searchResultLimit', Number(e.target.value))}
                      min="10"
                      max="9999"
                    />
                    <div className="text-xs text-muted-foreground">
                      设置为9999可实现大量结果搜索，返回大部分匹配结果
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>模糊搜索阈值 (%)</Label>
                    <Input 
                      type="number"
                      value={localSettings.fuzzyThreshold}
                      onChange={(e) => updateSetting('fuzzyThreshold', Number(e.target.value))}
                      min="0"
                      max="100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>搜索延迟 (ms)</Label>
                    <Input 
                      type="number"
                      value={localSettings.searchDebounce}
                      onChange={(e) => updateSetting('searchDebounce', Number(e.target.value))}
                      min="0"
                      max="1000"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={localSettings.autoSearch}
                    onCheckedChange={(checked) => updateSetting('autoSearch', checked)}
                  />
                  <Label>边输入边搜索</Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 显示设置 */}
          <TabsContent value="display" className="flex-1 overflow-y-auto space-y-4 pb-4" style={{height: 0}}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  外观设置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>主题</Label>
                    <Select 
                      value={localSettings.theme} 
                      onValueChange={(value) => updateSetting('theme', value as 'light' | 'dark' | 'system')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">浅色</SelectItem>
                        <SelectItem value="dark">深色</SelectItem>
                        <SelectItem value="system">跟随系统</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>界面语言</Label>
                    <Select 
                      value={localSettings.language} 
                      onValueChange={(value) => updateSetting('language', value as 'zh' | 'en')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zh">中文</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>列表密度</Label>
                    <Select 
                      value={localSettings.listDensity} 
                      onValueChange={(value) => updateSetting('listDensity', value as 'compact' | 'comfortable')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compact">紧凑</SelectItem>
                        <SelectItem value="comfortable">舒适</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>显示列</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={localSettings.showFileSize}
                        onCheckedChange={(checked) => updateSetting('showFileSize', checked)}
                      />
                      <Label>文件大小</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={localSettings.showLastModified}
                        onCheckedChange={(checked) => updateSetting('showLastModified', checked)}
                      />
                      <Label>修改时间</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={localSettings.showContentPreview}
                        onCheckedChange={(checked) => updateSetting('showContentPreview', checked)}
                      />
                      <Label>内容预览</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 文件设置 */}
          <TabsContent value="files" className="flex-1 overflow-y-auto space-y-4 pb-4" style={{height: 0}}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  文件格式管理
                </CardTitle>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={selectAllFormats}>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    全选
                  </Button>
                  <Button size="sm" variant="outline" onClick={deselectAllFormats}>
                    <Circle className="h-4 w-4 mr-1" />
                    全不选
                  </Button>
                  <div className="ml-auto flex gap-2">
                    {isAllFormatsSelected() && (
                      <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                        所有格式
                      </Badge>
                    )}
                    <Badge variant="secondary">
                      已启用: {localSettings.enabledFormats.length} / {(() => {
                        const allFormats: string[] = []
                        Object.values(staticCategories).forEach(category => {
                          allFormats.push(...category.formats)
                        })
                        return new Set(allFormats).size
                      })()}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-6">
                  {Object.entries(staticCategories).map(([categoryKey, category]) => {
                    const IconComponent = getIconComponent(category.icon)
                    const isCategoryEnabled = localSettings.enabledCategories.includes(categoryKey)
                    const formatsWithDots = category.formats.map(f => f.startsWith('.') ? f : `.${f}`)
                    const enabledInCategory = formatsWithDots.filter(f => localSettings.enabledFormats.includes(f)).length
                    
                    return (
                      <div key={categoryKey} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <IconComponent className="h-5 w-5" />
                            <div>
                              <h4 className="font-medium">{category.name}</h4>
                              <p className="text-sm text-muted-foreground">{category.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {categoryKey === 'other_files' ? (
                              <Badge variant="outline">
                                泛指所有其他
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                {enabledInCategory}/{category.formats.length}
                              </Badge>
                            )}
                            <Switch
                              checked={isCategoryEnabled}
                              onCheckedChange={() => toggleCategory(categoryKey)}
                            />
                          </div>
                        </div>
                        
                        {categoryKey === 'other_files' ? (
                          <div className="text-center py-4 text-muted-foreground">
                            <Circle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">此分类泛指所有上述4个分类没有涵盖的文件类型</p>
                            <p className="text-xs">启用此分类将包含所有其他未明确列出的格式</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-6 gap-2">
                            {category.formats.map(format => {
                              const formatWithDot = format.startsWith('.') ? format : `.${format}`
                              const isEnabled = localSettings.enabledFormats.includes(formatWithDot)
                              const description = format.toUpperCase()
                              
                              return (
                                <div
                                  key={format}
                                  className={`
                                    flex items-center justify-between p-2 rounded border cursor-pointer transition-colors
                                    ${isEnabled 
                                      ? 'bg-primary/10 border-primary/20 text-primary' 
                                      : 'bg-muted/50 border-border hover:bg-muted'
                                    }
                                  `}
                                  onClick={() => toggleFormat(format)}
                                  title={description}
                                >
                                  <span className="text-xs font-mono">{format.replace('.', '')}</span>
                                  {isEnabled ? (
                                    <CheckCircle className="h-3 w-3" />
                                  ) : (
                                    <Circle className="h-3 w-3" />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 服务设置 */}
          <TabsContent value="server" className="flex-1 overflow-y-auto space-y-4 pb-4" style={{height: 0}}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  后端服务设置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>服务端口</Label>
                    <Input 
                      type="number"
                      value={localSettings.serverPort}
                      onChange={(e) => updateSetting('serverPort', Number(e.target.value))}
                      min="1024"
                      max="65535"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>工作进程数</Label>
                    <Input 
                      type="number"
                      value={localSettings.workerCount}
                      onChange={(e) => updateSetting('workerCount', Number(e.target.value))}
                      min="1"
                      max="32"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={localSettings.autoStartBackend}
                    onCheckedChange={(checked) => updateSetting('autoStartBackend', checked)}
                  />
                  <Label>启动时自动启动后端服务</Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 高级设置 */}
          <TabsContent value="advanced" className="flex-1 overflow-y-auto space-y-4 pb-4" style={{height: 0}}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  高级设置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>索引批处理大小</Label>
                    <Input 
                      type="number"
                      value={localSettings.indexingBatchSize}
                      onChange={(e) => updateSetting('indexingBatchSize', Number(e.target.value))}
                      min="100"
                      max="10000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>最大文件大小 (MB)</Label>
                    <Input 
                      type="number"
                      value={localSettings.maxFileSize}
                      onChange={(e) => updateSetting('maxFileSize', Number(e.target.value))}
                      min="1"
                      max="10000"
                      disabled
                    />
                    <div className="text-xs text-muted-foreground">
                      ⚠️ 文件大小限制已禁用，所有文件都将被索引
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={localSettings.enableChineseTokenizer}
                    onCheckedChange={(checked) => updateSetting('enableChineseTokenizer', checked)}
                  />
                  <Label>启用中文分词器</Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex-shrink-0 flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={handleReset}>
            重置为默认值
          </Button>
          <div className="space-x-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>
              保存设置
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}