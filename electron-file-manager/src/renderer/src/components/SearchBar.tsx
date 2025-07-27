import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { useAppStore } from '../stores/app-store'
import { useSearch } from '../hooks/useSearch'

interface SearchBarProps {
  onSearch?: (query: string, type: string) => void
  onOpenChatAssistant?: (query: string) => void
  initialQuery?: string
  initialSearchType?: 'exact' | 'fuzzy' | 'path' | 'hybrid' | 'quick' | 'smart'
}

export const SearchBar: React.FC<SearchBarProps> = React.memo(({ onSearch, onOpenChatAssistant, initialQuery, initialSearchType }) => {
  // 获取设置中的默认搜索类型
  const settings = useAppStore(state => state.settings)
  
  // 使用本地状态管理输入框，避免与搜索结果状态耦合
  const [inputValue, setInputValue] = useState('')
  const [searchType, setSearchType] = useState<'exact' | 'fuzzy' | 'path' | 'hybrid' | 'quick' | 'smart'>(settings.defaultSearchType)
  
  // 使用本地状态跟踪搜索状态，避免全局状态的影响
  const [localSearching, setLocalSearching] = useState(false)
  // 追踪中文输入法的组合状态
  const [isComposing, setIsComposing] = useState(false)
  const { performImmediateSearch } = useSearch()
  const isBackendRunning = useAppStore(state => state.isBackendRunning)
  
  // 保持输入框焦点的引用
  const inputRef = useRef<HTMLInputElement>(null)
  // 跟踪是否正在设置外部值
  const isSettingExternalValue = useRef(false)
  // 自动搜索防抖定时器
  const autoSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 当设置中的默认搜索类型改变时，更新搜索类型（只在没有外部传入搜索类型时）
  useEffect(() => {
    if (initialSearchType === undefined) {
      setSearchType(settings.defaultSearchType)
    }
  }, [settings.defaultSearchType, initialSearchType])

  // 处理外部传入的初始查询和搜索类型
  useEffect(() => {
    if (initialQuery !== undefined && initialQuery !== '') {
      console.log('Setting initial query:', initialQuery)
      isSettingExternalValue.current = true
      setInputValue(initialQuery)
      // 设置查询值但不聚焦或选中文本，让用户专注于搜索结果
      setTimeout(() => {
        // 不自动聚焦，让用户专注于搜索结果而不是输入框
        isSettingExternalValue.current = false
      }, 100)
    }
    if (initialSearchType !== undefined) {
      console.log('Setting initial search type:', initialSearchType)
      setSearchType(initialSearchType)
    }
  }, [initialQuery, initialSearchType])
  
  // 组件卸载时清理自动搜索定时器
  useEffect(() => {
    return () => {
      if (autoSearchTimeoutRef.current) {
        clearTimeout(autoSearchTimeoutRef.current)
      }
    }
  }, [])
  
  // 移除自动聚焦逻辑 - 让用户在搜索完成后专注于结果而不是输入框
  // useEffect(() => {
  //   if (!localSearching && inputRef.current && !isSettingExternalValue.current) {
  //     // 只有在没有设置外部值时才重新聚焦
  //     setTimeout(() => {
  //       inputRef.current?.focus()
  //     }, 0)
  //   }
  // }, [localSearching])

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value)
    
    // 清理之前的自动搜索定时器
    if (autoSearchTimeoutRef.current) {
      clearTimeout(autoSearchTimeoutRef.current)
      autoSearchTimeoutRef.current = null
    }
    
    // 如果启用了边输入边搜索，则自动触发搜索
    if (settings.autoSearch && value.trim() && isBackendRunning) {
      // 智能搜索不支持自动搜索，跳过
      if (searchType === 'smart') {
        return
      }
      
      // 使用防抖进行自动搜索
      autoSearchTimeoutRef.current = setTimeout(() => {
        setLocalSearching(true)
        setTimeout(() => setLocalSearching(false), 200)
        
        performImmediateSearch(value.trim(), searchType)
        onSearch?.(value.trim(), searchType)
        
        // 执行搜索后让输入框失焦
        inputRef.current?.blur()
      }, settings.searchDebounce)
    }
  }, [settings.autoSearch, settings.searchDebounce, searchType, isBackendRunning, performImmediateSearch, onSearch])

  const handleTypeChange = useCallback((type: string) => {
    const newType = type as 'exact' | 'fuzzy' | 'path' | 'hybrid' | 'quick' | 'smart'
    setSearchType(newType)
    // 移除自动搜索逻辑，只更新搜索类型
  }, [])


  // 执行搜索的统一方法
  const executeSearch = useCallback(() => {
    if (inputValue.trim() && isBackendRunning) {
      // 调试：输出当前设置
      console.log('🔍 SearchBar Debug - Current settings:', {
        fuzzyThreshold: settings.fuzzyThreshold,
        searchResultLimit: settings.searchResultLimit,
        autoSearch: settings.autoSearch,
        defaultSearchType: settings.defaultSearchType
      })
      
      // 智能搜索：打开智能助手并传入查询
      if (searchType === 'smart') {
        onOpenChatAssistant?.(inputValue.trim())
        return
      }
      
      setLocalSearching(true)
      setTimeout(() => setLocalSearching(false), 200)
      
      // 执行搜索，搜索关键词会在 useSearch 中设置
      performImmediateSearch(inputValue.trim(), searchType)
      onSearch?.(inputValue.trim(), searchType)
      
      // 执行搜索后让输入框失焦
      inputRef.current?.blur()
    }
  }, [inputValue, searchType, isBackendRunning, performImmediateSearch, onSearch, onOpenChatAssistant, settings])

  // 处理中文输入法的组合事件（现在只是为了兼容性，不触发搜索）
  const handleCompositionStart = useCallback(() => {
    setIsComposing(true)
  }, [])

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false)
    
    // 中文输入法结束后，如果启用了自动搜索，触发搜索
    if (settings.autoSearch && inputValue.trim() && isBackendRunning && searchType !== 'smart') {
      // 清理之前的定时器
      if (autoSearchTimeoutRef.current) {
        clearTimeout(autoSearchTimeoutRef.current)
        autoSearchTimeoutRef.current = null
      }
      
      // 延迟触发搜索
      autoSearchTimeoutRef.current = setTimeout(() => {
        setLocalSearching(true)
        setTimeout(() => setLocalSearching(false), 200)
        
        performImmediateSearch(inputValue.trim(), searchType)
        onSearch?.(inputValue.trim(), searchType)
        
        inputRef.current?.blur()
      }, settings.searchDebounce)
    }
  }, [settings.autoSearch, settings.searchDebounce, inputValue, searchType, isBackendRunning, performImmediateSearch, onSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isComposing) {
      e.preventDefault()
      executeSearch()
    }
  }, [executeSearch, isComposing])

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3 w-3" />
        <Input
          ref={inputRef}
          placeholder={isBackendRunning 
            ? settings.autoSearch 
              ? "搜索文件 (支持多个关键词，空格分隔) - 边输入边搜索已启用" 
              : "搜索文件 (支持多个关键词，空格分隔) - 按Enter或点击搜索按钮..."
            : "请先启动后端服务..."
          }
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className="pl-8 pr-8 h-7 text-xs"
          disabled={localSearching || !isBackendRunning}
        />
        {localSearching ? (
          <Loader2 className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 animate-spin" />
        ) : (
          <Button
            size="sm"
            onClick={executeSearch}
            disabled={!inputValue.trim() || !isBackendRunning}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-5 px-1.5"
          >
            <Search className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      <Select value={searchType} onValueChange={handleTypeChange} disabled={!isBackendRunning}>
        <SelectTrigger className="w-24 h-7 text-xs">
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
  )
})

SearchBar.displayName = 'SearchBar'