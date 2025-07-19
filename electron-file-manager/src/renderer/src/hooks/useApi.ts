import { useCallback } from 'react'
import { SearchOptions, AdvancedSearchOptions, IndexOptions, SearchResult, IndexResult, DatabaseStats, SupportedFormatsResponse } from '../types'

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
    updateFilePath
  }
}