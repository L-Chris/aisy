import fs from 'fs'
import { createQueue } from './utils'
import { PROMPT } from './prompts'
import { LLM } from './llm'
import { Browser } from './browser'

export class Searcher {
  private browser: Browser
  private llm: LLM
  constructor () {
    this.browser = new Browser()
    this.llm = new LLM()
  }

  /**
   * 执行搜索
   */
  async run (
    content: string,
    parentResponses: QuestionAnswer[]
  ) {
    const queue = createQueue({
      name: 'fetch:content',
      concurrency: 1,
      delay: 1000,
      timeout: 10000,
      showProgress: true
    })

    // 默认取前3个链接并进行爬虫
    const links = (await this.browser.search(content))
      .filter(_ => _.url)
      .slice(0, 3)
      .map((_, i) => ({ ..._, id: i }))

    if (links.length === 0) {
      return {
        content,
        pages: [],
        answer: '没有找到相关链接'
      }
    }

    for (const link of links) {
      queue.push(async cb => {
        const text = await this.browser.fetch(link.url)
        cb(undefined, { ...link, content: text, success: !!text })
      })
    }

    await queue.start()

    const pages = (queue.queue.results || []).map(_ => _?.[0]) as Page[]
    fs.writeFileSync(
      `./data/search_result_${Date.now()}.json`,
      JSON.stringify(pages, null, 2)
    )

    const answer = await this.answer(content, pages, parentResponses)

    return {
      content,
      pages,
      answer
    }
  }

  async answer (question: string, pages: Page[], parentResponses: QuestionAnswer[]) {
    const prompt = PROMPT.ANSWER
    const res = await this.llm.generate(
      `${prompt}\n## 已知\n${JSON.stringify(parentResponses)}\n## 输入\n${JSON.stringify(pages)}\n## 问题\n${question}`
    )
    return res as string
  }
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
