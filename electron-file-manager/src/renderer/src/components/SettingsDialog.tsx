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
  Settings as SettingsIcon
} from 'lucide-react'

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
  
  // 文件类型过滤
  supportedFileTypes: string[]
  enabledFileTypes: string[]
  
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
  
  supportedFileTypes: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md'],
  enabledFileTypes: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md'],
  
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
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [isOpen, setIsOpen] = useState(false)

  // 加载设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await window.electronAPI?.settings?.load()
        if (savedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    }
    loadSettings()
  }, [])

  // 保存设置
  const handleSave = async () => {
    try {
      await window.electronAPI?.settings?.save(settings)
      onSettingsChange?.(settings)
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  // 重置设置
  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  // 设置更新函数
  const updateSetting = <K extends keyof SettingsData>(
    key: K, 
    value: SettingsData[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
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
                      value={settings.defaultSearchType} 
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
                      value={settings.searchResultLimit}
                      onChange={(e) => updateSetting('searchResultLimit', Number(e.target.value))}
                      min="10"
                      max="10000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>模糊搜索阈值 (%)</Label>
                    <Input 
                      type="number"
                      value={settings.fuzzyThreshold}
                      onChange={(e) => updateSetting('fuzzyThreshold', Number(e.target.value))}
                      min="0"
                      max="100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>搜索延迟 (ms)</Label>
                    <Input 
                      type="number"
                      value={settings.searchDebounce}
                      onChange={(e) => updateSetting('searchDebounce', Number(e.target.value))}
                      min="0"
                      max="1000"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={settings.autoSearch}
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
                      value={settings.theme} 
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
                      value={settings.language} 
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
                      value={settings.listDensity} 
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
                        checked={settings.showFileSize}
                        onCheckedChange={(checked) => updateSetting('showFileSize', checked)}
                      />
                      <Label>文件大小</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={settings.showLastModified}
                        onCheckedChange={(checked) => updateSetting('showLastModified', checked)}
                      />
                      <Label>修改时间</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={settings.showContentPreview}
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
                  文件类型过滤
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Label>支持的文件类型</Label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {settings.supportedFileTypes.map(type => (
                    <div key={type} className="flex items-center space-x-2">
                      <Switch 
                        checked={settings.enabledFileTypes.includes(type)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            updateSetting('enabledFileTypes', [...settings.enabledFileTypes, type])
                          } else {
                            updateSetting('enabledFileTypes', settings.enabledFileTypes.filter(t => t !== type))
                          }
                        }}
                      />
                      <Badge variant="outline">{type.toUpperCase()}</Badge>
                    </div>
                  ))}
                </div>
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
                      value={settings.serverPort}
                      onChange={(e) => updateSetting('serverPort', Number(e.target.value))}
                      min="1024"
                      max="65535"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>工作进程数</Label>
                    <Input 
                      type="number"
                      value={settings.workerCount}
                      onChange={(e) => updateSetting('workerCount', Number(e.target.value))}
                      min="1"
                      max="32"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={settings.autoStartBackend}
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
                      value={settings.indexingBatchSize}
                      onChange={(e) => updateSetting('indexingBatchSize', Number(e.target.value))}
                      min="100"
                      max="10000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>最大文件大小 (MB)</Label>
                    <Input 
                      type="number"
                      value={settings.maxFileSize}
                      onChange={(e) => updateSetting('maxFileSize', Number(e.target.value))}
                      min="1"
                      max="1000"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={settings.enableChineseTokenizer}
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