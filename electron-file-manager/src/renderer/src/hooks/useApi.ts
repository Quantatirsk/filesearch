import { useCallback } from 'react'
import { SearchOptions, AdvancedSearchOptions, IndexOptions, SearchResult, IndexResult, DatabaseStats, SupportedFormatsResponse, FileItem } from '../types'
import { llmWrapper } from '../lib/llmwrapper'
import { useAppStore } from '../stores/app-store'

export interface FileContentRequest {
  file_path: string
}

export interface FileContentResponse {
  success: boolean
  file_path: string
  content: string | null
  error?: string
}

export interface RemoveFileRequest {
  file_path: string
}

export interface RemoveFileResponse {
  success: boolean
  file_path: string
  error?: string
}

export interface UpdateFilePathRequest {
  old_path: string
  new_path: string
}

export interface UpdateFilePathResponse {
  success: boolean
  old_path: string
  new_path: string
  error?: string
}

export const useApi = () => {
  const settings = useAppStore(state => state.settings)
  
  // Debug: Log current LLM model whenever useApi is called
  console.log('[useApi] Current LLM model from settings:', settings.llmModel)
  
  const makeRequest = useCallback(async (options: unknown) => {
    try {
      return await window.electronAPI.api.request(options)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // 检查是否是后端未运行的错误
      if (errorMessage.includes('Python backend not running')) {
        console.warn('Python后端服务未运行，请先启动后端服务')
        throw new Error('Python后端服务未运行')
      }
      
      console.error('API request failed:', errorMessage)
      throw error
    }
  }, [])

  const search = useCallback(async (options: SearchOptions): Promise<SearchResult> => {
    return await makeRequest({
      method: 'POST',
      url: '/search',
      data: options
    }) as SearchResult
  }, [makeRequest])

  const advancedSearch = useCallback(async (options: AdvancedSearchOptions): Promise<SearchResult> => {
    return await makeRequest({
      method: 'POST',
      url: '/search/advanced',
      data: options
    }) as SearchResult
  }, [makeRequest])

  const indexDirectory = useCallback(async (options: IndexOptions): Promise<IndexResult> => {
    return await makeRequest({
      method: 'POST',
      url: '/index',
      data: options
    }) as IndexResult
  }, [makeRequest])

  const indexDirectoryWithProgress = useCallback(async (
    options: IndexOptions,
    onProgress: (progress: {
      status: string
      processed_files: number
      total_files: number
      current_file: string
      errors: string[]
    }) => void
  ): Promise<IndexResult> => {
    // Start indexing and get session ID
    const startResponse = await makeRequest({
      method: 'POST',
      url: '/index/stream',
      data: options
    }) as { session_id: string; message: string; progress_url: string }

    // Connect to SSE endpoint for progress updates
    const eventSource = new EventSource(
      `http://localhost:8001/index/progress/${startResponse.session_id}`
    )

    return new Promise((resolve, reject) => {
      let finalResult: IndexResult | null = null

      eventSource.addEventListener('progress', (event) => {
        const progress = JSON.parse(event.data)
        onProgress(progress)
      })

      eventSource.addEventListener('complete', (event) => {
        const data = JSON.parse(event.data)
        eventSource.close()
        
        // Create final result based on last progress update
        if (data.status === 'completed') {
          resolve({
            success: true,
            indexed_files: finalResult?.indexed_files || 0,
            total_files: finalResult?.total_files || 0,
            processing_time: 0,
          })
        } else {
          reject(new Error('Indexing failed'))
        }
      })

      eventSource.addEventListener('error', () => {
        eventSource.close()
        reject(new Error('Connection error'))
      })

      // Store the latest progress as final result
      eventSource.addEventListener('progress', (event) => {
        const progress = JSON.parse(event.data)
        finalResult = {
          success: progress.status === 'completed',
          indexed_files: progress.processed_files,
          total_files: progress.total_files,
          processing_time: 0
        }
      })
    })
  }, [makeRequest])

  const getStats = useCallback(async (): Promise<DatabaseStats> => {
    return await makeRequest({
      method: 'GET',
      url: '/stats'
    }) as DatabaseStats
  }, [makeRequest])

  const getSupportedFormats = useCallback(async (): Promise<SupportedFormatsResponse> => {
    return await makeRequest({
      method: 'GET',
      url: '/supported-formats'
    }) as SupportedFormatsResponse
  }, [makeRequest])

  const clearIndex = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    return await makeRequest({
      method: 'DELETE',
      url: '/index?confirm=true'
    }) as { success: boolean; message: string }
  }, [makeRequest])

  const healthCheck = useCallback(async (): Promise<{ status: string }> => {
    return await makeRequest({
      method: 'GET',
      url: '/health'
    }) as { status: string }
  }, [makeRequest])

  const getFileContent = useCallback(async (filePath: string): Promise<FileContentResponse> => {
    return await makeRequest({
      method: 'POST',
      url: '/file/content',
      data: { file_path: filePath }
    }) as FileContentResponse
  }, [makeRequest])

  const removeFileFromIndex = useCallback(async (filePath: string): Promise<RemoveFileResponse> => {
    return await makeRequest({
      method: 'DELETE',
      url: '/file',
      data: { file_path: filePath }
    }) as RemoveFileResponse
  }, [makeRequest])

  const updateFilePath = useCallback(async (oldPath: string, newPath: string): Promise<UpdateFilePathResponse> => {
    return await makeRequest({
      method: 'PUT',
      url: '/file/path',
      data: { old_path: oldPath, new_path: newPath }
    }) as UpdateFilePathResponse
  }, [makeRequest])

  // LLM-related functions

  const chatWithAssistant = useCallback(async (query: string): Promise<{
    response: string
    recommendedFiles: FileItem[]
  }> => {
    try {
      // 1. Extract keyword combinations using LLM
      const keywordSets = await llmWrapper.extractKeywords(query, settings.llmModel, settings.llmApiKey, settings.llmBaseUrl)
      
      // 2. Search with multiple keyword combinations in parallel using quick search (exact + path)
      const searchPromises = keywordSets.map(async keywords => {
        const query = keywords.join(' ')
        
        // Execute exact and path searches in parallel
        const [exactResult, pathResult] = await Promise.all([
          search({ 
            query, 
            search_type: 'exact',
            limit: settings.searchResultLimit,
            min_fuzzy_score: settings.fuzzyThreshold
          }),
          search({ 
            query, 
            search_type: 'path',
            limit: settings.searchResultLimit,
            min_fuzzy_score: settings.fuzzyThreshold
          })
        ])
        
        // Merge and deduplicate results
        const allResults: FileItem[] = []
        const seenPaths = new Set<string>()
        
        // Add exact search results first (higher priority)
        if (exactResult.success && exactResult.results) {
          for (const item of exactResult.results) {
            if (!seenPaths.has(item.file_path)) {
              seenPaths.add(item.file_path)
              allResults.push(item)
            }
          }
        }
        
        // Add path search results
        if (pathResult.success && pathResult.results) {
          for (const item of pathResult.results) {
            if (!seenPaths.has(item.file_path)) {
              seenPaths.add(item.file_path)
              allResults.push(item)
            }
          }
        }
        
        return {
          success: true,
          results: allResults,
          total_results: allResults.length,
          search_time: (exactResult.search_time || 0) + (pathResult.search_time || 0)
        }
      })
      const searchResults = await Promise.all(searchPromises)
      
      // 3. Combine and deduplicate results
      const allFiles = new Map<string, FileItem>()
      searchResults.forEach(result => {
        result.results.forEach(file => {
          if (!allFiles.has(file.file_path)) {
            allFiles.set(file.file_path, file)
          }
        })
      })
      
      const uniqueFiles = Array.from(allFiles.values())
      
      // 4. Use LLM to analyze relevance and provide recommendations
      const recommendation = await llmWrapper.analyzeRelevance(query, uniqueFiles, settings.llmModel, settings.llmApiKey, settings.llmBaseUrl)
      
      // Convert recommended files to FileItem format
      const convertedFiles: FileItem[] = recommendation.recommendedFiles.map(file => ({
        id: file.file_path,
        file_path: file.file_path,
        file_name: file.file_name || '',
        file_size: 0, // Not available from recommendation
        file_type: file.file_type || '',
        last_modified: new Date().toISOString(), // Default value
        content_preview: file.content_preview,
        match_score: file.match_score
      }))

      return {
        response: recommendation.reasoning,
        recommendedFiles: convertedFiles
      }
    } catch (error) {
      console.error('Failed to chat with assistant:', error)
      throw error
    }
  }, [search, settings.llmModel, settings.llmApiKey, settings.llmBaseUrl])

  // Streaming version of summarizeFileContent
  const streamSummarizeFileContent = useCallback(async (filePath: string): Promise<ReadableStream<string>> => {
    try {
      // 1. Get file content from the backend
      const fileContentResponse = await getFileContent(filePath)
      
      if (!fileContentResponse.success || !fileContentResponse.content) {
        throw new Error(fileContentResponse.error || 'Failed to get file content')
      }

      // 2. Use LLM to summarize the content with streaming
      const stream = await llmWrapper.streamSummarizeFile(fileContentResponse.content, 10000, settings.llmModel, settings.llmApiKey, settings.llmBaseUrl)
      
      return stream
    } catch (error) {
      console.error('Failed to summarize file content:', error)
      throw error
    }
  }, [getFileContent, settings.llmModel, settings.llmApiKey, settings.llmBaseUrl])

  const intelligentFileSearch = useCallback(async (query: string): Promise<{
    files: FileItem[]
    keywordGroups: string[][]
    searchDetails: Array<{
      keyword: string
      foundFiles: string[]
    }>
  }> => {
    try {
      // 1. Extract keyword combinations using LLM
      console.log('Extracting keywords for query:', query)
      const keywordGroups = await llmWrapper.extractKeywords(query, settings.llmModel, settings.llmApiKey, settings.llmBaseUrl)
      console.log('Extracted keyword groups:', keywordGroups)

      // 2. Perform exact searches with complete keyword combinations only
      const searchDetails: Array<{ keyword: string; foundFiles: string[] }> = []
      
      const searchResults = await Promise.all(keywordGroups.map(async (keywords) => {
        try {
          // Use quick search (exact + path) with the complete keyword combination
          const quickQuery = keywords.join(' ')
          const keywordLabel = keywords.join(' + ')
          console.log(`Searching with quick query: "${quickQuery}"`)
          
          // Execute exact and path searches in parallel
          const [exactResult, pathResult] = await Promise.all([
            search({
              query: quickQuery,
              search_type: 'exact',
              limit: settings.searchResultLimit,
              min_fuzzy_score: 60
            }),
            search({
              query: quickQuery,
              search_type: 'path',
              limit: settings.searchResultLimit,
              min_fuzzy_score: 60
            })
          ])
          
          // Merge and deduplicate results
          const allResults: FileItem[] = []
          const seenPaths = new Set<string>()
          
          // Add exact search results first (higher priority)
          if (exactResult.success && exactResult.results) {
            for (const item of exactResult.results) {
              if (!seenPaths.has(item.file_path)) {
                seenPaths.add(item.file_path)
                allResults.push(item)
              }
            }
          }
          
          // Add path search results
          if (pathResult.success && pathResult.results) {
            for (const item of pathResult.results) {
              if (!seenPaths.has(item.file_path)) {
                seenPaths.add(item.file_path)
                allResults.push(item)
              }
            }
          }
          
          if (allResults.length > 0) {
            const foundFiles = allResults.map(f => f.file_path)
            searchDetails.push({ keyword: keywordLabel, foundFiles })
            
            const resultsWithKeyword = allResults.map(file => ({
              ...file,
              foundByKeyword: keywordLabel
            }))
            
            console.log(`Found ${allResults.length} files for keyword combination: "${keywordLabel}" (exact: ${exactResult.results?.length || 0}, path: ${pathResult.results?.length || 0})`)
            return resultsWithKeyword
          } else {
            console.log(`No files found for keyword combination: "${keywordLabel}"`)
            return []
          }
        } catch (searchError) {
          console.warn('Search failed for keyword combination:', keywords, searchError)
          return []
        }
      }))
      
      const allResults = searchResults.flat()

      // 3. Merge duplicate files and collect all their matching keywords
      const fileMap = new Map<string, FileItem & { foundByKeyword?: string }>()
      
      allResults.forEach(file => {
        const existingFile = fileMap.get(file.file_path)
        if (existingFile) {
          // File already exists, merge keywords
          const existingKeywords = existingFile.foundByKeyword ? existingFile.foundByKeyword.split(' + ') : []
          const newKeywords = file.foundByKeyword ? file.foundByKeyword.split(' + ') : []
          const allKeywords = [...new Set([...existingKeywords, ...newKeywords])]
          
          // Sort keywords by Chinese pinyin for consistency
          const sortedKeywords = allKeywords.sort((a, b) => a.localeCompare(b, 'zh-CN'))
          
          // Keep the higher match score
          existingFile.foundByKeyword = sortedKeywords.join(' + ')
          existingFile.match_score = Math.max(existingFile.match_score || 0, file.match_score || 0)
        } else {
          // New file, sort keywords before adding to map
          if (file.foundByKeyword) {
            const keywords = file.foundByKeyword.split(' + ')
            const sortedKeywords = keywords.sort((a, b) => a.localeCompare(b, 'zh-CN'))
            file.foundByKeyword = sortedKeywords.join(' + ')
          }
          fileMap.set(file.file_path, file)
        }
      })
      
      const uniqueResults = Array.from(fileMap.values())

      // 4. Sort by match score (highest first) and limit results
      const sortedResults = uniqueResults
        .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
        .slice(0, 20)

      console.log(`Found ${sortedResults.length} unique files from query: "${query}"`)
      return {
        files: sortedResults,
        keywordGroups,
        searchDetails
      }

    } catch (error) {
      console.error('Failed to perform intelligent file search:', error)
      throw error
    }
  }, [search, settings.llmModel, settings.llmApiKey, settings.llmBaseUrl])

  const streamChatWithAssistant = useCallback(async (query: string, onProgress?: (message: string) => void): Promise<{
    stream: ReadableStream<string>
    getRecommendedFiles: () => Promise<FileItem[]>
    getExtractedKeywords: () => Promise<string[]>
  }> => {
    try {
      // Use the new intelligent file search with progress callbacks
      const recommendationPromise = (async () => {
        try {
          onProgress?.('🔍 开始关键词提取...\n')
          onProgress?.('📝 分析用户查询语义...\n')
          
          // Extract keywords with progress
          console.log('[useApi] About to call extractKeywords with:', {
            model: settings.llmModel,
            hasApiKey: !!settings.llmApiKey,
            baseUrl: settings.llmBaseUrl
          })
          const keywordGroups = await llmWrapper.extractKeywords(query, settings.llmModel, settings.llmApiKey, settings.llmBaseUrl)
          onProgress?.(`💡 提取到 ${keywordGroups.length} 个关键词组合\n`)
          keywordGroups.forEach((group, idx) => {
            onProgress?.(`  ${idx + 1}. ${group.join(' + ')}\n`)
          })

          const searchDetails: Array<{ keyword: string; foundFiles: string[] }> = []
          
          onProgress?.('🎯 开始全文搜索...\n')

          const searchResults = await Promise.all(keywordGroups.map(async (keywords) => {
            try {
              const quickQuery = keywords.join(' ')
              const keywordLabel = keywords.join(' + ')
              
              onProgress?.(`🔍 搜索关键词组合: "${keywordLabel}"\n`)
              
              // Execute exact and path searches in parallel
              const [exactResult, pathResult] = await Promise.all([
                search({
                  query: quickQuery,
                  search_type: 'exact',
                  limit: settings.searchResultLimit,
                  min_fuzzy_score: 60
                }),
                search({
                  query: quickQuery,
                  search_type: 'path',
                  limit: settings.searchResultLimit,
                  min_fuzzy_score: 60
                })
              ])
              
              // Merge and deduplicate results
              const allResults: FileItem[] = []
              const seenPaths = new Set<string>()
              
              // Add exact search results first (higher priority)
              if (exactResult.success && exactResult.results) {
                for (const item of exactResult.results) {
                  if (!seenPaths.has(item.file_path)) {
                    seenPaths.add(item.file_path)
                    allResults.push(item)
                  }
                }
              }
              
              // Add path search results
              if (pathResult.success && pathResult.results) {
                for (const item of pathResult.results) {
                  if (!seenPaths.has(item.file_path)) {
                    seenPaths.add(item.file_path)
                    allResults.push(item)
                  }
                }
              }
              
              const exactCount = exactResult.results?.length || 0
              const pathCount = pathResult.results?.length || 0
              const totalBeforeDedup = exactCount + pathCount
              const afterDedup = allResults.length
              
              if (allResults.length > 0) {
                const foundFiles = allResults.map(f => f.file_path)
                searchDetails.push({ keyword: keywordLabel, foundFiles })
                
                onProgress?.(`✅ "${keywordLabel}" 找到 ${afterDedup} 个匹配文件 (精确: ${exactCount}, 路径: ${pathCount}, 去重: ${totalBeforeDedup - afterDedup})\n`)
                
                const resultsWithKeyword = allResults.map(file => ({
                  ...file,
                  foundByKeyword: keywordLabel
                }))
                
                return resultsWithKeyword
              } else {
                onProgress?.(`⚠️  关键词组合 "${keywordLabel}" 未找到匹配文件\n`)
                return []
              }
            } catch (searchError) {
              onProgress?.(`❌ 搜索关键词组合失败: ${keywords}\n`)
              return []
            }
          }))
          
          onProgress?.('📊 计算匹配度评分和去重...\n')

          const allResults = searchResults.flat()

          // Merge duplicate files and collect all their matching keywords
          const fileMap = new Map<string, FileItem & { foundByKeyword?: string }>()
          
          allResults.forEach(file => {
            const existingFile = fileMap.get(file.file_path)
            if (existingFile) {
              const existingKeywords = existingFile.foundByKeyword ? existingFile.foundByKeyword.split(' + ') : []
              const newKeywords = file.foundByKeyword ? file.foundByKeyword.split(' + ') : []
              const allKeywords = [...new Set([...existingKeywords, ...newKeywords])]
              
              const sortedKeywords = allKeywords.sort((a: string, b: string) => a.localeCompare(b, 'zh-CN'))
              
              existingFile.foundByKeyword = sortedKeywords.join(' + ')
              existingFile.match_score = Math.max(existingFile.match_score || 0, file.match_score || 0)
            } else {
              if (file.foundByKeyword) {
                const keywords = file.foundByKeyword.split(' + ')
                const sortedKeywords = keywords.sort((a: string, b: string) => a.localeCompare(b, 'zh-CN'))
                file.foundByKeyword = sortedKeywords.join(' + ')
              }
              fileMap.set(file.file_path, file)
            }
          })
          
          const uniqueResults = Array.from(fileMap.values())
          const sortedResults = uniqueResults
            .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
            .slice(0, 100)

          onProgress?.(`✨ 完成搜索，共找到 ${sortedResults.length} 个相关文件\n`)

          return {
            files: sortedResults,
            keywordGroups,
            searchDetails
          }
        } catch (error) {
          onProgress?.(`❌ 搜索失败: ${error}\n`)
          throw error
        }
      })()

      // Create a more detailed confirmation stream with keyword information
      const stream = new ReadableStream<string>({
        async start(controller) {
          setTimeout(async () => {
            try {
              const result = await recommendationPromise
              
              // Show extracted keywords section
              controller.enqueue('### 📝 检索关键词组合\n\n')
              result.keywordGroups.forEach((group, index) => {
                controller.enqueue(`${index + 1}. \`${group.join(' + ')}\`\n`)
              })
              controller.enqueue('\n---\n\n')
              
              // Show search results summary
              controller.enqueue(`### 📁 搜索结果概览：✅ **找到 ${result.files.length} 个相关文件**\n\n`)
              
              // Show search details as markdown table
              if (result.searchDetails.length > 0) {
                controller.enqueue('---\n\n')
                controller.enqueue('### 📊 关键词匹配详情\n\n')
                controller.enqueue('| 关键词 | 文件数 |\n')
                controller.enqueue('|--------|------------|\n')
                
                result.searchDetails.forEach(detail => {
                  controller.enqueue(`| \`${detail.keyword}\` | ${detail.foundFiles.length} |\n`)
                })
                controller.enqueue('\n---\n\n')
                controller.enqueue('💡 **提示：** 每个推荐文件都标注了匹配的关键词，点击可直接打开查看。\n')
              }
              
              controller.close()
            } catch (error) {
              controller.enqueue('❌ **搜索分析失败**\n\n请重试或检查搜索条件。')
              controller.close()
            }
          }, 300)
        }
      })

      return {
        stream,
        getRecommendedFiles: async () => {
          const result = await recommendationPromise
          return result.files
        },
        getExtractedKeywords: async () => {
          const result = await recommendationPromise
          return result.keywordGroups.flat()
        }
      }
    } catch (error) {
      console.error('Failed to stream chat with assistant:', error)
      throw error
    }
  }, [intelligentFileSearch, settings.llmModel, settings.llmApiKey, settings.llmBaseUrl])

  return {
    search,
    advancedSearch,
    indexDirectory,
    indexDirectoryWithProgress,
    getStats,
    getSupportedFormats,
    clearIndex,
    healthCheck,
    getFileContent,
    removeFileFromIndex,
    updateFilePath,
    // LLM functions
    streamSummarizeFileContent,
    chatWithAssistant,
    streamChatWithAssistant
  }
}