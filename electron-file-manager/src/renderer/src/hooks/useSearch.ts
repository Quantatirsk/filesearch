import { useCallback, useRef } from 'react'
import { useApi } from './useApi'
import { useAppStore } from '../stores/app-store'
import { debounce, parseMultiKeywords } from '../lib/utils'

export const useSearch = () => {
  const { search } = useApi()
  const settings = useAppStore(state => state.settings)
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
      
      // Check if all formats are selected - if so, don't send format filter to query everything
      let fileTypesToSend: string[] | undefined = undefined
      
      if (settings.enabledFormats && settings.enabledFormats.length > 0) {
        // Check if all formats are selected by comparing with total supported formats count
        const totalFormats = settings.totalSupportedFormatsCount || 250 // Fallback estimate
        const isAllFormatsSelected = settings.enabledFormats.length >= totalFormats
        
        if (isAllFormatsSelected) {
          // Don't send format filter when all formats are selected - this allows querying all file types
          fileTypesToSend = undefined
        } else {
          // Send specific format filter for partial selection
          fileTypesToSend = settings.enabledFormats
        }
      }
      
      // Debug logging
      console.log('🔍 Search Debug Info:')
      console.log('  - Query:', searchQuery)
      console.log('  - Type:', type)
      console.log('  - Enabled formats count:', settings.enabledFormats?.length || 0)
      console.log('  - Total supported formats:', settings.totalSupportedFormatsCount || 'unknown')
      console.log('  - Is all formats selected:', settings.enabledFormats && settings.enabledFormats.length >= (settings.totalSupportedFormatsCount || 250))
      console.log('  - File types to send:', fileTypesToSend ? `${fileTypesToSend.length} specific formats` : 'undefined (search all formats)')
      
      // 快速搜索：并行执行精确搜索和路径搜索，然后合并去重结果
      if (type === 'quick') {
        console.log('🚀 执行快速搜索 - 并行精确搜索和路径搜索')
        
        const [exactResult, pathResult] = await Promise.all([
          search({
            query: searchQuery,
            search_type: 'exact',
            limit: 500,
            min_fuzzy_score: 30.0,
            file_types: fileTypesToSend
          }),
          search({
            query: searchQuery,
            search_type: 'path',
            limit: 500,
            min_fuzzy_score: 30.0,
            file_types: fileTypesToSend
          })
        ])
        
        // 合并结果并去重
        const allResults = []
        const seenPaths = new Set<string>()
        
        // 先添加精确搜索结果（优先级更高）
        if (exactResult.success && exactResult.results) {
          for (const item of exactResult.results) {
            if (!seenPaths.has(item.file_path)) {
              seenPaths.add(item.file_path)
              allResults.push({ ...item, foundByKeyword: 'exact' })
            }
          }
        }
        
        // 再添加路径搜索结果
        if (pathResult.success && pathResult.results) {
          for (const item of pathResult.results) {
            if (!seenPaths.has(item.file_path)) {
              seenPaths.add(item.file_path)
              allResults.push({ ...item, foundByKeyword: 'path' })
            }
          }
        }
        
        console.log(`📊 快速搜索结果统计: 精确搜索${exactResult.results?.length || 0}个, 路径搜索${pathResult.results?.length || 0}个, 去重后${allResults.length}个`)
        
        // 创建合并结果对象
        const result = {
          success: true,
          query: searchQuery,
          search_type: 'quick',
          results: allResults,
          total_results: allResults.length,
          search_time: (exactResult.search_time || 0) + (pathResult.search_time || 0),
          limit: 1000
        }
        
        if (result.success) {
          // 转换后端数据格式为前端FileItem格式
          const convertedResults = result.results.map((item: any) => {
            
            // 处理修改时间戳 - 优先使用file_modified，fallback到last_modified
            let lastModified = new Date().toISOString()
            const modifiedTimestamp = item.file_modified || item.last_modified
            if (modifiedTimestamp) {
              if (typeof modifiedTimestamp === 'number') {
                // 如果时间戳小于 1e12，说明是秒级时间戳，需要转换为毫秒
                const timestamp = modifiedTimestamp < 1e12 ? modifiedTimestamp * 1000 : modifiedTimestamp
                lastModified = new Date(timestamp).toISOString()
              } else if (typeof modifiedTimestamp === 'string') {
                lastModified = modifiedTimestamp
              }
            }
            
            const converted = {
              id: item.file_path || item.id || Math.random().toString(36),
              file_path: item.file_path,
              file_name: item.file_name || item.file_path?.split('/').pop() || item.file_path?.split('\\').pop() || 'Unknown',
              file_size: item.file_size || 0,
              file_type: item.file_type || 'unknown',
              file_created: item.file_created,                    // 文件创建时间戳
              file_modified: item.file_modified,                  // 文件实际修改时间戳
              last_modified: lastModified,                        // 格式化的修改时间字符串
              last_indexed: item.last_indexed,                    // 索引时间戳
              content_preview: '',
              match_score: item.match_score || item.fuzzy_score || 100,
              foundByKeyword: item.foundByKeyword
            }
            
            return converted
          })
          
          // 直接更新搜索结果，避免延迟影响用户交互
          setSearchResults(convertedResults)
        } else {
          console.error('Quick search failed')
          setSearchResults([])
        }
        
        return
      }
      
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
          
          // 处理修改时间戳 - 优先使用file_modified，fallback到last_modified
          let lastModified = new Date().toISOString()
          const modifiedTimestamp = item.file_modified || item.last_modified
          if (modifiedTimestamp) {
            if (typeof modifiedTimestamp === 'number') {
              // 如果时间戳小于 1e12，说明是秒级时间戳，需要转换为毫秒
              const timestamp = modifiedTimestamp < 1e12 ? modifiedTimestamp * 1000 : modifiedTimestamp
              lastModified = new Date(timestamp).toISOString()
            } else if (typeof modifiedTimestamp === 'string') {
              lastModified = modifiedTimestamp
            }
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
  }, [search, setSearchResults, setSearching, setSearchQuery, isBackendRunning, settings])

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