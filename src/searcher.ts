import { createQueue, getErrorMessage, normalizeLLMResponse } from './utils'
import { PROMPT } from './prompts'
import { LLMPool } from './llm-pool'
import { Browser } from './browser'
import { createHash } from 'crypto'
import { Timer } from './utils'

export class Searcher {
  private browser: Browser
  private llmPool: LLMPool
  private maxConcurrency: number
  private timeout: number
  private maxResults: number
  private urlCache: Map<string, CacheItem>
  
  constructor (options: { 
    proxy?: string,
    maxConcurrency?: number,
    timeout?: number,
    maxResults?: number,
    searchEngine?: 'bing' | 'baidu' | 'xiaohongshu',
    llmPool?: LLMPool
  } = {}) {
    this.browser = new Browser({ 
      proxy: options.proxy,
      searchEngine: options.searchEngine 
    })
    this.llmPool = options.llmPool || new LLMPool()
    this.maxConcurrency = options.maxConcurrency || 10
    this.timeout = options.timeout || 10000
    this.maxResults = options.maxResults || 10
    this.urlCache = new Map()
  }

  private getCacheKey(url: string): string {
    return createHash('md5').update(url).digest('hex')
  }

  private isValidCache(cacheItem: CacheItem): boolean {
    // 缓存有效期延长到24小时
    const CACHE_TTL = 24 * 60 * 60 * 1000 
    return Date.now() - cacheItem.timestamp < CACHE_TTL
  }

  private async evaluateRelevance(
    question: string, 
    searchResults: Array<{
      title: string, 
      description: string, 
      url: string,
      platform?: string,
      metadata?: any
    }>
  ): Promise<Array<{title: string, description: string, url: string, relevance: number}>> {
    try {
      const prompt = `${PROMPT.RELEVANCE_EVALUATION}
## 问题
${question}
## 搜索结果
${searchResults.map((r, i) => `
[${i}]
标题: ${r.title}
描述: ${r.description}
平台: ${r.platform || '通用网页'}
${r.metadata ? `附加信息:\n${Object.entries(r.metadata)
  .map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : ''}
链接: ${r.url}
`).join('\n')}`
      
          const response = await this.llmPool.next().generate(prompt, 'json_object')
          const scores = normalizeLLMResponse(response) as Array<{index: number, relevance: number}>
          
          return searchResults.map((result, index) => {
            const score = scores.find(s => s.index === index)?.relevance || 0
            return {
              ...result,
              relevance: score
            }
          })
    } catch (e) {
      console.error(`[evaluateRelevance] error ${getErrorMessage(e)}`)
      return searchResults.map((r, i) => ({ ...r, relevance: 0, id: i }))
    }
  }

  /**
   * 执行搜索
   */
  async run (
    content: string,
    query: string,
    parentResponses: QuestionAnswer[]
  ) {
    const timer = new Timer()
    timer.start('total_search')

    // 创建并发队列
    const queue = createQueue({
      name: 'fetch:content',
      concurrency: this.maxConcurrency,
      timeout: this.timeout,
      showProgress: false
    })

    timer.start('search_links')
    const links = await this.browser.search(query)
    timer.end('search_links')

    if (links.length === 0) {
      timer.end('total_search')
      return {
        content,
        pages: [],
        answer: '没有找到相关链接',
        timing: timer.getMetrics()
      }
    }

    // 快速评估相关性
    timer.start('evaluate_relevance')
    const evaluatedLinks = await this.evaluateRelevance(content, links)
    // 过滤掉相关性低于 50 分的结果
    const relevantLinks = evaluatedLinks
      .filter(link => link.relevance >= 60)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, this.maxResults)
      .map((link, i) => ({ ...link, id: i }))
    timer.end('evaluate_relevance')

    console.log(`[Searcher] Found ${links.length} links, ${relevantLinks.length} relevant after filtering`)
    
    if (relevantLinks.length === 0) {
      timer.end('total_search')
      return {
        content,
        pages: [],
        answer: '未找到足够相关的网页内容',
        timing: timer.getMetrics()
      }
    }

    // 爬取相关网页的内容
    timer.start('fetch_contents')
    for (const link of relevantLinks) {
      queue.push(async cb => {
        const cacheKey = this.getCacheKey(link.url)
        const cached = this.urlCache.get(cacheKey)

        if (cached && this.isValidCache(cached)) {
          console.log(`[Cache] Hit for URL: ${link.url}`)
          cb(undefined, { 
            ...link, 
            content: cached.content,
            url: cached.finalUrl,
            success: true 
          })
          return
        }

        const result = await this.browser.fetch(link.url)
        if (result.content) {
          this.urlCache.set(cacheKey, {
            content: result.content,
            finalUrl: result.finalUrl,
            timestamp: Date.now()
          })
        }
        cb(undefined, { 
          ...link, 
          content: result.content,
          url: result.finalUrl,
          success: !!result.content 
        })
      })
    }
    await queue.start()
    timer.end('fetch_contents')

    const pages = (queue.queue.results || [])
      .map(_ => _?.[0])
      .filter(_ => !!_) as Page[]

    // 更新 Page 接口以包含新字段
    timer.start('generate_answer')
    const answer = await this.answer(content, pages, parentResponses)
    timer.end('generate_answer')

    timer.end('total_search')

    return {
      content,
      pages,
      answer,
      timing: timer.getMetrics()
    }
  }

  async answer (question: string, pages: Page[], parentResponses: QuestionAnswer[]) {
    const prompt = PROMPT.ANSWER
    const res = await this.llmPool.next().generate(
      `${prompt}
## 已知
${parentResponses.map(r => `- 问题：${r.content}\n- 回答：${r.answer}`).join('\n---\n')}
## 当前问题
${question}
## 当前问题的搜索结果
${pages.map(p => `
- 标题：${p.title}
- 平台：${p.platform || '通用网页'}
${p.metadata ? `- 附加信息：\n  ${Object.entries(p.metadata)
  .map(([k, v]) => `  - ${k}: ${v}`).join('\n')}` : ''}
- 链接：${p.url}
- 内容：${p.content}
`).join('\n---\n')}
`)
    return res as string
  }
}

interface CacheItem {
  content: string
  finalUrl: string
  timestamp: number
}

export interface Page {
  id: number
  title: string
  url: string
  content?: string
  description?: string
  relevance?: number
  platform?: string
  metadata?: {
    author?: string
    likes?: string
    comments?: string
    publishTime?: string
    [key: string]: any
  }
}

export interface QuestionAnswer {
  content: string
  answer: string
}
