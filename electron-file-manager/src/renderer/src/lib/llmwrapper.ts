/**
 * LLM Wrapper for unified frontend LLM API calls
 * 
 * Provides both streaming and non-streaming interfaces for LLM interactions.
 * - Streaming: Used for conversational chat interfaces
 * - Non-streaming: Used for agent-type operations like file summarization
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  messages: ChatMessage[]
  stream?: boolean
  maxTokens?: number
  temperature?: number
  model?: string
}

export interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message?: ChatMessage
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface StreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      content?: string
    }
    finish_reason?: string
  }>
}

export class LLMWrapper {
  private baseUrl: string

  constructor() {
    // Use the same base URL as the main API
    this.baseUrl = 'http://localhost:8001'
  }

  /**
   * Non-streaming chat completion (for agent-type operations)
   */
  async chat(options: ChatCompletionOptions): Promise<string> {
    try {
      const response = await this.makeRequest({
        ...options,
        stream: false
      })

      const data = response as ChatCompletionResponse
      return data.choices[0]?.message?.content || ''
    } catch (error) {
      console.error('LLM chat error:', error)
      throw new Error(`LLM chat failed: ${error}`)
    }
  }

  /**
   * Streaming chat completion (for conversational interfaces)
   */
  async streamChat(options: ChatCompletionOptions): Promise<ReadableStream<string>> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: options.model || 'gpt-3.5-turbo',
          messages: options.messages,
          stream: true,
          max_tokens: options.maxTokens,
          temperature: options.temperature || 0.7
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      if (!response.body) {
        throw new Error('No response body received')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      return new ReadableStream<string>({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read()
              
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split('\n')

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6)
                  
                  if (data === '[DONE]') {
                    controller.close()
                    return
                  }

                  try {
                    const parsed = JSON.parse(data) as StreamChunk
                    const content = parsed.choices[0]?.delta?.content
                    
                    if (content) {
                      controller.enqueue(content)
                    }
                  } catch (parseError) {
                    console.warn('Failed to parse stream chunk:', data)
                  }
                }
              }
            }
          } catch (error) {
            controller.error(error)
          } finally {
            reader.releaseLock()
          }
        }
      })
    } catch (error) {
      console.error('LLM stream chat error:', error)
      throw new Error(`LLM stream chat failed: ${error}`)
    }
  }

  /**
   * Summarize file content (non-streaming)
   */
  async summarizeFile(content: string, maxLength: number = 4000): Promise<string> {
    // Truncate content if too long
    const truncatedContent = this.truncateContent(content, maxLength)
    
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是一个专业的文件内容分析助手。请为用户提供简洁、准确的文件内容概述。

要求：
1. 用中文回复
2. 总结要点简洁明了，突出重点
3. 如果是代码文件，说明主要功能和技术栈
4. 如果是文档，概括主要内容和观点
5. 控制在200字以内`
      },
      {
        role: 'user',
        content: `请概括以下文件内容：\n\n${truncatedContent}`
      }
    ]

    return await this.chat({
      messages,
      temperature: 0.3,
      maxTokens: 500
    })
  }

  /**
   * Extract keywords from user query (non-streaming)
   */
  async extractKeywords(query: string): Promise<string[][]> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是一个智能关键词提取助手。根据用户的自然语言查询，提取多组可能的关键词组合用于文件搜索。

要求：
1. 返回JSON数组格式，每个元素是一个关键词数组
2. 生成3-5组不同的关键词组合
3. 包含同义词、相关词、英文词汇
4. 考虑不同的表达方式和搜索策略

示例输出：
[
  ["机器学习", "ML", "算法"],
  ["人工智能", "AI", "深度学习"],
  ["数据科学", "模型训练"]
]`
      },
      {
        role: 'user',
        content: `用户查询：${query}\n\n请提取关键词组合：`
      }
    ]

    try {
      const response = await this.chat({
        messages,
        temperature: 0.7,
        maxTokens: 300
      })

      // Parse JSON response
      const cleanedResponse = response.trim()
      const parsed = JSON.parse(cleanedResponse)
      
      if (Array.isArray(parsed) && parsed.every(group => Array.isArray(group))) {
        return parsed as string[][]
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      console.warn('Failed to extract keywords, using fallback:', error)
      // Fallback: simple word splitting
      return [query.split(/\s+/).filter(word => word.length > 1)]
    }
  }

  /**
   * Analyze file relevance and provide recommendations (non-streaming)
   */
  async analyzeRelevance(userQuery: string, files: any[]): Promise<{
    reasoning: string
    recommendedFiles: any[]
  }> {
    const filesInfo = files.slice(0, 20).map(file => ({
      path: file.file_path,
      name: file.file_name,
      type: file.file_type,
      preview: file.content_preview || '',
      score: file.match_score
    }))

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是一个智能文件推荐助手。根据用户查询和搜索结果，分析文件相关性并提供推荐。

要求：
1. 用中文回复
2. 分析用户查询意图
3. 评估每个文件的相关性
4. 按相关性排序，推荐最相关的5-10个文件
5. 提供推荐理由

返回JSON格式：
{
  "reasoning": "分析过程和推荐理由",
  "recommendedFiles": [文件路径数组，按相关性排序]
}`
      },
      {
        role: 'user',
        content: `用户查询：${userQuery}

搜索结果文件列表：
${JSON.stringify(filesInfo, null, 2)}

请分析并推荐最相关的文件：`
      }
    ]

    try {
      const response = await this.chat({
        messages,
        temperature: 0.5,
        maxTokens: 800
      })

      const parsed = JSON.parse(response.trim())
      
      if (parsed.reasoning && Array.isArray(parsed.recommendedFiles)) {
        // Map file paths back to full file objects
        const recommendedFiles = parsed.recommendedFiles
          .map((filePath: string) => files.find(f => f.file_path === filePath))
          .filter(Boolean)

        return {
          reasoning: parsed.reasoning,
          recommendedFiles
        }
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      console.warn('Failed to analyze relevance, using fallback:', error)
      // Fallback: return top files by match score
      return {
        reasoning: '基于搜索匹配度进行排序',
        recommendedFiles: files.slice(0, 10).sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
      }
    }
  }

  /**
   * Truncate content intelligently
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content
    }

    // Intelligent truncation: prioritize beginning and end
    const startLength = Math.floor(maxLength * 0.7)
    const endLength = maxLength - startLength - 50 // 50 chars for ellipsis

    return content.substring(0, startLength) + 
           '\n\n... [中间内容已省略] ...\n\n' + 
           content.substring(content.length - endLength)
  }

  /**
   * Make HTTP request to LLM API
   */
  private async makeRequest(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || 'gpt-3.5-turbo',
        messages: options.messages,
        stream: options.stream || false,
        max_tokens: options.maxTokens,
        temperature: options.temperature || 0.7
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }
}

// Export singleton instance
export const llmWrapper = new LLMWrapper()