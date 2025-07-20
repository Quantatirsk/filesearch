import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '../lib/utils'

interface ReactMarkdownRendererProps {
  content: string
  className?: string
}

export const ReactMarkdownRenderer: React.FC<ReactMarkdownRendererProps> = ({
  content,
  className = ''
}) => {
  if (!content || content.trim() === '') {
    return (
      <div className="text-center text-muted-foreground py-4">
        <p>暂无内容</p>
      </div>
    )
  }

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Code block with syntax highlighting
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            
            return !inline && match ? (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                className="rounded border overflow-x-auto scrollbar-hide text-xs my-2"
                customStyle={{
                  fontSize: '11px',
                  padding: '8px 12px',
                  margin: '8px 0'
                }}
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code 
                className={cn(
                  "relative rounded bg-muted px-1 py-0.5 font-mono text-xs font-semibold",
                  className
                )} 
                {...props}
              >
                {children}
              </code>
            )
          },
          
          // Ultra compact heading styles
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-foreground mb-1 mt-2 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-foreground mb-1 mt-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-foreground mb-0.5 mt-1.5">
              {children}
            </h3>
          ),
          
          // Compact paragraph styling
          p: ({ children }) => (
            <p className="text-sm text-muted-foreground leading-5 mb-2">
              {children}
            </p>
          ),
          
          // Compact list styling
          ul: ({ children }) => (
            <ul className="space-y-0.5 mb-2 ml-3 list-disc list-outside">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-0.5 mb-2 ml-3 list-decimal list-outside">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-muted-foreground leading-5">
              {children}
            </li>
          ),
          
          // Compact link styling
          a: ({ href, children }) => (
            <a 
              href={href}
              className="text-primary hover:text-primary/80 underline underline-offset-1 text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          
          // Compact blockquote styling
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-muted pl-3 italic text-muted-foreground bg-muted/20 py-1 my-2 rounded-r text-sm">
              {children}
            </blockquote>
          ),
          
          // Compact table styling
          table: ({ children }) => (
            <div className="overflow-x-auto scrollbar-hide my-2">
              <table className="min-w-full border border-border rounded text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-border px-2 py-1 text-left font-semibold text-sm">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1 text-sm">
              {children}
            </td>
          ),
          
          // Compact horizontal rule
          hr: () => (
            <hr className="border-border my-3" />
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default ReactMarkdownRenderer