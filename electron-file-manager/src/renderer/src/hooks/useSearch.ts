import { useCallback, useRef } from 'react'
import { useApi } from './useApi'
import { useSettings } from './useSettings'
import { useAppStore } from '../stores/app-store'
import { debounce, parseMultiKeywords } from '../lib/utils'

export const useSearch = () => {
  const { search } = useApi()
  const { settings } = useSettings()
  const setSearchResults = useAppStore(state => state.setSearchResults)
  const setSearching = useAppStore(state => state.setSearching)
  const setSearchQuery = useAppStore(state => state.setSearchQuery)
  const isBackendRunning = useAppStore(state => state.isBackendRunning)

  const handleSearch = useCallback(async (query: string, type: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setSearchQuery('')
      return
    }

    // 检查后端是否运行
    if (!isBackendRunning) {
      console.warn('搜索失败: Python后端未运行')
      setSearchResults([])
      // 不清空搜索关键词，让用户知道他们之前搜索的是什么
      // setSearchQuery('')
      return
    }

    // 更新搜索查询字符串
    setSearchQuery(query)
    setSearching(true)
    
    try {
      // Parse multi-keywords for better search
      const keywords = parseMultiKeywords(query)
      const searchQuery = keywords.join(' ')
      
      const fileTypesToSend = settings.enabledFormats && settings.enabledFormats.length > 0 ? settings.enabledFormats : undefined
      
      const result = await search({
        query: searchQuery,
        search_type: type as 'exact' | 'fuzzy' | 'path' | 'hybrid',
        limit: 1000,
        min_fuzzy_score: 30.0,
        file_types: fileTypesToSend
      })


      if (result.success) {
        // 转换后端数据格式为前端FileItem格式
        const convertedResults = result.results.map((item: any) => {
          
          // 处理时间戳
          let lastModified = new Date().toISOString()
          if (item.last_modified) {
            // 如果是数字时间戳，需要检查是秒还是毫秒
            if (typeof item.last_modified === 'number') {
              // 如果时间戳小于 1e12，说明是秒级时间戳，需要转换为毫秒
              const timestamp = item.last_modified < 1e12 ? item.last_modified * 1000 : item.last_modified
              lastModified = new Date(timestamp).toISOString()
            } else if (typeof item.last_modified === 'string') {
              lastModified = item.last_modified
            }
          } else if (item.last_indexed) {
            lastModified = item.last_indexed
          }
          
          const converted = {
            id: item.file_path || item.id || Math.random().toString(36),
            file_path: item.file_path,
            file_name: item.file_name || item.file_path?.split('/').pop() || item.file_path?.split('\\').pop() || 'Unknown',
            file_size: item.file_size || 0,
            file_type: item.file_type || 'unknown',
            last_modified: lastModified,
            content_preview: '',
            match_score: item.match_score || item.fuzzy_score || 100
          }
          
          return converted
        })
        
        // 直接更新搜索结果，避免延迟影响用户交互
        setSearchResults(convertedResults)
      } else {
        console.error('Search failed:', result.error)
        setSearchResults([])
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [search, setSearchResults, setSearching, setSearchQuery, isBackendRunning, settings.enabledFormats])

  // Create stable debounced function using useRef
  const debouncedSearchRef = useRef<((query: string, type: string) => void) | null>(null)
  const handleSearchRef = useRef(handleSearch)
  handleSearchRef.current = handleSearch
  
  if (!debouncedSearchRef.current) {
    debouncedSearchRef.current = debounce((query: string, type: string) => {
      handleSearchRef.current(query, type)
    }, 150)
  }

  const performSearch = useCallback((query: string, type: string) => {
    debouncedSearchRef.current?.(query, type)
  }, [])

  const performImmediateSearch = useCallback((query: string, type: string) => {
    handleSearch(query, type)
  }, [handleSearch])

  return {
    performSearch,
    performImmediateSearch
  }
}