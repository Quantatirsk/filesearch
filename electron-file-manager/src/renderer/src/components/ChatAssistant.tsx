/**
 * Chat Assistant Component
 * 
 * Provides a floating chat interface for natural language file search
 * with streaming responses and file recommendations.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { useApi } from '../hooks/useApi'
import { useAppStore } from '../stores/app-store'
import { FileItem } from '../types'
import { formatFileSize, getFileIcon } from '../lib/utils'
import { cn } from '../lib/utils'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  MessageCircle,
  Send,
  X,
  FileText,
  Minimize2,
  Maximize2,
  Brain,
  Search,
  User,
  Bot
} from 'lucide-react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  recommendedFiles?: FileItem[]
}

interface ChatAssistantProps {
  isOpen: boolean
  onClose: () => void
  onToggleMinimize?: () => void
  isMinimized?: boolean
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  isOpen,
  onClose,
  onToggleMinimize,
  isMinimized = false
}) => {
  const { streamChatWithAssistant } = useApi()
  const setSearchResults = useAppStore(state => state.setSearchResults)
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState('')
  
  // References
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, currentStreamingMessage, scrollToBottom])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, isMinimized])

  const handleSendMessage = useCallback(async () => {
    const query = inputValue.trim()
    if (!query || isStreaming) return

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsStreaming(true)
    setCurrentStreamingMessage('')

    try {
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController()
      
      // Start streaming chat
      const { stream, getRecommendedFiles } = await streamChatWithAssistant(query)
      
      let streamedContent = ''
      const reader = stream.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) break
          
          streamedContent += value
          setCurrentStreamingMessage(streamedContent)
        }

        // Get recommended files
        const recommendedFiles = await getRecommendedFiles()

        // Create assistant message
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: streamedContent,
          timestamp: new Date(),
          recommendedFiles
        }

        setMessages(prev => [...prev, assistantMessage])
        setCurrentStreamingMessage('')

      } catch (streamError) {
        console.error('Streaming error:', streamError)
        if (streamError.name !== 'AbortError') {
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
      abortControllerRef.current = null
    }
  }, [inputValue, isStreaming, streamChatWithAssistant])

  const handleStopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
      
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
  }, [currentStreamingMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }, [handleSendMessage])

  const handleFileClick = useCallback((file: FileItem) => {
    // Update search results to show this file
    setSearchResults([file])
    toast.success(`已切换到文件：${file.file_name}`)
  }, [setSearchResults])

  const handleShowAllRecommendations = useCallback((files: FileItem[]) => {
    setSearchResults(files)
    toast.success(`已显示 ${files.length} 个推荐文件`)
  }, [setSearchResults])

  const clearChat = useCallback(() => {
    setMessages([])
    setCurrentStreamingMessage('')
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
    }
  }, [])

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className={cn(
        "max-w-4xl max-h-[80vh] flex flex-col p-0",
        isMinimized && "max-h-16"
      )}>
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5 text-primary" />
              智能文件助手
            </DialogTitle>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearChat}
                  title="清空对话"
                >
                  清空
                </Button>
              )}
              {onToggleMinimize && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleMinimize}
                  title={isMinimized ? "展开" : "最小化"}
                >
                  {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                title="关闭"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Messages Area */}
        {!isMinimized && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 && !currentStreamingMessage && (
                <div className="text-center text-muted-foreground py-8">
                  <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-lg mb-2">欢迎使用智能文件助手</p>
                  <p className="text-sm">
                    您可以用自然语言描述需要查找的文件，我会为您推荐最相关的文档。
                  </p>
                  <div className="mt-4 space-y-2 text-sm text-left max-w-md mx-auto">
                    <p className="font-medium">示例问题：</p>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>• "帮我找一些关于机器学习的文档"</li>
                      <li>• "有没有Python相关的代码文件？"</li>
                      <li>• "查找包含'API'关键词的文件"</li>
                    </ul>
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div key={message.id} className={cn(
                  "flex gap-3",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}>
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "max-w-[70%] rounded-lg px-4 py-3",
                    message.role === 'user' 
                      ? "bg-primary text-primary-foreground ml-auto" 
                      : "bg-muted"
                  )}>
                    <div className="whitespace-pre-wrap text-sm">
                      {message.content}
                    </div>
                    
                    {/* File Recommendations */}
                    {message.recommendedFiles && message.recommendedFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">推荐文件：</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleShowAllRecommendations(message.recommendedFiles!)}
                            className="text-xs h-6"
                          >
                            显示全部 ({message.recommendedFiles.length})
                          </Button>
                        </div>
                        <div className="space-y-1">
                          {message.recommendedFiles.slice(0, 3).map((file) => (
                            <Card
                              key={file.file_path}
                              className="p-2 cursor-pointer hover:bg-accent/50 transition-colors"
                              onClick={() => handleFileClick(file)}
                            >
                              <div className="flex items-center gap-2">
                                <div className="text-lg flex-shrink-0">
                                  {getFileIcon(file.file_type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {file.file_name}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <span className="truncate flex-1">{file.file_path}</span>
                                    <Badge variant="secondary" className="text-xs">
                                      {file.file_type.toUpperCase()}
                                    </Badge>
                                    {file.file_size && (
                                      <span>{formatFileSize(file.file_size)}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {/* Current streaming message */}
              {currentStreamingMessage && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="max-w-[70%] rounded-lg px-4 py-3 bg-muted">
                    <div className="whitespace-pre-wrap text-sm">
                      {currentStreamingMessage}
                      <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-1" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t px-6 py-4 flex-shrink-0">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="描述您要查找的文件..."
                  disabled={isStreaming}
                  className="flex-1"
                />
                {isStreaming ? (
                  <Button
                    onClick={handleStopStream}
                    variant="outline"
                    size="icon"
                    title="停止生成"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim()}
                    size="icon"
                    title="发送消息"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ChatAssistant