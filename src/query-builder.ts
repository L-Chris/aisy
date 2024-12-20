import { LLMPool } from './llm-pool'

interface QueryBuilderOptions {
  maxQueries?: number // 最大查询数量，默认3
}

export interface Query {
  text: string       // 查询文本
  weight?: number    // 查询权重，用于结果合成时的参考
  commands?: string[] // 搜索引擎特定的指令
}

export class QueryBuilder {
  private llmPool: LLMPool
  private maxQueries: number

  constructor(llmPool: LLMPool, options?: QueryBuilderOptions) {
    this.llmPool = llmPool
    this.maxQueries = options?.maxQueries || 3
  }

  /**
   * 为单个搜索节点构建优化查询
   */
  async build(nodeContent: string, context?: string): Promise<Query> {
    const prompt = `## 任务介绍
请为以下搜索内容构建一个优化的搜索查询。
## 要求
1. 使用简洁、准确的描述，避免口语化表达
2. 如果涉及特定领域或时间范围，添加相应的搜索指令
3. 保持核心搜索意图

## 返回格式示例，结果为JSON格式，请严格按照格式返回，不需要额外添加任何内容
{
  "text": "优化后的查询文本",
  "commands": ["site:example.com", "before:2024-01-01"]
}

## 搜索内容
${nodeContent}
`

    const response = await this.llmPool.next().generate(prompt)
    try {
      const result = JSON.parse(response.replace(/^```json\s*\n/, '').replace(/\n```$/, ''))
      return this.optimize(result)
    } catch (error) {
      console.log('[query-builder] error', error)
      // 如果解析失败，返回原始内容的优化查询
      return this.optimize({ text: nodeContent })
    }
  }

  /**
   * 优化单个查询，添加搜索指令
   */
  private optimize(query: { text: string, commands?: string[] }): Query {
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

  private getRecentDateString(): string {
    const date = new Date()
    date.setMonth(date.getMonth() - 3) // 默认最近3个月
    return date.toISOString().split('T')[0]
  }
}