import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '../lib/utils'

interface ReactMarkdownChatMessageProps {
  content: string
  isStreaming?: boolean
  className?: string
}

export const ReactMarkdownChatMessage: React.FC<ReactMarkdownChatMessageProps> = ({
  content,
  isStreaming = false,
  className = ''
}) => {
  if (!content && !isStreaming) {
    return null
  }

  return (
    <div className={cn("relative", className)}>
      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:mb-1 prose-p:mt-0 prose-headings:mb-1 prose-headings:mt-1 prose-ul:mb-1 prose-ol:mb-1">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Compact code blocks for chat
            code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '')
              
              return !inline && match ? (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  className="rounded border text-xs my-1"
                  customStyle={{
                    fontSize: '11px',
                    padding: '6px 8px',
                    margin: '2px 0'
                  }}
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code 
                  className="relative rounded bg-muted px-1 py-0.5 font-mono text-xs font-semibold" 
                  {...props}
                >
                  {children}
                </code>
              )
            },
            
            // Ultra compact headings
            h1: ({ children }) => (
              <h1 className="text-base font-bold mb-0.5 mt-1 first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-sm font-semibold mb-0.5 mt-1">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-sm font-medium mb-0.5 mt-1">
                {children}
              </h3>
            ),
            
            // Ultra compact paragraphs
            p: ({ children }) => (
              <p className="text-sm leading-4 mb-1 last:mb-0">
                {children}
              </p>
            ),
            
            // Ultra compact lists
            ul: ({ children }) => (
              <ul className="space-y-0 mb-1 ml-3 list-disc list-outside text-sm">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="space-y-0 mb-1 ml-3 list-decimal list-outside text-sm">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-sm leading-5 ml-3">
                {children}
              </li>
            ),
            
            // Ultra compact links
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
            
            // Ultra compact blockquotes
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-muted pl-2 italic text-muted-foreground bg-muted/10 py-0.5 my-1 text-sm">
                {children}
              </blockquote>
            ),
            
            // Ultra compact tables
            table: ({ children }) => (
              <div className="overflow-x-auto scrollbar-hide my-1">
                <table className="min-w-full border border-border rounded text-xs">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border border-border px-1.5 py-0.5 text-left font-medium text-sm bg-muted/30">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-border px-1.5 py-0.5 text-sm">
                {children}
              </td>
            ),
            
            // Ultra compact horizontal rule
            hr: () => (
              <hr className="border-border my-1.5" />
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-1" />
      )}
    </div>
  )
}

export default ReactMarkdownChatMessage