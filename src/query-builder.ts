import { LLMPool } from './llm-pool'
import { PROMPT } from './prompts'

interface QueryBuilderOptions {
  maxQueries?: number // 最大查询数量，默认3
}

export interface Query {
  text: string
  platform?: 'xiaohongshu' | 'bing' | 'baidu'
  commands?: string[]
}

export class QueryBuilder {
  private llmPool: LLMPool
  private maxQueries: number

  constructor (llmPool: LLMPool, options?: QueryBuilderOptions) {
    this.llmPool = llmPool
    this.maxQueries = options?.maxQueries || 3
  }

  /**
   * 为单个搜索节点构建优化查询
   */
  async build (content: string, context?: string): Promise<Query> {
    const prompt = `${PROMPT.BUILD_QUERY}
## 问题
${content}
${context ? `\n## 上下文\n${context}` : ''}
## 注意
1. 如果问题涉及指定平台时，请指定使用对应平台搜索: 小红书搜索、百度搜索

## 返回JSON格式，返回中不需要注释，不需要额外添加任何内容
{
  "text": "搜索关键词",
  "platform": "xiaohongshu", // 可选，指定使用小红书搜索
  "commands": ["site:example.com"] // 可选的搜索命令
}
`
    const response = await this.llmPool.next().generate(prompt)
    console.log(response, typeof response)
    try {
      const result = JSON.parse(
        response.replace(/^```json\s*\n/, '').replace(/\n```$/, '')
      )
      return this.optimize(result)
    } catch (error) {
      console.log('[query-builder] error', error)
      // 如果解析失败，返回原始内容的优化查询
      return this.optimize({ text: content })
    }
  }

  /**
   * 优化单个查询，添加搜索指令
   */
  private optimize (query: { text: string; commands?: string[] }): Query {
    const commands = query.commands || []

    // 检测时间相关信息
    if (query.text.includes('最新') || query.text.includes('recent')) {
      commands.push('after:' + this.getRecentDateString())
    }

    // 检测特定领域
    if (query.text.includes('学术') || query.text.includes('研究')) {
      commands.push('site:scholar.google.com')
    }

    // 检测新闻相关
    if (query.text.includes('新闻') || query.text.includes('报道')) {
      commands.push('site:news.google.com')
    }

    return {
      text: query.text,
      commands
    }
  }

  private getRecentDateString (): string {
    const date = new Date()
    date.setMonth(date.getMonth() - 3) // 默认最近3个月
    return date.toISOString().split('T')[0]
  }
}
