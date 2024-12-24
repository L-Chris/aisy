import { createQueue, getErrorMessage } from './utils'
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
    searchEngine?: 'bing' | 'baidu',
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
    // 缓存有效期为1小时
    const CACHE_TTL = 60 * 60 * 1000
    return Date.now() - cacheItem.timestamp < CACHE_TTL
  }

  private async evaluateRelevance(
    question: string, 
    searchResults: Array<{title: string, description: string, url: string}>
  ): Promise<Array<{title: string, description: string, url: string, relevance: number}>> {
    try {
      const prompt = `请评估以下搜索结果与问题的相关性。
      ## 问题
      ${question}
      
      ## 搜索结果
      ${searchResults.map((r, i) => `
      [${i}]
      标题: ${r.title}
      描述: ${r.description}
      链接: ${r.url}
      `).join('\n')}
      
      ## 返回格式
      请返回 JSON 格式的数组，每个元素包含索引和相关性评分(0-100)。例如:
      [
        {"index": 0, "relevance": 85},
        {"index": 1, "relevance": 30}
      ]
      只返回 JSON，不要其他说明。`
      
          const response = await this.llmPool.next().generate(prompt, 'json_object')
          console.log(response)
          const scores = JSON.parse(response.replace(/^```json\s*\n/, '').replace(/\n```$/, '')) as Array<{index: number, relevance: number}>
          
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
    parentResponses: QuestionAnswer[]
  ) {
    const timer = new Timer()
    timer.start('total_search')

    const queue = createQueue({
      name: 'fetch:content',
      concurrency: this.maxConcurrency,
      timeout: this.timeout,
      showProgress: true
    })

    timer.start('search_links')
    const links = await this.browser.search(content)
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

    // 评估相关性
    timer.start('evaluate_relevance')
    const evaluatedLinks = await this.evaluateRelevance(content, links)
    // 过滤掉相关性低于 50 分的结果
    const relevantLinks = evaluatedLinks
      .filter(link => link.relevance >= 50)
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
            success: true 
          })
          return
        }

        const text = await this.browser.fetch(link.url)
        if (text) {
          this.urlCache.set(cacheKey, {
            content: text,
            timestamp: Date.now()
          })
        }
        cb(undefined, { 
          ...link, 
          content: text, 
          success: !!text 
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
${pages.map(p => `- 标题：${p.title}\n- 链接：${p.url}\n- 内容：${p.content}`).join('\n---\n')}
`)
    return res as string
  }
}

interface CacheItem {
  content: string
  timestamp: number
}

export interface Page {
  id: number
  title: string
  url: string
  content?: string
  description?: string
  relevance?: number
}

export interface QuestionAnswer {
  content: string
  answer: string
}
