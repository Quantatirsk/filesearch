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
  // 使用本地状态管理输入框，避免与搜索结果状态耦合
  const [inputValue, setInputValue] = useState('')
  const [searchType, setSearchType] = useState<'exact' | 'fuzzy' | 'path' | 'hybrid' | 'quick' | 'smart'>('quick')
  
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
    // 移除自动搜索逻辑，只更新输入值
  }, [])

  const handleTypeChange = useCallback((type: string) => {
    const newType = type as 'exact' | 'fuzzy' | 'path' | 'hybrid' | 'quick' | 'smart'
    setSearchType(newType)
    // 移除自动搜索逻辑，只更新搜索类型
  }, [])


  // 执行搜索的统一方法
  const executeSearch = useCallback(() => {
    if (inputValue.trim() && isBackendRunning) {
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
  }, [inputValue, searchType, isBackendRunning, performImmediateSearch, onSearch, onOpenChatAssistant])

  // 处理中文输入法的组合事件（现在只是为了兼容性，不触发搜索）
  const handleCompositionStart = useCallback(() => {
    setIsComposing(true)
  }, [])

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false)
    // 移除自动搜索逻辑
  }, [])

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
          placeholder={isBackendRunning ? "搜索文件 (支持多个关键词，空格分隔) - 按Enter或点击搜索按钮..." : "请先启动后端服务..."}
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