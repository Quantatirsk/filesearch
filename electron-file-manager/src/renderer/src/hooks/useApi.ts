import { useCallback } from 'react'
import { SearchOptions, AdvancedSearchOptions, IndexOptions, SearchResult, IndexResult, DatabaseStats, SupportedFormatsResponse, FileItem } from '../types'
import { llmWrapper } from '../lib/llmwrapper'

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
  const makeRequest = useCallback(async (options: any) => {
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
    })
  }, [makeRequest])

  const advancedSearch = useCallback(async (options: AdvancedSearchOptions): Promise<SearchResult> => {
    return await makeRequest({
      method: 'POST',
      url: '/search/advanced',
      data: options
    })
  }, [makeRequest])

  const indexDirectory = useCallback(async (options: IndexOptions): Promise<IndexResult> => {
    return await makeRequest({
      method: 'POST',
      url: '/index',
      data: options
    })
  }, [makeRequest])

  const getStats = useCallback(async (): Promise<DatabaseStats> => {
    return await makeRequest({
      method: 'GET',
      url: '/stats'
    })
  }, [makeRequest])

  const getSupportedFormats = useCallback(async (): Promise<SupportedFormatsResponse> => {
    return await makeRequest({
      method: 'GET',
      url: '/supported-formats'
    })
  }, [makeRequest])

  const clearIndex = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    return await makeRequest({
      method: 'DELETE',
      url: '/index?confirm=true'
    })
  }, [makeRequest])

  const healthCheck = useCallback(async (): Promise<{ status: string }> => {
    return await makeRequest({
      method: 'GET',
      url: '/health'
    })
  }, [makeRequest])

  const getFileContent = useCallback(async (filePath: string): Promise<FileContentResponse> => {
    return await makeRequest({
      method: 'POST',
      url: '/file/content',
      data: { file_path: filePath }
    })
  }, [makeRequest])

  const removeFileFromIndex = useCallback(async (filePath: string): Promise<RemoveFileResponse> => {
    return await makeRequest({
      method: 'DELETE',
      url: '/file',
      data: { file_path: filePath }
    })
  }, [makeRequest])

  const updateFilePath = useCallback(async (oldPath: string, newPath: string): Promise<UpdateFilePathResponse> => {
    return await makeRequest({
      method: 'PUT',
      url: '/file/path',
      data: { old_path: oldPath, new_path: newPath }
    })
  }, [makeRequest])

  // LLM-related functions
  const summarizeFileContent = useCallback(async (filePath: string): Promise<string> => {
    try {
      // 1. Get file content from the backend
      const fileContentResponse = await getFileContent(filePath)
      
      if (!fileContentResponse.success || !fileContentResponse.content) {
        throw new Error(fileContentResponse.error || 'Failed to get file content')
      }

      // 2. Use LLM to summarize the content
      const summary = await llmWrapper.summarizeFile(fileContentResponse.content)
      
      return summary
    } catch (error) {
      console.error('Failed to summarize file content:', error)
      throw error
    }
  }, [getFileContent])

  const chatWithAssistant = useCallback(async (query: string): Promise<{
    response: string
    recommendedFiles: FileItem[]
  }> => {
    try {
      // 1. Extract keyword combinations using LLM
      const keywordSets = await llmWrapper.extractKeywords(query)
      
      // 2. Search with multiple keyword combinations in parallel
      const searchPromises = keywordSets.map(keywords => 
        search({ 
          query: keywords.join(' '), 
          search_type: 'hybrid',
          limit: 10 
        })
      )
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
      const recommendation = await llmWrapper.analyzeRelevance(query, uniqueFiles)
      
      return {
        response: recommendation.reasoning,
        recommendedFiles: recommendation.recommendedFiles
      }
    } catch (error) {
      console.error('Failed to chat with assistant:', error)
      throw error
    }
  }, [search])

  const streamChatWithAssistant = useCallback(async (query: string): Promise<{
    stream: ReadableStream<string>
    getRecommendedFiles: () => Promise<FileItem[]>
  }> => {
    try {
      // First, get file recommendations in the background
      const recommendationPromise = chatWithAssistant(query)

      // Create a streaming chat response
      const messages = [
        {
          role: 'system' as const,
          content: `你是一个智能文件搜索助手。用户提出关于文件搜索的问题，你需要：

1. 理解用户的需求
2. 提供有帮助的回答
3. 解释搜索策略
4. 给出建议

请用友好、专业的中文回复，保持对话自然流畅。`
        },
        {
          role: 'user' as const,
          content: query
        }
      ]

      const stream = await llmWrapper.streamChat({ messages })

      return {
        stream,
        getRecommendedFiles: async () => {
          const result = await recommendationPromise
          return result.recommendedFiles
        }
      }
    } catch (error) {
      console.error('Failed to stream chat with assistant:', error)
      throw error
    }
  }, [chatWithAssistant])

  return {
    search,
    advancedSearch,
    indexDirectory,
    getStats,
    getSupportedFormats,
    clearIndex,
    healthCheck,
    getFileContent,
    removeFileFromIndex,
    updateFilePath,
    // LLM functions
    summarizeFileContent,
    chatWithAssistant,
    streamChatWithAssistant
  }
}