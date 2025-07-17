import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Search, Filter, Loader2 } from 'lucide-react'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { useAppStore } from '../stores/app-store'
import { useSearch } from '../hooks/useSearch'

interface SearchBarProps {
  onSearch?: (query: string, type: string) => void
}

export const SearchBar: React.FC<SearchBarProps> = React.memo(({ onSearch }) => {
  // 使用本地状态管理输入框，避免与搜索结果状态耦合
  const [inputValue, setInputValue] = useState('')
  const [searchType, setSearchType] = useState<'exact' | 'fuzzy' | 'path' | 'hybrid'>('hybrid')
  
  // 使用本地状态跟踪搜索状态，避免全局状态的影响
  const [localSearching, setLocalSearching] = useState(false)
  // 追踪中文输入法的组合状态
  const [isComposing, setIsComposing] = useState(false)
  const { performSearch, performImmediateSearch } = useSearch()
  const isBackendRunning = useAppStore(state => state.isBackendRunning)
  
  // 保持输入框焦点的引用
  const inputRef = useRef<HTMLInputElement>(null)
  
  // 确保输入框在搜索后保持焦点
  useEffect(() => {
    if (!localSearching && inputRef.current) {
      // 延迟确保DOM更新完成
      setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
    }
  }, [localSearching])

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value)
    // 移除自动搜索逻辑，只更新输入值
  }, [])

  const handleTypeChange = useCallback((type: string) => {
    const newType = type as 'exact' | 'fuzzy' | 'path' | 'hybrid'
    setSearchType(newType)
    // 移除自动搜索逻辑，只更新搜索类型
  }, [])

  // 执行搜索的统一方法
  const executeSearch = useCallback(() => {
    if (inputValue.trim() && isBackendRunning) {
      setLocalSearching(true)
      setTimeout(() => setLocalSearching(false), 200)
      performImmediateSearch(inputValue, searchType)
      onSearch?.(inputValue, searchType)
    }
  }, [inputValue, searchType, isBackendRunning, performImmediateSearch, onSearch])

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
    <div className="flex items-center gap-3 w-full">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          ref={inputRef}
          placeholder={isBackendRunning ? "搜索文件 (支持多个关键词，空格分隔) - 按Enter或点击搜索按钮..." : "请先启动Python后端服务..."}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className="pl-10 pr-10"
          disabled={localSearching || !isBackendRunning}
        />
        {localSearching ? (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin" />
        ) : (
          <Button
            size="sm"
            onClick={executeSearch}
            disabled={!inputValue.trim() || !isBackendRunning}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 px-3"
          >
            <Search className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      <Select value={searchType} onValueChange={handleTypeChange} disabled={!isBackendRunning}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hybrid">混合搜索</SelectItem>
          <SelectItem value="exact">精确搜索</SelectItem>
          <SelectItem value="fuzzy">模糊搜索</SelectItem>
          <SelectItem value="path">路径搜索</SelectItem>
        </SelectContent>
      </Select>

    </div>
  )
})

SearchBar.displayName = 'SearchBar'