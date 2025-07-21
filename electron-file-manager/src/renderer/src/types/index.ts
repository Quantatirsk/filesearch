export interface FileItem {
  id: string
  file_path: string
  file_name: string
  file_size: number
  file_type: string
  last_modified: string
  content_preview?: string
  match_score?: number
  highlighted_content?: string
  foundByKeyword?: string
}

export interface SearchResult {
  success: boolean
  query: string
  search_type: string
  results: FileItem[]
  total_results: number
  search_time: number
  limit: number
  error?: string
}

export interface SearchOptions {
  query: string
  search_type: 'exact' | 'fuzzy' | 'path' | 'hybrid' | 'quick' | 'smart'
  limit: number
  min_fuzzy_score: number
  file_types?: string[]
}

export interface AdvancedSearchOptions {
  content_query?: string
  path_query?: string
  file_types?: string[]
  fuzzy: boolean
  limit: number
}

export interface IndexOptions {
  directory: string
  force: boolean
  workers?: number
}

export interface IndexResult {
  success: boolean
  indexed_files: number
  total_files: number
  processing_time: number
  error?: string
}

export interface DatabaseStats {
  success: boolean
  document_count: number
  total_content_size: number
  database_size: number
  file_types: { [key: string]: number }
  error?: string
}

export interface FileOperation {
  type: 'copy' | 'move' | 'delete'
  files: string[]
  destination?: string
}

export interface FileOperationResult {
  success: boolean
  message: string
  results?: Array<{
    source?: string
    destination?: string
    file?: string
    success: boolean
    error?: string
  }>
}

export interface AppState {
  isBackendRunning: boolean
  currentDirectory: string | null
  searchResults: FileItem[]
  selectedFiles: string[]
  isSearching: boolean
  searchQuery: string
  stats: DatabaseStats | null
}

export interface ToastMessage {
  id: string
  title: string
  description?: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
}

export interface FormatCategory {
  name: string
  description: string
  formats: string[]
  icon: string
  count: number
}

export interface SupportedFormatsResponse {
  success: boolean
  supported_formats: string[]
  total_count: number
  categories: { [key: string]: FormatCategory }
  format_descriptions: { [key: string]: string }
  stats: {
    total_formats: number
    categories_count: number
    text_formats: number
  }
}