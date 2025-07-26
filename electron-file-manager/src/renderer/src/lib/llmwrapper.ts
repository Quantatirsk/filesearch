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
          model: options.model || 'gpt-4.1-mini',
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
        start(controller) {
          let buffer = ''
          
          const processStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read()
                
                if (done) {
                  // Process any remaining data in buffer
                  if (buffer.trim()) {
                    console.warn('Unprocessed data in buffer:', buffer)
                  }
                  controller.close()
                  break
                }

                const chunk = decoder.decode(value, { stream: true })
                buffer += chunk
                
                // Process complete lines
                const lines = buffer.split('\n')
                buffer = lines.pop() || '' // Keep incomplete line in buffer

                for (const line of lines) {
                  const trimmedLine = line.trim()
                  if (!trimmedLine) continue
                  
                  if (trimmedLine.startsWith('data: ')) {
                    const data = trimmedLine.slice(6)
                    
                    if (data === '[DONE]') {
                      controller.close()
                      return
                    }

                    try {
                      const parsed = JSON.parse(data) as StreamChunk
                      const content = parsed.choices[0]?.delta?.content
                      
                      if (content) {
                        console.log('[LLMWrapper] Enqueuing content chunk:', JSON.stringify(content))
                        controller.enqueue(content)
                      }
                    } catch (parseError) {
                      console.warn('Failed to parse stream chunk:', data, parseError)
                    }
                  }
                }
              }
            } catch (error) {
              console.error('[LLMWrapper] Stream processing error:', error)
              controller.error(error)
            } finally {
              // Clean up the original reader
              try {
                reader.releaseLock()
              } catch (e) {
                console.warn('Error releasing original reader:', e)
              }
            }
          }
          
          processStream()
        }
      })
    } catch (error) {
      console.error('LLM stream chat error:', error)
      throw new Error(`LLM stream chat failed: ${error}`)
    }
  }

  /**
   * Summarize file content (streaming)
   */
  async streamSummarizeFile(content: string, maxLength: number = 10000): Promise<ReadableStream<string>> {
    // Truncate content if too long
    const truncatedContent = this.truncateContent(content, maxLength)
    
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `用户将提供一篇文档，请告诉读者这篇文档的有什么内容，结合有序列表、加粗字体简要陈列文档的主要信息或观点，语言简洁明了。`
      },
      {
        role: 'user',
        content: `${truncatedContent}\n\n 请概括上述内容，不要有任何解释，直接输出文档概要：`
      }
    ]

    console.log('Creating stream for file summarization...')
    const stream = await this.streamChat({
      messages,
      temperature: 0.3,
      maxTokens: 2000
    })
    console.log('Stream created successfully')
    return stream
  }

  /**
   * Extract keywords from user query (non-streaming)
   */
  async extractKeywords(query: string): Promise<string[][]> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是一个专业的关键词提取助手。根据用户查询，提取不同长度的关键词组合用于文件搜索。

**重要规则：**
1. **只返回JSON数组，不要包含任何解释文字**
2. 生成2-4组不同长度的关键词组合
3. 包含：
   - 1-2组两个关键词（最核心的2个词汇，提高召回率）
   - 1-2组三个关键词（提高精确度，用于精准搜索）
4. 包含同义词、英文缩写、相关概念
5. 考虑不同的搜索角度和表达方式

**输出格式（严格按照此格式，不要有其他文字）：**
[
  ["核心词", "相关词"],
  ["技术词", "应用词"],
  ["概念词", "方法词", "领域词"]
]

**示例：**
查询："机器学习算法"
输出：
[
  ["机器学习", "算法"],
  ["深度学习", "训练"],
  ["神经网络", "预测", "分类"]
]`
      },
      {
        role: 'user',
        content: `用户查询："${query}"\n\n请提取关键词组合（只返回JSON数组）：`
      }
    ]

    try {
      const response = await this.chat({
        messages,
        temperature: 0.3,
        maxTokens: 400
      })

      // Clean and parse JSON response
      let cleanedResponse = response.trim()
      
      // Try to extract JSON array from response if it contains extra text
      const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0]
      }
      
      console.log('Keywords extraction response:', cleanedResponse)
      const parsed = JSON.parse(cleanedResponse)
      
      if (Array.isArray(parsed) && parsed.every(group => Array.isArray(group))) {
        // Filter out empty groups and ensure each group has valid keywords
        const validGroups = parsed
          .filter(group => group.length > 0)
          .map(group => group.filter(keyword => typeof keyword === 'string' && keyword.trim().length > 0))
          .filter(group => group.length > 0)
        
        if (validGroups.length > 0) {
          return validGroups as string[][]
        }
      }
      
      throw new Error('Invalid response format')
    } catch (error) {
      console.warn('Failed to extract keywords, using fallback:', error)
      // Enhanced fallback: create multiple search strategies
      const baseKeywords = query.split(/\s+/).filter(word => word.length > 1)
      return [
        baseKeywords, // Original query words
        [query], // Full query as single term
        baseKeywords.slice(0, 2) // First two words only
      ].filter(group => group.length > 0)
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
        content: `你是一个专业的文件相关性分析助手。根据用户查询和搜索结果，分析文件相关性并提供推荐。

**重要规则：**
1. **只返回JSON格式，不要包含任何解释文字**
2. 分析用户查询意图和需求
3. 评估每个文件的相关性程度
4. 按相关性从高到低排序，推荐5-10个最相关文件
5. 提供简洁清晰的推荐理由

**输出格式（严格按照此格式）：**
{
  "reasoning": "基于用户查询分析，推荐以下文件的理由",
  "recommendedFiles": ["文件路径1", "文件路径2", "文件路径3"]
}

**分析要点：**
- 文件名与查询的匹配度
- 文件类型的相关性
- 内容预览的相关性
- 文件的匹配评分`
      },
      {
        role: 'user',
        content: `用户查询："${userQuery}"

可选文件列表：
${JSON.stringify(filesInfo, null, 2)}

请分析并推荐最相关的文件（只返回JSON格式）：`
      }
    ]

    try {
      const response = await this.chat({
        messages,
        temperature: 0.3,
        maxTokens: 600
      })

      // Clean and parse JSON response
      let cleanedResponse = response.trim()
      
      // Try to extract JSON object from response if it contains extra text
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0]
      }
      
      console.log('File relevance analysis response:', cleanedResponse)
      const parsed = JSON.parse(cleanedResponse)
      
      if (parsed.reasoning && Array.isArray(parsed.recommendedFiles)) {
        // Map file paths back to full file objects
        const recommendedFiles = parsed.recommendedFiles
          .map((filePath: string) => files.find(f => f.file_path === filePath))
          .filter(Boolean)
          .slice(0, 10) // Limit to 10 files max

        return {
          reasoning: parsed.reasoning,
          recommendedFiles
        }
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      console.warn('Failed to analyze relevance, using fallback:', error)
      // Enhanced fallback: return top files by match score with better reasoning
      const topFiles = files
        .slice(0, 10)
        .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
      
      return {
        reasoning: `基于搜索匹配度和文件类型相关性，为查询"${userQuery}"推荐以下${topFiles.length}个文件。推荐顺序按匹配度从高到低排列。`,
        recommendedFiles: topFiles
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
        model: options.model || 'gpt-4.1-mini',
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