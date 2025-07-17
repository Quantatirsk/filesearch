import { useCallback, useRef } from 'react'
import { useApi } from './useApi'
import { useAppStore } from '../stores/app-store'
import { debounce, parseMultiKeywords } from '../lib/utils'

export const useSearch = () => {
  const { search } = useApi()
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
      setSearchQuery('')
      return
    }

    // 更新搜索查询字符串
    setSearchQuery(query)
    setSearching(true)
    
    try {
      // Parse multi-keywords for better search
      const keywords = parseMultiKeywords(query)
      const searchQuery = keywords.join(' ')
      
      const result = await search({
        query: searchQuery,
        search_type: type as 'exact' | 'fuzzy' | 'path' | 'hybrid',
        limit: 1000,
        min_fuzzy_score: 30.0
      })

      if (result.success) {
        // 转换后端数据格式为前端FileItem格式
        const convertedResults = result.results.map((item: any) => ({
          id: item.file_path || item.id || Math.random().toString(36),
          file_path: item.file_path,
          file_name: item.file_name || item.file_path?.split('/').pop() || item.file_path?.split('\\').pop() || 'Unknown',
          file_size: item.file_size || 0,
          file_type: item.file_type || 'unknown',
          last_modified: item.last_modified || item.last_indexed || new Date().toISOString(),
          content_preview: item.highlighted_content || item.content_preview || item.fuzzy_highlight || '',
          match_score: item.match_score || item.fuzzy_score || 100
        }))
        
        console.log('Converted search results:', convertedResults)
        
        // 使用 requestIdleCallback 来延迟更新搜索结果，避免阻塞用户输入
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => {
            setSearchResults(convertedResults)
          })
        } else {
          // 降级处理
          setTimeout(() => {
            setSearchResults(convertedResults)
          }, 0)
        }
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
  }, [search, setSearchResults, setSearching, setSearchQuery, isBackendRunning])

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