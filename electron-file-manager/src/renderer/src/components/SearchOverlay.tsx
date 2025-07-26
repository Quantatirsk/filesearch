import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { useSearch } from '../hooks/useSearch'
import { useAppStore } from '../stores/app-store'

interface SearchOverlayProps {
  isVisible: boolean
  onClose: () => void
  onOpenChatAssistant?: (query: string) => void
  onSearchAndOpenMain?: (query: string, searchType: SearchMode) => void
}

type SearchMode = 'quick' | 'smart' | 'exact' | 'path' | 'fuzzy' | 'hybrid'

const searchModes: { value: SearchMode; label: string; description: string }[] = [
  { value: 'quick', label: '快速搜索', description: '智能分词搜索' },
  { value: 'smart', label: '智能搜索', description: 'AI辅助搜索' },
  { value: 'exact', label: '精确搜索', description: '完全匹配' },
  { value: 'path', label: '路径搜索', description: '搜索文件路径' },
  { value: 'fuzzy', label: '模糊搜索', description: '相似度匹配' },
  { value: 'hybrid', label: '混合搜索', description: '多种方式结合' }
]

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ isVisible, onClose, onOpenChatAssistant, onSearchAndOpenMain }) => {
  const [query, setQuery] = useState('')
  const [selectedMode, setSelectedMode] = useState<SearchMode>('quick')
  const [isSearching, setIsSearching] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isFocused, setIsFocused] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  
  const { performImmediateSearch } = useSearch()
  const { isBackendRunning, searchResults, setSearchResults } = useAppStore()
  
  
  // 启动时加载设置
  useEffect(() => {
    if (isVisible && inputRef.current) {
      // 通知主进程渲染完成，可以显示窗口了
      window.electronAPI?.searchOverlay?.notifyReady?.()
      
      // 聚焦输入框
      inputRef.current.focus()
      setQuery('')
      setActiveIndex(0)
    }
  }, [isVisible])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible) return

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          onClose()
          break
        case 'Tab':
          e.preventDefault()
          // Cycle through search modes
          const currentIndex = searchModes.findIndex(mode => mode.value === selectedMode)
          const nextIndex = (currentIndex + 1) % searchModes.length
          setSelectedMode(searchModes[nextIndex].value)
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex(prev => Math.max(0, prev - 1))
          break
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex(prev => Math.min(searchResults.length - 1, prev + 1))
          break
        case 'Enter':
          if (!isComposing) {
            e.preventDefault()
            executeSearch()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, selectedMode, query, searchResults, activeIndex, isComposing, onClose])

  // Do not close overlay when clicking outside - only close on ESC key

  const executeSearch = useCallback(async () => {
    if (!query.trim() || !isBackendRunning) return
    
    const searchQuery = query.trim()
    const currentMode = selectedMode
    
    // For search window mode - hide immediately then execute
    if (onSearchAndOpenMain) {
      console.log('Using onSearchAndOpenMain for mode:', currentMode)
      // Hide search window immediately for better UX
      onClose()
      // Then execute the search
      onSearchAndOpenMain(searchQuery, currentMode)
      return
    }
    
    // Fallback for normal overlay mode (not search window)
    if (currentMode === 'smart') {
      // Hide immediately for better UX
      onClose()
      // Then open chat assistant
      onOpenChatAssistant?.(searchQuery)
      return
    }
    
    // For other search modes in normal overlay - hide first then search
    onClose()
    setIsSearching(true)
    try {
      await performImmediateSearch(searchQuery, currentMode)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsSearching(false)
    }
  }, [query, selectedMode, isBackendRunning, performImmediateSearch, onOpenChatAssistant, onClose, onSearchAndOpenMain])

  const handleInputChange = useCallback((value: string) => {
    setQuery(value)
    setActiveIndex(0)
    // Clear previous results when input changes
    if (!value.trim()) {
      setSearchResults([])
    }
  }, [setSearchResults])

  const clearSearch = useCallback(() => {
    setQuery('')
    setSearchResults([])
    setActiveIndex(0)
    inputRef.current?.focus()
  }, [setSearchResults])

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true)
  }, [])

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false)
  }, [])


  if (!isVisible) return null

  return (
    <div 
      ref={overlayRef}
      className={`flex items-center rounded-2xl w-full h-14 px-4 box-border transition-all duration-300 backdrop-blur-3xl ${
        isFocused 
          ? 'bg-white/90 dark:bg-white/10 border border-gray-400/80 dark:border-gray-300/60' 
          : 'bg-white/70 dark:bg-white/5 border border-gray-200/40 dark:border-white/15'
      }`}
      style={{ 
        margin: 0,
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)'
      }}
    >
      <Search className="text-gray-500 dark:text-gray-300 flex-shrink-0" size={18} />
      
      <input
        ref={inputRef}
        type="text"
        placeholder={isBackendRunning ? "搜索内容..." : "请先启动后端服务..."}
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={!isBackendRunning}
        className="flex-1 h-full px-3 bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 text-sm font-medium"
      />

      <div className="flex items-center gap-2 flex-shrink-0">
        {query && (
          <button 
            onClick={clearSearch}
            className="p-1.5 rounded-full hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
          >
            <X size={16} className="text-gray-500 dark:text-gray-300" />
          </button>
        )}
        
        {isSearching && (
          <div className="p-1.5">
            <Loader2 className="text-gray-600 dark:text-gray-300 animate-spin" size={16} />
          </div>
        )}
        
        {!isSearching && (
          <div 
            className={`px-3 py-2.5 rounded-xl backdrop-blur-3xl transition-all duration-300 ${
              isFocused
                ? 'bg-white/80 dark:bg-white/15 border border-gray-300/60 dark:border-gray-400/40'
                : 'bg-white/60 dark:bg-white/8 border border-gray-200/30 dark:border-white/20'
            }`}
            style={{
              backdropFilter: 'blur(40px) saturate(180%)',
              WebkitBackdropFilter: 'blur(40px) saturate(180%)'
            }}
          >
            <div className="flex items-center gap-1.5 h-full">
              {isBackendRunning && (
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  tab
                </span>
              )}
              <span className={`text-xs font-medium whitespace-nowrap transition-colors duration-300 ${
                isFocused
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-800 dark:text-gray-100'
              }`}>
                {searchModes.find(mode => mode.value === selectedMode)?.label}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}