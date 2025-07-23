import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Search, Command, Loader2, FileIcon, FolderIcon } from 'lucide-react'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'
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
  
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  
  const { performImmediateSearch } = useSearch()
  const { isBackendRunning, searchResults, setSearchResults } = useAppStore()
  
  // 检测暗色模式
  const isDarkMode = document.documentElement.classList.contains('dark')
  
  // 通知主进程渲染完成并聚焦输入框
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

  // Close overlay when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isVisible, onClose])

  const executeSearch = useCallback(async () => {
    if (!query.trim() || !isBackendRunning) return
    
    // For search window mode, always use onSearchAndOpenMain to ensure proper IPC handling
    if (onSearchAndOpenMain) {
      console.log('Using onSearchAndOpenMain for mode:', selectedMode)
      onSearchAndOpenMain(query.trim(), selectedMode)
      return
    }
    
    // Fallback for normal overlay mode (not search window)
    if (selectedMode === 'smart') {
      onOpenChatAssistant?.(query.trim())
      onClose()
      return
    }
    
    // For other search modes in normal overlay
    setIsSearching(true)
    try {
      await performImmediateSearch(query.trim(), selectedMode)
      onClose()
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

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true)
  }, [])

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false)
  }, [])

  const handleFileClick = useCallback((filePath: string) => {
    window.electronAPI.files.openFile(filePath)
    onClose()
  }, [onClose])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent">
      <div 
        ref={overlayRef}
        className="w-full max-w-lg mx-4"
      >
        {/* Spotlight风格搜索框 */}
        <div className="rounded-3xl border bg-background shadow-lg">
          <div className="flex items-center px-4 py-3">
            <Search className="h-5 w-5 text-muted-foreground mr-3 flex-shrink-0" />
            <Input
              ref={inputRef}
              placeholder={isBackendRunning ? "搜索文件..." : "请先启动后端服务..."}
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              className="flex-1 text-base bg-transparent border-none shadow-none focus-visible:ring-0 focus:outline-none focus:ring-0 focus:border-none placeholder:text-muted-foreground p-0 h-auto"
              disabled={!isBackendRunning}
            />
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-3" />
            ) : (
              <Badge 
                variant="outline" 
                className="ml-3 text-xs"
              >
                {searchModes.find(mode => mode.value === selectedMode)?.label}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}