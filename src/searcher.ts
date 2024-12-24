import { createQueue } from './utils'
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
    this.maxResults = options.maxResults || 5
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
    const links = (await this.browser.search(content))
      .filter(_ => _.url)
      .slice(0, this.maxResults)
      .map((_, i) => ({ ..._, id: i }))
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

    timer.start('fetch_contents')
    for (const link of links) {
      queue.push(async cb => {
        const cacheKey = this.getCacheKey(link.url)
        const cached = this.urlCache.get(cacheKey)

        if (cached && this.isValidCache(cached)) {
          console.log(`[Cache] Hit for URL: ${link.url}`)
          cb(undefined, { ...link, content: cached.content, success: true })
          return
        }

        const text = await this.browser.fetch(link.url)
        if (text) {
          // 更新缓存
          this.urlCache.set(cacheKey, {
            content: text,
            timestamp: Date.now()
          })
        }
        cb(undefined, { ...link, content: text, success: !!text })
      })
    }
    await queue.start()
    timer.end('fetch_contents')

    const pages = (queue.queue.results || [])
      .map(_ => _?.[0])
      .filter(_ => !!_) as Page[]

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
}

export interface QuestionAnswer {
  content: string
  answer: string
}
