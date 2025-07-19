import React, { useState, useEffect } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
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
  Eye,
  EyeOff
} from 'lucide-react'

import { useApi } from '../hooks/useApi'
import { useSettings } from '../hooks/useSettings'
import { SupportedFormatsResponse, FormatCategory } from '../types'

interface SettingsData {
  // 搜索设置
  defaultSearchType: 'exact' | 'fuzzy' | 'path' | 'hybrid'
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
  defaultSearchType: 'hybrid',
  searchResultLimit: 1000,
  fuzzyThreshold: 30,
  searchDebounce: 150,
  autoSearch: true,
  
  theme: 'system',
  language: 'zh',
  listDensity: 'comfortable',
  showFileSize: true,
  showLastModified: true,
  showContentPreview: true,
  
  enabledCategories: ['documents', 'programming', 'web', 'config', 'shell', 'docs', 'build'],
  enabledFormats: [],
  
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
  const { settings, saveSettings, loadSettings } = useSettings()
  const [localSettings, setLocalSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [isOpen, setIsOpen] = useState(false)
  const [formatsData, setFormatsData] = useState<SupportedFormatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const { getSupportedFormats } = useApi()

  // 同步设置数据
  useEffect(() => {
    if (isOpen) {
      setLocalSettings({ ...DEFAULT_SETTINGS, ...settings })
    }
  }, [isOpen, settings])

  // 加载格式数据
  useEffect(() => {
    const loadFormats = async () => {
      if (!isOpen) return
      
      setLoading(true)
      try {
        const formats = await getSupportedFormats()
        setFormatsData(formats)
        
        // 如果是第一次加载，设置默认启用的格式
        if (!settings?.enabledFormats?.length && formats.success) {
          const defaultFormats = [
            ...formats.categories.documents?.formats || [],
            ...formats.categories.programming?.formats || [],
            ...formats.categories.web?.formats || [],
            ...formats.categories.config?.formats || [],
            ...formats.categories.docs?.formats || []
          ]
          const updatedSettings = {
            ...localSettings,
            enabledFormats: defaultFormats
          }
          setLocalSettings(updatedSettings)
        }
      } catch (error) {
        console.error('Failed to load formats:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadFormats()
  }, [isOpen, getSupportedFormats])

  // 保存设置
  const handleSave = async () => {
    try {
      await saveSettings(localSettings)
      onSettingsChange?.(localSettings)
      setIsOpen(false)
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

  // 格式管理函数
  const toggleCategory = (categoryKey: string) => {
    const category = formatsData?.categories[categoryKey]
    if (!category) return

    const isEnabled = localSettings.enabledCategories.includes(categoryKey)
    
    if (isEnabled) {
      // 禁用分类：从启用分类中移除，并移除该分类的所有格式
      updateSetting('enabledCategories', localSettings.enabledCategories.filter(c => c !== categoryKey))
      updateSetting('enabledFormats', localSettings.enabledFormats.filter(f => !category.formats.includes(f)))
    } else {
      // 启用分类：添加到启用分类，并添加该分类的所有格式
      updateSetting('enabledCategories', [...localSettings.enabledCategories, categoryKey])
      updateSetting('enabledFormats', [...new Set([...localSettings.enabledFormats, ...category.formats])])
    }
  }

  const toggleFormat = (format: string) => {
    const isEnabled = localSettings.enabledFormats.includes(format)
    
    if (isEnabled) {
      updateSetting('enabledFormats', localSettings.enabledFormats.filter(f => f !== format))
    } else {
      updateSetting('enabledFormats', [...localSettings.enabledFormats, format])
    }
  }

  const selectAllFormats = () => {
    if (!formatsData) return
    updateSetting('enabledFormats', formatsData.supported_formats)
    updateSetting('enabledCategories', Object.keys(formatsData.categories))
  }

  const deselectAllFormats = () => {
    updateSetting('enabledFormats', [])
    updateSetting('enabledCategories', [])
  }

  // 获取图标组件
  const getIconComponent = (iconName: string) => {
    const icons: { [key: string]: any } = {
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
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            应用设置
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
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

          {/* 搜索设置 */}
          <TabsContent value="search" className="space-y-4">
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
                      onValueChange={(value) => updateSetting('defaultSearchType', value as any)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exact">精确匹配</SelectItem>
                        <SelectItem value="fuzzy">模糊匹配</SelectItem>
                        <SelectItem value="path">路径匹配</SelectItem>
                        <SelectItem value="hybrid">混合匹配</SelectItem>
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
                      max="10000"
                    />
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
          <TabsContent value="display" className="space-y-4">
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
                      onValueChange={(value) => updateSetting('theme', value as any)}
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
                      onValueChange={(value) => updateSetting('language', value as any)}
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
                      onValueChange={(value) => updateSetting('listDensity', value as any)}
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
          <TabsContent value="files" className="space-y-4">
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
                  {formatsData && (
                    <Badge variant="secondary" className="ml-auto">
                      已启用: {localSettings.enabledFormats.length} / {formatsData.total_count}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">加载文件格式中...</div>
                  </div>
                ) : formatsData ? (
                  <div className="space-y-6">
                    {Object.entries(formatsData.categories).map(([categoryKey, category]) => {
                      const IconComponent = getIconComponent(category.icon)
                      const isCategoryEnabled = localSettings.enabledCategories.includes(categoryKey)
                      const enabledInCategory = category.formats.filter(f => localSettings.enabledFormats.includes(f)).length
                      
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
                              <Badge variant="outline">
                                {enabledInCategory}/{category.count}
                              </Badge>
                              <Switch
                                checked={isCategoryEnabled}
                                onCheckedChange={() => toggleCategory(categoryKey)}
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-6 gap-2">
                            {category.formats.map(format => {
                              const isEnabled = localSettings.enabledFormats.includes(format)
                              const description = formatsData.format_descriptions[format] || format.toUpperCase()
                              
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
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-muted-foreground">无法加载文件格式数据</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 服务设置 */}
          <TabsContent value="server" className="space-y-4">
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
          <TabsContent value="advanced" className="space-y-4">
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
                      max="1000"
                    />
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

        <div className="flex justify-between pt-4">
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