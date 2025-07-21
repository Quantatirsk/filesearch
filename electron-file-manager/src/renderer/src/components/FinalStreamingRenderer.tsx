import React, { useState, useRef, useEffect } from 'react'
import { ReactMarkdownRenderer } from './ReactMarkdownRenderer'

interface FinalStreamingRendererProps {
  stream: ReadableStream<string> | null
  className?: string
  onComplete?: () => void
  placeholder?: string
  autoScroll?: boolean
}

export const FinalStreamingRenderer: React.FC<FinalStreamingRendererProps> = ({
  stream,
  className = '',
  onComplete,
  placeholder = "正在生成内容...",
  autoScroll = true
}) => {
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const processedStreamsRef = useRef<WeakSet<ReadableStream<string>>>(new WeakSet())
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!stream) {
      console.log('[FinalStreamingRenderer] No stream provided')
      return
    }

    // Check if we've already processed this exact stream object
    if (processedStreamsRef.current.has(stream)) {
      console.log('[FinalStreamingRenderer] Stream already processed, skipping')
      return
    }

    // Mark this stream as processed immediately
    processedStreamsRef.current.add(stream)

    console.log('[FinalStreamingRenderer] Starting to process new stream, locked?', stream.locked)
    
    const processStream = async () => {
      setIsLoading(true)
      setError(null)
      setContent('')

      try {
        if (stream.locked) {
          console.warn('[FinalStreamingRenderer] Stream is already locked')
          setError('Stream is already being processed')
          setIsLoading(false)
          return
        }

        const reader = stream.getReader()
        let accumulated = ''

        console.log('[FinalStreamingRenderer] Got reader, starting to read chunks')

        try {
          let chunkCount = 0
          while (true) {
            const result = await reader.read()
            const { done, value } = result
            
            console.log('[FinalStreamingRenderer] Read result:', { done, value: value ? `"${value}" (${value.length} chars)` : 'null', chunkCount })
            
            if (done) {
              console.log('[FinalStreamingRenderer] Stream completed, final content length:', accumulated.length)
              console.log('[FinalStreamingRenderer] Final content:', accumulated)
              break
            }

            if (value) {
              accumulated += value
              chunkCount++
              console.log('[FinalStreamingRenderer] Chunk #' + chunkCount + ':', JSON.stringify(value))
              console.log('[FinalStreamingRenderer] Accumulated so far:', accumulated)
              setContent(accumulated)
              
              // Auto scroll to bottom when new content is added
              if (autoScroll) {
                requestAnimationFrame(() => {
                  // Find the scroll area viewport (parent container)
                  const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]')
                  if (scrollContainer) {
                    scrollContainer.scrollTop = scrollContainer.scrollHeight
                  } else if (contentRef.current) {
                    // Fallback to direct element scroll
                    contentRef.current.scrollTop = contentRef.current.scrollHeight
                  }
                })
              }
            }
          }
        } finally {
          reader.releaseLock()
          console.log('[FinalStreamingRenderer] Reader released')
        }
      } catch (err) {
        console.error('[FinalStreamingRenderer] Stream processing error:', err)
        setError(err instanceof Error ? err.message : 'Stream processing failed')
      } finally {
        console.log('[FinalStreamingRenderer] Processing finished, calling onComplete')
        setIsLoading(false)
        onComplete?.()
      }
    }

    processStream()
  }, [stream, onComplete])

  if (error) {
    return (
      <div className="text-red-500 p-4 border border-red-300 rounded-md bg-red-50">
        <p className="font-semibold">处理错误</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  if (!content && isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="text-muted-foreground">{placeholder}</span>
        </div>
      </div>
    )
  }

  if (!content && !isLoading) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p>暂无内容</p>
      </div>
    )
  }

  return (
    <div ref={contentRef} className="relative">
      <ReactMarkdownRenderer content={content} className={className} />
    </div>
  )
}

export default FinalStreamingRenderer