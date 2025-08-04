/**
 * Chat Assistant Component
 * 
 * Provides a floating chat interface for natural language file search
 * with streaming responses and file recommendations.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from './ui/button'

import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'
import { useApi } from '../hooks/useApi'
import { FileItem } from '../types'
import { formatFileSize, getFileIcon } from '../lib/utils'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'
import {
  Send,
  X,
  FileText,
  User,
  Sparkles,
  Bot,
  Clock,
  Copy,
  Trash2,
  Download
} from 'lucide-react'
import { ReactMarkdownChatMessage } from './ReactMarkdownChatMessage'
import { SearchingModal } from './SearchingModal'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  recommendedFiles?: FileItem[]
  extractedKeywords?: string[]
  // 用户消息的搜索进度
  searchingContent?: string
  isSearching?: boolean
  searchCompleted?: boolean
}

interface ChatAssistantProps {
  isOpen: boolean
  onClose: () => void
  onClear?: () => void
  initialQuery?: string | null
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  isOpen,
  onClose,
  onClear,
  initialQuery
}) => {
  const { streamChatWithAssistant } = useApi()
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState('')
  
  // Current search state (for the active search only)
  const [currentSearchingMessageId, setCurrentSearchingMessageId] = useState<string | null>(null)
  
  // References
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Track search progress for current search
  const searchProgressCollectedRef = useRef(false)

  // Enhanced auto-scroll to bottom with multiple strategies
  const scrollToBottom = useCallback(() => {
    // Strategy 1: Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      try {
        // Strategy 2: Try scrollIntoView on target element
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ 
            behavior: 'smooth',
            block: 'end'
          })
        }
        
        // Strategy 3: If ScrollArea ref is available, scroll its viewport
        if (scrollAreaRef.current) {
          const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
          if (viewport) {
            viewport.scrollTop = viewport.scrollHeight
          }
        }
        
        // Strategy 4: Direct scroll on messages container
        const messagesContainer = document.querySelector('.w-full.px-6.py-4.space-y-4')
        if (messagesContainer && messagesContainer.parentElement) {
          const scrollParent = messagesContainer.parentElement
          scrollParent.scrollTop = scrollParent.scrollHeight
        }
        
        // Strategy 5: Fallback with longer delay - find any scroll container and scroll to bottom
        setTimeout(() => {
          const scrollContainers = document.querySelectorAll('[data-radix-scroll-area-viewport]')
          scrollContainers.forEach(container => {
            if (container.contains(messagesEndRef.current)) {
              container.scrollTop = container.scrollHeight
            }
          })
          
          // Final fallback: scroll main dialog content if needed
          const dialogContent = document.querySelector('[role="dialog"] .flex.flex-col')
          if (dialogContent) {
            dialogContent.scrollTop = dialogContent.scrollHeight
          }
        }, 200)
        
      } catch (error) {
        console.warn('Scroll to bottom failed:', error)
      }
    })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, currentStreamingMessage, scrollToBottom])

  // Helper function to update user message search state
  const updateUserMessageSearchState = useCallback((messageId: string, updates: Partial<Pick<ChatMessage, 'searchingContent' | 'isSearching' | 'searchCompleted'>>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId && msg.role === 'user' 
        ? { ...msg, ...updates }
        : msg
    ))
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Auto-submit initial query when provided
  useEffect(() => {
    if (!isOpen || !initialQuery || !initialQuery.trim() || isStreaming) {
      return
    }
    
    // Check for duplicate query - prevent same query from being executed consecutively
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()
    if (lastUserMessage && lastUserMessage.content.trim() === initialQuery.trim()) {
      console.log('Duplicate query detected, skipping:', initialQuery.trim())
      return
    }
    
    setInputValue(initialQuery.trim())
    // Delay to ensure the dialog is fully rendered and use a ref to avoid dependency cycles
    const submitTimer = setTimeout(() => {
      // Call handleSendMessage directly with the query
      const query = initialQuery.trim()
      if (!query || isStreaming) return

      // Add user message with initial search state
      const userMessageId = Date.now().toString()
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content: query,
        timestamp: new Date(),
        searchingContent: '',
        isSearching: true,
        searchCompleted: false
      }

      setMessages(prev => [...prev, userMessage])
      setInputValue('')
      setIsStreaming(true)
      setCurrentStreamingMessage('')
      setCurrentSearchingMessageId(userMessageId)
      
      // Execute the streaming chat logic
      searchProgressCollectedRef.current = false

      streamChatWithAssistant(query, (progressMessage) => {
        setMessages(prev => prev.map(msg => 
          msg.id === userMessageId && msg.role === 'user'
            ? { ...msg, searchingContent: (msg.searchingContent || '') + progressMessage }
            : msg
        ))
      }).then(({ stream, getRecommendedFiles, getExtractedKeywords }) => {
        searchProgressCollectedRef.current = true
        
        let streamedContent = ''
        const reader = stream.getReader()

        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              
              if (done) break
              
              streamedContent += value
              setCurrentStreamingMessage(streamedContent)
            }

            // Get recommended files and keywords
            const recommendedFiles = await getRecommendedFiles()
            const extractedKeywords = await getExtractedKeywords()

            // Create assistant message
            const assistantMessage: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: streamedContent,
              timestamp: new Date(),
              recommendedFiles,
              extractedKeywords
            }

            setMessages(prev => [...prev, assistantMessage])
            setCurrentStreamingMessage('')
            
            // Mark search as completed
            updateUserMessageSearchState(userMessageId, {
              isSearching: false,
              searchCompleted: true
            })

          } catch (streamError) {
            console.error('Streaming error:', streamError)
          } finally {
            reader.releaseLock()
            setIsStreaming(false)
            setCurrentSearchingMessageId(null)
            
            const hasCollectedProgress = searchProgressCollectedRef.current
            if (hasCollectedProgress) {
              updateUserMessageSearchState(userMessageId, {
                isSearching: false,
                searchCompleted: true
              })
            } else {
              updateUserMessageSearchState(userMessageId, {
                isSearching: false,
                searchCompleted: false,
                searchingContent: ''
              })
            }
          }
        }

        processStream()
      }).catch(error => {
        console.error('Chat error:', error)
        
        // Add error message
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `抱歉，处理您的请求时出现了错误：${error}`,
          timestamp: new Date()
        }
        
        setMessages(prev => [...prev, errorMessage])
        setIsStreaming(false)
        setCurrentSearchingMessageId(null)
      })
    }, 300)

    return () => clearTimeout(submitTimer)
  }, [isOpen, initialQuery, isStreaming, messages.length, streamChatWithAssistant, updateUserMessageSearchState])

  const handleSendMessage = useCallback(async () => {
    const query = inputValue.trim()
    if (!query || isStreaming) return

    // Add user message with initial search state
    const userMessageId = Date.now().toString()
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: query,
      timestamp: new Date(),
      searchingContent: '',
      isSearching: true,
      searchCompleted: false
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsStreaming(true)
    setCurrentStreamingMessage('')
    setCurrentSearchingMessageId(userMessageId)
    
    // Start searching state
    console.log('🚀 Starting new search for message:', userMessageId)
    searchProgressCollectedRef.current = false

    try {
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController()
      
      // Start streaming chat with progress callback
      const { stream, getRecommendedFiles, getExtractedKeywords } = await streamChatWithAssistant(query, (progressMessage) => {
        console.log('📝 Adding progress message:', progressMessage.slice(0, 50))
        setMessages(prev => prev.map(msg => 
          msg.id === userMessageId && msg.role === 'user'
            ? { ...msg, searchingContent: (msg.searchingContent || '') + progressMessage }
            : msg
        ))
      })
      
      // Mark that we have collected search progress
      console.log('✅ Search progress collected for message:', userMessageId)
      searchProgressCollectedRef.current = true
      
      let streamedContent = ''
      const reader = stream.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) break
          
          streamedContent += value
          setCurrentStreamingMessage(streamedContent)
        }

        // Get recommended files and keywords
        const recommendedFiles = await getRecommendedFiles()
        const extractedKeywords = await getExtractedKeywords()

        // Create assistant message
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: streamedContent,
          timestamp: new Date(),
          recommendedFiles,
          extractedKeywords
        }

        setMessages(prev => [...prev, assistantMessage])
        setCurrentStreamingMessage('')
        
        // Mark search as completed but keep visible
        console.log('🎉 Search completed successfully for message:', userMessageId)
        updateUserMessageSearchState(userMessageId, {
          isSearching: false,
          searchCompleted: true
        })

      } catch (streamError) {
        console.error('Streaming error:', streamError)
        if ((streamError as Error)?.name !== 'AbortError') {
          toast.error('对话流式响应出现错误')
        }
      } finally {
        reader.releaseLock()
      }

    } catch (error) {
      console.error('Chat error:', error)
      
      // Add error message
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，处理您的请求时出现了错误：${error}`,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, errorMessage])
      toast.error(`智能助手响应失败：${error}`)
    } finally {
      setIsStreaming(false)
      setCurrentSearchingMessageId(null)
      
      // 使用ref来获取最新的状态值，避免闭包问题
      const hasCollectedProgress = searchProgressCollectedRef.current
      console.log('🔍 Finally block - progress collected:', hasCollectedProgress, 'for message:', userMessageId)
      
      // 只要收集到了搜索进度，就保持搜索状态
      if (hasCollectedProgress) {
        console.log('🔒 Preserving search content (progress collected)')
        updateUserMessageSearchState(userMessageId, {
          isSearching: false,
          searchCompleted: true
        })
      } else {
        console.log('💥 Clearing search state (no progress collected)')
        updateUserMessageSearchState(userMessageId, {
          isSearching: false,
          searchCompleted: false,
          searchingContent: ''
        })
      }
      abortControllerRef.current = null
    }
  }, [inputValue, isStreaming, streamChatWithAssistant, updateUserMessageSearchState])

  const handleStopStream = useCallback(() => {
    if (abortControllerRef.current && currentSearchingMessageId) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
      
      // 如果已经收集到搜索进度，保持完成状态和内容
      if (searchProgressCollectedRef.current) {
        updateUserMessageSearchState(currentSearchingMessageId, {
          isSearching: false,
          searchCompleted: true
        })
      } else {
        updateUserMessageSearchState(currentSearchingMessageId, {
          isSearching: false,
          searchCompleted: false
        })
      }
      setCurrentSearchingMessageId(null)
      // 永远不清空搜索内容，让用户能看到已经收集到的进度
      
      if (currentStreamingMessage) {
        // Save current streamed content as a message
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: currentStreamingMessage + ' (已中断)',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, assistantMessage])
        setCurrentStreamingMessage('')
      }
    }
  }, [currentStreamingMessage, currentSearchingMessageId, updateUserMessageSearchState])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSendMessage()
    }
  }, [handleSendMessage])

  const handleFileClick = useCallback(async (file: FileItem) => {
    console.log('Opening file from chat assistant:', file.file_path)
    
    try {
      const result = await window.electronAPI.files.openFile(file.file_path)
      console.log('Open file result:', result)
      
      if (!result.success) {
        throw new Error(result.message)
      }
      
      const fileName = file.file_name || file.file_path?.split('/').pop() || '未知文件'
      toast.success(`已打开文件：${fileName}`)
    } catch (error) {
      console.error('Failed to open file:', error)
      // 如果直接打开失败，则尝试在资源管理器中显示
      try {
        const fallbackResult = await window.electronAPI.files.openInExplorer(file.file_path)
        console.log('Fallback explorer result:', fallbackResult)
        
        if (fallbackResult.success) {
          console.log('File shown in explorer as fallback')
          const fileName = file.file_name || file.file_path?.split('/').pop() || '未知文件'
          toast.success(`已在资源管理器中显示文件：${fileName}`)
        } else {
          console.error('Both open methods failed:', fallbackResult.message)
          toast.error(`无法打开文件: ${fallbackResult.message}`)
        }
      } catch (fallbackError) {
        console.error('Failed to open in explorer:', fallbackError)
        toast.error(`无法打开文件: ${fallbackError}`)
      }
    }
  }, [])

  const handleFolderClick = useCallback(async (file: FileItem, event: React.MouseEvent) => {
    event.stopPropagation() // 防止事件冒泡
    console.log('Opening folder for file:', file.file_path)
    
    try {
      const result = await window.electronAPI.files.openInExplorer(file.file_path)
      console.log('Open folder result:', result)
      
      if (result.success) {
        toast.success('已在资源管理器中打开文件夹')
      } else {
        toast.error(`无法打开文件夹: ${result.message}`)
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
      toast.error(`无法打开文件夹: ${error}`)
    }
  }, [])

  const handleExportFiles = useCallback(async (files: FileItem[]) => {
    try {
      // 生成时间戳
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                       new Date().toTimeString().split(' ')[0].replace(/:/g, '-')
      
      // 获取桌面路径
      const desktopPath = await window.electronAPI.files.getDesktopPath()
      if (!desktopPath) {
        toast.error('无法获取桌面路径')
        return
      }
      
      const baseDir = `${desktopPath}/File_${timestamp}`
      
      // 创建基础目录
      await window.electronAPI.files.createDirectory(baseDir)
      
      // 按文件的完整关键词组合分组文件
      const fileGroups = new Map<string, FileItem[]>()
      
      files.forEach(file => {
        let dirName: string
        
        if (file.foundByKeyword) {
          // 将文件的所有关键词标签按拼音排序后用下划线连接作为目录名
          const keywords = file.foundByKeyword.split(' + ').map(k => k.trim())
          const sortedKeywords = keywords.sort((a, b) => a.localeCompare(b, 'zh-CN'))
          dirName = sortedKeywords.join('_')
        } else {
          // 没有关键词的文件放到"其他"目录
          dirName = '其他'
        }
        
        if (!fileGroups.has(dirName)) {
          fileGroups.set(dirName, [])
        }
        fileGroups.get(dirName)!.push(file)
      })
      
      // 创建子目录并复制文件
      const copiedFiles = new Set<string>() // 跟踪已复制的唯一文件
      let successfulGroups = 0
      
      for (const [dirName, groupFiles] of fileGroups) {
        const subDir = `${baseDir}/${dirName}`
        await window.electronAPI.files.createDirectory(subDir)
        
        // 获取该组文件的路径列表（已经按关键词组合分组，无需去重）
        const filePaths = groupFiles.map(f => f.file_path)
        const result = await window.electronAPI.files.copy(filePaths, subDir)
        
        if (result.success) {
          filePaths.forEach(filePath => copiedFiles.add(filePath))
          successfulGroups++
          console.log(`Successfully copied ${filePaths.length} files to ${dirName} folder`)
        } else {
          console.error(`Failed to copy files to ${dirName} folder:`, result.message)
        }
      }
      
      if (copiedFiles.size > 0) {
        toast.success(`成功导出 ${copiedFiles.size} 个文件到桌面 File_${timestamp} 目录，创建了 ${successfulGroups} 个分类目录`)
      } else {
        toast.error('导出失败，没有文件被复制')
      }
      
    } catch (error) {
      console.error('Export files error:', error)
      toast.error(`导出文件失败: ${error}`)
    }
  }, [])

  const clearChat = useCallback(() => {
    console.log('🗑️ Clearing chat - this will reset all search content')
    setMessages([])
    setCurrentStreamingMessage('')
    setCurrentSearchingMessageId(null)
    searchProgressCollectedRef.current = false
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
    }
    // Clear the initial query to prevent re-triggering
    onClear?.()
  }, [onClear])

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="w-[calc(100vw-4rem)] h-[calc(100vh-4rem)] max-w-none flex flex-col p-0 gap-0 focus:outline-none focus-visible:outline-none" hideCloseButton={true}>
        <DialogHeader className="px-2 py-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold">智能文件检索</span>
                <span className="text-xs text-muted-foreground">
                  自然语言 · 文档推荐
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 mr-3">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearChat}
                  title="清空对话"
                  className="h-7 w-7 p-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                title="关闭对话"
                className="h-7 w-7 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Messages Area - Full Width */}
        <ScrollArea ref={scrollAreaRef} className="flex-1">
              <div className="w-full px-6 py-4 space-y-4">
                {messages.length === 0 && !currentStreamingMessage && !currentSearchingMessageId && (
                  <div className="text-center py-12">
                    <div className="mx-auto w-12 h-12 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">AI 智能助手</h3>
                    <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                      用自然语言描述您要查找的文件，我会智能分析并推荐最相关的文档
                    </p>
                    
                    {/* Quick Start Examples */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
                      {[
                        { icon: "📊", text: "机器学习文档", query: "帮我找一些关于机器学习的文档" },
                        { icon: "🐍", text: "Python 代码", query: "有没有Python相关的代码文件？" },
                        { icon: "🔌", text: "API 接口", query: "查找包含'API'关键词的文件" }
                      ].map((example, idx) => (
                        <Card 
                          key={idx}
                          className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 border-dashed hover:border-solid hover:border-primary/50"
                          onClick={() => setInputValue(example.query)}
                        >
                          <div className="text-2xl mb-2">{example.icon}</div>
                          <p className="text-sm font-medium">{example.text}</p>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className="group">
                    {message.role === 'user' ? (
                      <>
                        {/* User Message - Right Aligned with Left-Right Layout */}
                        <div className="flex justify-end mb-4">
                          <div className="flex items-start gap-3 max-w-[70%]">
                            <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 py-3 shadow-sm">
                              <ReactMarkdownChatMessage content={message.content} />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                              <User className="h-4 w-4 text-white" />
                            </div>
                          </div>
                        </div>
                        
                        {/* Show SearchingModal for this user message if it has search state */}
                        {(message.isSearching || message.searchCompleted) && (
                          <div className="ml-11 mr-11">
                            <SearchingModal
                              isVisible={message.isSearching || message.searchCompleted}
                              content={message.searchingContent || ''}
                              title="实时检索进度"
                              isGenerating={message.isSearching}
                              type="searching"
                              enableSmoothScroll={true}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      /* Assistant Message - Left Aligned with Left-Right Layout */
                      <div className="mb-6">
                        <div className="flex justify-start">
                          <div className="flex items-start gap-3 w-full">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0">
                              <Sparkles className="h-4 w-4 text-white" />
                            </div>
                            <div className="bg-muted/50 rounded-2xl rounded-tl-md px-4 py-3 border border-border/50 flex-1 mr-11">
                              <ReactMarkdownChatMessage content={message.content} />
                              
                              {/* Timestamp and Actions */}
                              <div className="flex items-center gap-2 mt-2 pt-1 border-t border-border/30">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-2.5 w-2.5" />
                                  {message.timestamp.toLocaleTimeString([], { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                </div>
                                <div className="flex-1"></div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => navigator.clipboard.writeText(message.content)}
                                >
                                  <Copy className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* File Recommendations - Below the chat bubble */}
                        {message.recommendedFiles && message.recommendedFiles.length > 0 && (
                          <div className="mt-4 ml-11 mr-11 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                <span className="text-sm font-medium">相关文件</span>
                                <Badge variant="secondary" className="text-xs h-5">
                                  {message.recommendedFiles.length}
                                </Badge>
                              </div>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => {
                                        handleExportFiles(message.recommendedFiles || [])
                                      }}
                                      title="导出文件到桌面"
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>导出文件到桌面</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            
                            <div className="grid gap-1.5 w-full overflow-hidden">
                              {message.recommendedFiles
                                .sort((a, b) => {
                                  // Count keywords for each file (split by '+' and count)
                                  const aKeywordCount = a.foundByKeyword ? a.foundByKeyword.split(' + ').length : 0
                                  const bKeywordCount = b.foundByKeyword ? b.foundByKeyword.split(' + ').length : 0
                                  // Sort by keyword count (descending), then by match score (descending)
                                  if (aKeywordCount !== bKeywordCount) {
                                    return bKeywordCount - aKeywordCount
                                  }
                                  return (b.match_score || 0) - (a.match_score || 0)
                                })
                                .map((file) => (
                                <Card
                                  key={file.file_path}
                                  className="px-2.5 py-2 hover:shadow-lg transition-all duration-200 border-l-2 border-l-primary/30 hover:border-l-primary w-full overflow-hidden"
                                >
                                  <div className="flex items-center gap-2 w-full min-w-0">
                                    <div className="text-base flex-shrink-0">
                                      {getFileIcon(file.file_type || 'unknown')}
                                    </div>
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                      <div className="flex items-center gap-1.5 mb-1 min-w-0">
                                        <div className="overflow-x-auto scrollbar-hide flex-1 min-w-0">
                                          <span 
                                            className="text-xs font-medium whitespace-nowrap cursor-pointer hover:text-primary transition-colors"
                                            onClick={() => handleFileClick(file)}
                                            title="点击打开文件"
                                          >
                                            {file.file_name || file.file_path?.split('/').pop() || '未知文件'}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                          <Badge variant="outline" className="text-xs h-4">
                                            {(file.file_type || 'unknown').toUpperCase()}
                                          </Badge>
                                          {file.foundByKeyword && (
                                            <div className="flex items-center gap-1 flex-wrap">
                                              {file.foundByKeyword.split(' + ').map((keyword, idx) => (
                                                <Badge key={idx} variant="secondary" className="text-xs h-4 bg-primary/10 text-primary">
                                                  {keyword}
                                                </Badge>
                                              ))}
                                            </div>
                                          )}
                                          {file.file_size && (
                                            <Badge variant="outline" className="text-xs h-4 bg-muted/50">
                                              {formatFileSize(file.file_size)}
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-xs text-muted-foreground w-full overflow-hidden">
                                        <div 
                                          className="break-all leading-relaxed overflow-wrap-anywhere cursor-pointer hover:text-primary transition-colors"
                                          onClick={(e) => handleFolderClick(file, e)}
                                          title="点击打开文件夹"
                                        >
                                          {file.file_path}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}


                {/* Current streaming message - Enhanced with Left-Right Layout */}
                {currentStreamingMessage && (
                  <div className="flex justify-start mb-6">
                    <div className="flex items-start gap-3 w-full">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center flex-shrink-0">
                        <div className="animate-pulse">
                          <Sparkles className="h-4 w-4 text-white" />
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-2xl rounded-tl-md px-4 py-3 border border-border/50 relative flex-1 mr-11">
                        <ReactMarkdownChatMessage 
                          content={currentStreamingMessage}
                          isStreaming={true}
                        />
                        {/* Typing indicator */}
                        <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                          <div className="animate-bounce">●</div>
                          <div className="animate-bounce delay-100">●</div>
                          <div className="animate-bounce delay-200">●</div>
                          <span className="ml-2">AI 正在思考</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

        {/* Enhanced Input Area */}
        <div className="border-t bg-background/95 backdrop-blur-sm flex-shrink-0">
          <div className="p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述您要查找的文件，支持自然语言..."
                disabled={isStreaming}
                className="flex-1 h-10 px-4 pr-24 text-sm border-2 rounded-xl bg-background focus:border-primary/50 focus:outline-none transition-colors"
              />
                    
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputValue.trim() || isStreaming}
                      size="icon"
                      className="h-10 w-10 rounded-xl"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>发送消息 (Enter)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ChatAssistant