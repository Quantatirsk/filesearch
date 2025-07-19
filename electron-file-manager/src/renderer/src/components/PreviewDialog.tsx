import React, { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { useApi } from '../hooks/useApi'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

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

// 自定义搜索高亮扩展
const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addOptions() {
    return {
      searchTerm: '',
      className: 'search-highlight'
    }
  },

  addProseMirrorPlugins() {
    const { searchTerm, className } = this.options

    return [
      new Plugin({
        key: new PluginKey('searchHighlight'),

        state: {
          init() {
            return DecorationSet.empty
          },

          apply(tr, decorationSet, oldState, newState) {
            if (!searchTerm || searchTerm.length < 2) {
              return DecorationSet.empty
            }

            const decorations: Decoration[] = []
            const keywords = searchTerm.trim().split(/\s+/).filter(k => k.length > 1)

            console.log('SearchHighlight: Processing keywords:', keywords)

            // 遍历文档查找匹配项
            newState.doc.descendants((node, pos) => {
              if (node.isText && node.text) {
                keywords.forEach((keyword, keywordIndex) => {
                  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                  const regex = new RegExp(escapedKeyword, 'gi')
                  let match

                  // 获取当前关键词的颜色配置
                  const colorConfig = HIGHLIGHT_COLORS[keywordIndex % HIGHLIGHT_COLORS.length]

                  while ((match = regex.exec(node.text)) !== null) {
                    const from = pos + match.index
                    const to = from + match[0].length

                    console.log(`SearchHighlight: Found match "${match[0]}" at ${from}-${to} with color ${keywordIndex}`)

                    decorations.push(
                      Decoration.inline(from, to, {
                        class: `${className} keyword-${keywordIndex}`,
                        style: `
                          background-color: ${colorConfig.background} !important; 
                          color: ${colorConfig.text} !important; 
                          font-weight: 700; 
                          box-decoration-break: clone;
                          border-radius: 0.125rem;
                        `,
                        'data-theme-colors': `${colorConfig.darkBackground}|${colorConfig.darkText}`
                      })
                    )
                  }
                })
              }
            })

            console.log('SearchHighlight: Created decorations:', decorations.length)
            return DecorationSet.create(newState.doc, decorations)
          }
        },

        props: {
          decorations(state) {
            return this.getState(state)
          }
        }
      })
    ]
  }
})

interface PreviewDialogProps {
  filePath: string | null
  isOpen: boolean
  onClose: () => void
  searchQuery?: string
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
  const { getFileContent } = useApi()

  // 创建搜索高亮扩展实例，当搜索词改变时重新创建
  const searchHighlightExtension = useMemo(() => {
    return SearchHighlight.configure({
      searchTerm: searchQuery,
      className: 'search-highlight'
    })
  }, [searchQuery])

  // 创建 tiptap 编辑器
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 禁用一些不需要的功能以提高性能
        history: false,
        dropcursor: false,
        gapcursor: false,
        // 配置段落以获得更好的预格式化文本显示
        paragraph: {
          HTMLAttributes: {
            style: 'margin: 0; padding: 0; line-height: 1.3; font-family: monospace; white-space: pre-wrap;'
          }
        },
        // 禁用代码块以避免冲突
        codeBlock: false,
        code: false
      }),
      Highlight.configure({
        HTMLAttributes: {
          class: 'manual-highlight'
        }
      }),
      searchHighlightExtension
    ],
    content: '',
    editable: false,
    editorProps: {
      attributes: {
        class: 'preview-content font-mono text-sm leading-tight whitespace-pre-wrap',
        style: 'font-family: monospace; line-height: 1.3; white-space: pre-wrap; outline: none;'
      },
      // 禁用拖拽功能
      handleDrop: () => true,
      handlePaste: () => true
    }
  }, [searchHighlightExtension])

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

  // 当内容改变时更新编辑器
  useEffect(() => {
    if (editor && content) {
      console.log('Preview: Setting content with search query:', searchQuery)
      // 直接设置纯文本内容，让扩展处理高亮
      editor.commands.setContent(`<p style="margin: 0; padding: 0; line-height: 1.3; font-family: monospace; white-space: pre-wrap;">${content.replace(/\n/g, '<br>')}</p>`)
    }
  }, [editor, content, searchQuery])

  // 清理编辑器
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy()
      }
    }
  }, [editor])

  const getFileName = (path: string): string => {
    return path.split('/').pop() || path.split('\\').pop() || path
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold truncate">
            文件预览: {filePath ? getFileName(filePath) : ''}
          </DialogTitle>
          {filePath && (
            <div className="text-sm text-muted-foreground truncate">
              {filePath}
            </div>
          )}
          {searchQuery && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                搜索关键词 ({searchQuery.trim().split(/\s+/).filter(k => k.length > 1).length} 个):
              </div>
              <div className="flex flex-wrap gap-2">
                {searchQuery.trim().split(/\s+/).filter(k => k.length > 1).map((keyword, index) => {
                  const colorConfig = HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length]
                  return (
                    <div
                      key={`${keyword}-${index}`}
                      className="inline-flex items-center px-2 py-1 rounded-md text-xs font-mono font-medium border"
                      style={{
                        backgroundColor: colorConfig.background,
                        color: colorConfig.text,
                        borderColor: colorConfig.text + '30' // 30% opacity for border
                      }}
                    >
                      {keyword}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto bg-secondary/30 rounded border">
          {/* 多关键词高亮样式支持 */}
          <style>{`
            /* 亮色主题 - 内容高亮 */
            .search-highlight.keyword-0 { background-color: #fef08a !important; color: #a16207 !important; }
            .search-highlight.keyword-1 { background-color: #fed7d7 !important; color: #c53030 !important; }
            .search-highlight.keyword-2 { background-color: #c6f6d5 !important; color: #2f855a !important; }
            .search-highlight.keyword-3 { background-color: #bee3f8 !important; color: #2c5282 !important; }
            .search-highlight.keyword-4 { background-color: #e9d8fd !important; color: #553c9a !important; }
            .search-highlight.keyword-5 { background-color: #fed7e2 !important; color: #b83280 !important; }
            .search-highlight.keyword-6 { background-color: #fdd6cc !important; color: #c05621 !important; }
            .search-highlight.keyword-7 { background-color: #d2f5e8 !important; color: #234e52 !important; }
            
            /* 暗色主题 - 内容高亮 */
            @media (prefers-color-scheme: dark) {
              .search-highlight.keyword-0 { background-color: #ca8a04 !important; color: #fef3c7 !important; }
              .search-highlight.keyword-1 { background-color: #e53e3e !important; color: #fed7d7 !important; }
              .search-highlight.keyword-2 { background-color: #38a169 !important; color: #c6f6d5 !important; }
              .search-highlight.keyword-3 { background-color: #3182ce !important; color: #bee3f8 !important; }
              .search-highlight.keyword-4 { background-color: #805ad5 !important; color: #e9d8fd !important; }
              .search-highlight.keyword-5 { background-color: #d53f8c !important; color: #fed7e2 !important; }
              .search-highlight.keyword-6 { background-color: #dd6b20 !important; color: #fdd6cc !important; }
              .search-highlight.keyword-7 { background-color: #319795 !important; color: #d2f5e8 !important; }
            }
            
            /* Tailwind 的 dark 类支持 */
            .dark .search-highlight.keyword-0 { background-color: #ca8a04 !important; color: #fef3c7 !important; }
            .dark .search-highlight.keyword-1 { background-color: #e53e3e !important; color: #fed7d7 !important; }
            .dark .search-highlight.keyword-2 { background-color: #38a169 !important; color: #c6f6d5 !important; }
            .dark .search-highlight.keyword-3 { background-color: #3182ce !important; color: #bee3f8 !important; }
            .dark .search-highlight.keyword-4 { background-color: #805ad5 !important; color: #e9d8fd !important; }
            .dark .search-highlight.keyword-5 { background-color: #d53f8c !important; color: #fed7e2 !important; }
            .dark .search-highlight.keyword-6 { background-color: #dd6b20 !important; color: #fdd6cc !important; }
            .dark .search-highlight.keyword-7 { background-color: #319795 !important; color: #d2f5e8 !important; }
          `}</style>

          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-2">⏳</div>
                <div>正在加载文件内容...</div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-2">❌</div>
                <div className="text-red-600">{error}</div>
              </div>
            </div>
          )}

          {!loading && !error && content && editor && (
            <EditorContent
              editor={editor}
              className="h-full overflow-auto p-4 [&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none [&_.ProseMirror]:font-mono [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-tight [&_.ProseMirror]:whitespace-pre-wrap"
              style={{
                fontFamily: 'monospace',
                lineHeight: '1.3'
              }}
            />
          )}

          {!loading && !error && !content && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-2">📄</div>
                <div className="text-muted-foreground">文件内容为空</div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}