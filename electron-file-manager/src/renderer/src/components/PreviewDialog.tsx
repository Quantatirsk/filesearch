import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Skeleton } from './ui/skeleton'
import { Input } from './ui/input'
import { useApi } from '../hooks/useApi'
import { FileText, Search, ChevronLeft, ChevronRight, X } from 'lucide-react'

// 定义多关键词高亮颜色配置
const HIGHLIGHT_COLORS = [
  {
    background: '#c6f6d5', // 绿色
    text: '#2f855a',
    darkBackground: '#38a169',
    darkText: '#c6f6d5'
  },
  {
    background: '#fef08a', // 黄色
    text: '#a16207',
    darkBackground: '#ca8a04',
    darkText: '#fef3c7'
  },
  {
    background: '#bee3f8', // 蓝色
    text: '#2c5282',
    darkBackground: '#3182ce',
    darkText: '#bee3f8'
  },
  {
    background: '#fed7d7', // 红色
    text: '#c53030',
    darkBackground: '#e53e3e',
    darkText: '#fed7d7'
  },
  {
    background: '#e9d8fd', // 紫色
    text: '#553c9a',
    darkBackground: '#805ad5',
    darkText: '#e9d8fd'
  },
  {
    background: '#fed7e2', // 粉色
    text: '#b83280',
    darkBackground: '#d53f8c',
    darkText: '#fed7e2'
  },
  {
    background: '#fdd6cc', // 橙色
    text: '#c05621',
    darkBackground: '#dd6b20',
    darkText: '#fdd6cc'
  },
  {
    background: '#d2f5e8', // 青色
    text: '#234e52',
    darkBackground: '#319795',
    darkText: '#d2f5e8'
  }
]

interface PreviewDialogProps {
  filePath: string | null
  isOpen: boolean
  onClose: () => void
  searchQuery?: string
}

interface MatchPosition {
  start: number
  end: number
  text: string
  keywordIndex: number
}

// 内存优化的匹配位置计算函数
const calculateMatches = (text: string, keywords: string[]): {
  baseHtml: string,
  matchesByKeyword: Array<{keyword: string, matches: MatchPosition[]}>
} => {
  if (!keywords.length || !text) {
    return {
      baseHtml: text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\n/g, '<br>'),
      matchesByKeyword: []
    }
  }

  // 使用完整文件内容，不限制匹配数量
  const limitedText = text // 使用完整文本

  const matchesByKeyword: Array<{keyword: string, matches: MatchPosition[]}> = []
  const allMatches: MatchPosition[] = []
  
  // 为每个关键词计算匹配位置
  keywords.forEach((keyword, keywordIndex) => {
    if (!keyword || keyword.length < 2) return
    
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escapedKeyword, 'gi')
    const matches: MatchPosition[] = []
    
    let match
    while ((match = regex.exec(limitedText)) !== null) {
      const matchPos: MatchPosition = {
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        keywordIndex
      }
      matches.push(matchPos)
      allMatches.push(matchPos)
      
      // 防止无限循环
      if (match.index === regex.lastIndex) {
        regex.lastIndex++
      }
    }
    
    matchesByKeyword.push({
      keyword,
      matches
    })
  })

  // 记录匹配统计信息，不限制数量
  if (allMatches.length > 0) {
    console.log(`找到 ${allMatches.length} 个匹配项，开始处理高亮显示`)
  }

  // 生成基础HTML，使用更高效的方法
  let processedText = limitedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // 按位置排序并从后往前替换，避免位置偏移
  allMatches.sort((a, b) => b.start - a.start)
  
  // 处理所有匹配项，不限制数量
  const BATCH_SIZE = 200 // 增大批大小以提高效率
  try {
    // 统一使用分批处理，避免单次处理过多导致阻塞
    for (let i = 0; i < allMatches.length; i += BATCH_SIZE) {
      const batch = allMatches.slice(i, i + BATCH_SIZE)
      
      batch.forEach((match) => {
        try {
          const colorConfig = HIGHLIGHT_COLORS[match.keywordIndex % HIGHLIGHT_COLORS.length]
          const before = processedText.substring(0, match.start)
          const highlighted = `<span class="search-highlight keyword-${match.keywordIndex}" data-keyword-index="${match.keywordIndex}" style="background-color: ${colorConfig.background}; color: ${colorConfig.text}; font-weight: 700; border-radius: 0.125rem; padding: 0 2px;">${match.text}</span>`
          const after = processedText.substring(match.end)
          processedText = before + highlighted + after
        } catch (matchError) {
          console.warn('跳过有问题的匹配:', matchError)
        }
      })
      
      // 每处理一定数量后显示进度
      if (i % (BATCH_SIZE * 5) === 0 && i > 0) {
        const progress = ((i / allMatches.length) * 100).toFixed(1)
        console.log(`高亮处理进度: ${progress}% (${i}/${allMatches.length})`)
      }
    }
    
    console.log(`高亮处理完成，总共处理了 ${allMatches.length} 个匹配项`)
  } catch (batchError) {
    console.error('批处理失败:', batchError)
    // 如果批处理失败，返回基本的转义文本
    processedText = limitedText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  return {
    baseHtml: processedText.replace(/\n/g, '<br>'),
    matchesByKeyword
  }
}

export const PreviewDialog: React.FC<PreviewDialogProps> = ({
  filePath,
  isOpen,
  onClose,
  searchQuery = ''
}) => {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedKeywordIndex, setSelectedKeywordIndex] = useState(0)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [memoryWarning, setMemoryWarning] = useState(false)
  // Internal search state
  const [showSearchInput, setShowSearchInput] = useState(false)
  const [internalSearchQuery, setInternalSearchQuery] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { getFileContent } = useApi()

  // 获取搜索关键词 - 优先使用内部搜索，如果为空则使用外部搜索
  const searchKeywords = useMemo(() => {
    const activeQuery = internalSearchQuery.trim() || searchQuery.trim()
    return activeQuery.split(/\s+/).filter(k => k.length > 1)
  }, [internalSearchQuery, searchQuery])

  // 预计算所有匹配位置 - 使用useEffect处理状态更新
  const [processedResult, setProcessedResult] = useState<{
    baseHtml: string
    matchesByKeyword: Array<{keyword: string, matches: MatchPosition[]}>
  }>({ baseHtml: '', matchesByKeyword: [] })

  useEffect(() => {
    if (!content) {
      setProcessedResult({
        baseHtml: '',
        matchesByKeyword: []
      })
      return
    }

    if (!searchKeywords.length) {
      setProcessedResult({
        baseHtml: content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/\n/g, '<br>'),
        matchesByKeyword: []
      })
      return
    }
    
    setIsProcessing(true)
    setMemoryWarning(false)
    
    // 使用setTimeout确保状态更新在下一个事件循环中执行
    const timeoutId = setTimeout(() => {
      try {
        // 检查文件大小和复杂度
        const fileSize = content.length
        const estimatedComplexity = searchKeywords.length * fileSize
        
        console.log('文件处理信息:', {
          fileSize: (fileSize / 1024).toFixed(1) + 'KB',
          keywords: searchKeywords.length,
          estimatedComplexity: (estimatedComplexity / 1000000).toFixed(1) + 'M操作'
        })
        
        // 如果预估复杂度较高，发出提醒但继续处理
        if (estimatedComplexity > 500000000) { // 500M操作
          setMemoryWarning(true)
          console.warn('文件处理复杂度较高，可能需要较长时间，但会完整处理所有匹配项')
        }
        
        const result = calculateMatches(content, searchKeywords)
        setProcessedResult(result)
        setIsProcessing(false)
      } catch (error) {
        console.error('高亮处理失败:', error)
        setIsProcessing(false)
        setMemoryWarning(true)
        
        // 如果处理失败，返回原始内容
        setProcessedResult({
          baseHtml: content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\n/g, '<br>'),
          matchesByKeyword: []
        })
      }
    }, 0)

    // 清理函数
    return () => clearTimeout(timeoutId)
  }, [content, searchKeywords])

  const { baseHtml, matchesByKeyword } = processedResult

  // 当前选中关键词的匹配数量
  const currentKeywordMatches = matchesByKeyword[selectedKeywordIndex]?.matches || []
  const totalMatches = currentKeywordMatches.length

  // 获取文件内容
  useEffect(() => {
    if (isOpen && filePath) {
      setLoading(true)
      setError(null)
      setContent('')

      getFileContent(filePath)
        .then((response) => {
          if (response.success && response.content) {
            setContent(response.content)
          } else {
            setError(response.error || '无法获取文件内容')
          }
        })
        .catch((err) => {
          setError('获取文件内容失败: ' + err.message)
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [isOpen, filePath, getFileContent])

  const getFileName = (path: string): string => {
    return path.split('/').pop() || path.split('\\').pop() || path
  }

  // 重置状态当搜索查询或文件路径改变时
  useEffect(() => {
    setSelectedKeywordIndex(0)
    setCurrentMatchIndex(0)
  }, [searchQuery, filePath, internalSearchQuery])

  // 处理搜索输入的显示/隐藏
  const toggleSearchInput = useCallback(() => {
    setShowSearchInput(prev => {
      const newState = !prev
      if (newState) {
        // 显示搜索框时自动聚焦
        setTimeout(() => {
          searchInputRef.current?.focus()
        }, 100)
      } else {
        // 隐藏搜索框时清空搜索内容
        setInternalSearchQuery('')
      }
      return newState
    })
  }, [])

  // 处理搜索输入变化
  const handleSearchInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInternalSearchQuery(event.target.value)
  }, [])

  // 处理搜索输入的键盘事件
  const handleSearchInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        toggleSearchInput()
        break
      case 'Enter':
        event.preventDefault()
        if (totalMatches > 0) {
          goToNextMatch()
        }
        break
    }
  }, [toggleSearchInput, totalMatches, goToNextMatch])

  // 导航到上一个匹配
  const goToPreviousMatch = useCallback(() => {
    if (totalMatches === 0) return
    setCurrentMatchIndex(prev => prev === 0 ? totalMatches - 1 : prev - 1)
  }, [totalMatches])

  // 导航到下一个匹配
  const goToNextMatch = useCallback(() => {
    if (totalMatches === 0) return
    setCurrentMatchIndex(prev => prev === totalMatches - 1 ? 0 : prev + 1)
  }, [totalMatches])

  // 选择关键词
  const selectKeyword = useCallback((index: number) => {
    setSelectedKeywordIndex(index)
    setCurrentMatchIndex(0)
  }, [])

  // 优化的滚动到当前匹配项
  const scrollToCurrentMatch = useCallback(() => {
    if (!contentRef.current || totalMatches === 0) return
    
    const currentMatch = currentKeywordMatches[currentMatchIndex]
    if (!currentMatch) return

    // 使用更轻量的方式处理
    requestAnimationFrame(() => {
      if (!contentRef.current) return
      
      try {
        // 查找当前关键词的所有匹配项
        const highlights = contentRef.current.querySelectorAll(`.keyword-${selectedKeywordIndex}`)
        
        if (currentMatchIndex >= highlights.length) return
        
        const targetHighlight = highlights[currentMatchIndex] as HTMLElement
        
        if (targetHighlight) {
          // 批量移除之前的样式
          const prevCurrent = contentRef.current.querySelector('.current-match')
          if (prevCurrent && prevCurrent !== targetHighlight) {
            prevCurrent.classList.remove('current-match')
            ;(prevCurrent as HTMLElement).style.boxShadow = ''
          }
          
          // 添加当前匹配样式
          targetHighlight.classList.add('current-match')
          targetHighlight.style.boxShadow = '0 0 0 2px #3b82f6'
          
          // 使用更平滑的滚动
          targetHighlight.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          })
        }
      } catch (scrollError) {
        console.warn('滚动到匹配项时出错:', scrollError)
      }
    })
  }, [totalMatches, currentMatchIndex, selectedKeywordIndex, currentKeywordMatches])

  // 当匹配索引改变时自动滚动
  useEffect(() => {
    scrollToCurrentMatch()
  }, [currentMatchIndex, selectedKeywordIndex, scrollToCurrentMatch])

  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return
      
      // Ctrl+F 快捷键 - 最高优先级
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault()
        toggleSearchInput()
        return
      }

      // 如果搜索输入框已显示且有焦点，不处理其他快捷键
      if (showSearchInput && document.activeElement === searchInputRef.current) {
        return
      }
      
      // 其他导航快捷键只有在有匹配结果时才生效
      if (totalMatches === 0) {
        // Escape 键关闭对话框（即使没有匹配结果）
        if (event.key === 'Escape') {
          event.preventDefault()
          if (showSearchInput) {
            toggleSearchInput()
          } else {
            onClose()
          }
        }
        return
      }
      
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault()
          goToPreviousMatch()
          break
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault()
          goToNextMatch()
          break
        case 'Escape':
          event.preventDefault()
          if (showSearchInput) {
            toggleSearchInput()
          } else {
            onClose()
          }
          break
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, totalMatches, goToPreviousMatch, goToNextMatch, onClose, toggleSearchInput, showSearchInput])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-4rem)] h-[calc(100vh-4rem)] max-w-none flex flex-col p-0 gap-0 [&>button]:hidden">
        <DialogHeader className="px-2 py-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center min-w-0 w-full">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 flex-shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg font-semibold flex-shrink-0">文件预览</span>
                  {filePath && (
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></div>
                      <span className="text-base font-medium text-foreground truncate">
                        {getFileName(filePath)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                  <span className="flex-shrink-0">文档内容查看器</span>
                  {filePath && (
                    <>
                      <span className="flex-shrink-0">•</span>
                      <div className="overflow-x-auto scrollbar-hide flex-1 min-w-0">
                        <span className="whitespace-nowrap inline-block">
                          {filePath}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {/* 搜索按钮 */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={toggleSearchInput}
                title="搜索文本 (Ctrl+F)"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
          
          {/* 搜索输入框 */}
          {showSearchInput && (
            <div className="mt-2 px-2">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="输入搜索文本..."
                    value={internalSearchQuery}
                    onChange={handleSearchInputChange}
                    onKeyDown={handleSearchInputKeyDown}
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={toggleSearchInput}
                  title="关闭搜索"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          
          {/* 搜索关键词显示区域 */}
          {(searchQuery || internalSearchQuery) && searchKeywords.length > 0 && (
            <div className="mt-2 px-2">
              <div className="flex items-center justify-between">
                {/* 左侧：搜索信息 */}
                <div className="flex items-center gap-2">
                  <Search className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    搜索关键词 ({searchKeywords.length} 个)
                  </span>
                  {isProcessing && (
                    <div className="flex items-center gap-1">
                      <div className="animate-spin rounded-full h-2 w-2 border-b border-primary"></div>
                      <span className="text-xs text-muted-foreground">处理中...</span>
                    </div>
                  )}
                  {memoryWarning && (
                    <span className="text-xs text-yellow-600 bg-yellow-50 px-1 rounded">
                      复杂处理
                    </span>
                  )}
                </div>
                
                {/* 中间：关键词 + 导航控件 */}
                <div className="flex items-center gap-3">
                  {/* 关键词标签区域 */}
                  <div className="flex flex-wrap gap-1.5">
                    {searchKeywords.map((keyword, index) => {
                      const colorConfig = HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length]
                      const isSelected = index === selectedKeywordIndex
                      const keywordMatchCount = matchesByKeyword[index]?.matches.length || 0
                      return (
                        <div
                          key={`${keyword}-${index}`}
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border cursor-pointer transition-all hover:opacity-80`}
                          style={{
                            backgroundColor: colorConfig.background,
                            color: colorConfig.text,
                            borderColor: colorConfig.text + '30'
                          }}
                          onClick={() => selectKeyword(index)}
                        >
                          {keyword} ({keywordMatchCount})
                          {isSelected && (
                            <span className="ml-1 text-xs">✓</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  
                  {/* 导航控件 */}
                  {totalMatches > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {currentMatchIndex + 1}/{totalMatches}
                      </span>
                      <div className="flex">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={goToPreviousMatch}
                          disabled={totalMatches === 0}
                          title="上一个匹配 (←↑ 键)"
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={goToNextMatch}
                          disabled={totalMatches === 0}
                          title="下一个匹配 (→↓ 键)"
                        >
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 右侧：快捷键提示 */}
                <div className="text-xs text-muted-foreground">
                  使用 ←→ 或 ↑↓ 键导航匹配项
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 p-3 overflow-hidden">
          <ScrollArea className="h-full rounded-md border bg-muted/30">
            <div className="p-4">
              {/* 简化的高亮样式 */}
              <style>{`
                /* 亮色主题 - 内容高亮 */
                .search-highlight.keyword-0 { background-color: #c6f6d5 !important; color: #2f855a !important; }
                .search-highlight.keyword-1 { background-color: #fef08a !important; color: #a16207 !important; }
                .search-highlight.keyword-2 { background-color: #bee3f8 !important; color: #2c5282 !important; }
                .search-highlight.keyword-3 { background-color: #fed7d7 !important; color: #c53030 !important; }
                .search-highlight.keyword-4 { background-color: #e9d8fd !important; color: #553c9a !important; }
                .search-highlight.keyword-5 { background-color: #fed7e2 !important; color: #b83280 !important; }
                .search-highlight.keyword-6 { background-color: #fdd6cc !important; color: #c05621 !important; }
                .search-highlight.keyword-7 { background-color: #d2f5e8 !important; color: #234e52 !important; }
                
                /* 暗色主题 - 内容高亮 */
                @media (prefers-color-scheme: dark) {
                  .search-highlight.keyword-0 { background-color: #38a169 !important; color: #c6f6d5 !important; }
                  .search-highlight.keyword-1 { background-color: #ca8a04 !important; color: #fef3c7 !important; }
                  .search-highlight.keyword-2 { background-color: #3182ce !important; color: #bee3f8 !important; }
                  .search-highlight.keyword-3 { background-color: #e53e3e !important; color: #fed7d7 !important; }
                  .search-highlight.keyword-4 { background-color: #805ad5 !important; color: #e9d8fd !important; }
                  .search-highlight.keyword-5 { background-color: #d53f8c !important; color: #fed7e2 !important; }
                  .search-highlight.keyword-6 { background-color: #dd6b20 !important; color: #fdd6cc !important; }
                  .search-highlight.keyword-7 { background-color: #319795 !important; color: #d2f5e8 !important; }
                }
                
                /* Tailwind 的 dark 类支持 */
                .dark .search-highlight.keyword-0 { background-color: #38a169 !important; color: #c6f6d5 !important; }
                .dark .search-highlight.keyword-1 { background-color: #ca8a04 !important; color: #fef3c7 !important; }
                .dark .search-highlight.keyword-2 { background-color: #3182ce !important; color: #bee3f8 !important; }
                .dark .search-highlight.keyword-3 { background-color: #e53e3e !important; color: #fed7d7 !important; }
                .dark .search-highlight.keyword-4 { background-color: #805ad5 !important; color: #e9d8fd !important; }
                .dark .search-highlight.keyword-5 { background-color: #d53f8c !important; color: #fed7e2 !important; }
                .dark .search-highlight.keyword-6 { background-color: #dd6b20 !important; color: #fdd6cc !important; }
                .dark .search-highlight.keyword-7 { background-color: #319795 !important; color: #d2f5e8 !important; }
                
                /* 当前匹配项的样式 */
                .current-match {
                  position: relative;
                  box-shadow: 0 0 0 2px #3b82f6 !important;
                  z-index: 1;
                }
              `}</style>

              {loading ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    <span className="text-muted-foreground text-sm">正在加载文件内容...</span>
                  </div>
                  
                  {/* 骨架屏效果 */}
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-[90%]" />
                    <Skeleton className="h-3 w-[95%]" />
                    <Skeleton className="h-3 w-[85%]" />
                    <div className="pt-3">
                      <Skeleton className="h-3 w-[100%]" />
                      <Skeleton className="h-3 w-[88%]" />
                      <Skeleton className="h-3 w-[92%]" />
                    </div>
                    <div className="pt-3">
                      <Skeleton className="h-3 w-[96%]" />
                      <Skeleton className="h-3 w-[80%]" />
                      <Skeleton className="h-3 w-[90%]" />
                    </div>
                  </div>
                </div>

              ) : error ? (
                <div className="text-center py-8">
                  <div className="mx-auto w-12 h-12 mb-3 rounded-full bg-red-100 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-red-500" />
                  </div>
                  <p className="text-base font-medium text-red-600 mb-1">
                    加载失败
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {error}
                  </p>
                </div>

              ) : content ? (
                <div 
                  ref={contentRef}
                  className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere"
                  style={{
                    fontFamily: 'monospace',
                    lineHeight: '1.4',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere'
                  }}
                  dangerouslySetInnerHTML={{ __html: baseHtml }}
                />
              ) : (

                <div className="text-center py-8">
                  <div className="mx-auto w-12 h-12 mb-3 rounded-full bg-muted flex items-center justify-center">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-base font-medium text-muted-foreground mb-1">
                    文件内容为空
                  </p>
                  <p className="text-xs text-muted-foreground">
                    该文件没有可显示的内容
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}