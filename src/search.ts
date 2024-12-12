import axios from 'axios'
import cheerio from 'cheerio'
import { createQueue, getErrorMessage } from './utils'
import fs from 'fs'

export class Browser {
  private baseURL = 'https://www.bing.com/search'

  constructor () {}

  async search (keyword: string) {
    const res = await axios.get(`${this.baseURL}?q=${encodeURIComponent(keyword.split(/\s+/g).join('+'))}`, {
      headers: {
        'Accept-Language': 'zh-CN,zh;q=0.9',  // 添加语言头
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })

    fs.writeFileSync(`./data/search_${keyword}.html`, res.data)

    const $ = cheerio.load(res.data)
    const results = $('.b_algo')
      .map((i, el) => {
        const $el = $(el)
        const title = $el.find('h2').text()
        const link = $el.find('a').attr('href') || ''
        return { title, link }
      })
      .get()

    return results
  }

  async fetch (link: string) {
    try {
      const res = await axios.get(link)
      const $ = cheerio.load(res.data)
      const content = $('body').text()
      return content
    } catch (e) {
      console.error(`[fetch] error ${getErrorMessage(e)}`)
      return ''
    }
  }
}

export class Searcher {
  private browser: Browser
  private llm: LLM
  constructor () {
    this.browser = new Browser()
    this.llm = new LLM()
  }

  async plan (input: string): Promise<{ id: number, content: string }[]> {
    const prompt = PROMPT.PLAN
    const res = await this.llm.generate(`${prompt}\n## 输入\n${input}`)
    console.log(`[plan] ${input} -> ${res}`)

    try {
      const qs = JSON.parse(res)
      return Array.isArray(qs?.questions) ? qs.questions.map((_: string, i: number) => ({ id: i, content: _ })) : []
    } catch (e) {
      console.error(`[plan] error ${e}`)
      return []
    }
  }

  async search (questions: { id: number, content: string }[]) {
    const queue = createQueue({
      name: 'search',
      concurrency: 1,
      delay: 2000,
      timeout: 10000,
      showProgress: true
    })
    const queue2 = createQueue({
      name: 'fetch:content',
      concurrency: 1,
      delay: 2000,
      timeout: 10000,
      showProgress: true
    })

    for (const question of questions) {
      queue.push(async cb => {
        const res = await this.browser.search(question.content)

        const results = res.length > 0 ? res.filter(_ => _.link).slice(0, 3).map((_, i) => ({ ..._, id: i, parentId: question.id })) : []

        for (const result of results) {
          queue2.push(async cb2 => {
            const text = await this.browser.fetch(result.link)
            cb2(undefined, { ...result, content: text })
          })
        }

        cb(undefined, {
          id: question.id,
          content: question.content,
          results,
          success: res.length > 0
        })
      })
    }

    await queue.start()
    await queue2.start()

    const res1 = (queue.queue.results || []).map(_ => _?.[0]) as Question[]
    console.log(`[search] ${JSON.stringify(res1, null, 2)}`)
    const res2 = (queue2.queue.results || []).map(_ => _?.[0]) as SearchResult[]
    const res = res1.map(_ => ({ ..._, results: res2.filter(_ => _.parentId === _.id) }))
    fs.writeFileSync(`./data/search_result_${Date.now()}.json`, JSON.stringify(res, null, 2))

    return res
  }

  async answer (input: string, questions: Question[]) {
    const prompt = PROMPT.SUMMARY
    const res = await this.llm.generate(
      `${prompt}\n## 输入\n${JSON.stringify(questions)}\n## 问题\n${input}`
    )
    return res as string
  }

  async run (input: string) {
    const plan = await this.plan(input)

    if (!plan.length) {
      console.error(`[run] no plan for ${input}`)
      return
    }

    const pages = await this.search(plan)
    const answers = await this.answer(input, pages)
    return answers
  }
}

export class LLM {
  constructor () {}

  async generate (prompt: string) {
    const res = await axios({
      method: 'POST',
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${process.env.API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: 'internlm/internlm2_5-7b-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1024,
        // stop: '',
        temperature: 0.7,
        top_p: 0.7,
        top_k: 50,
        frequency_penalty: 0,
        n: 1,
        response_format: { type: 'text' }
      }
    })

    const data = res.data as {
      id: string
      object: string
      created: number
      model: string
      choices: {
        index: number
        message: {
          role: string
          content: string
        }
        finish_reason: string
      }[]
      usage: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
      }
      system_fingerprint: string
    }

    return data.choices[0].message.content
  }
}

const PROMPT = {
  PLAN: `## 任务介绍
请你将这个问题拆分成能够通过搜索回答的子问题(没有关联的问题可以同步并列搜索），每个搜索的问题应该是一个单一问题，即单个具体人、事、物、具体时间点、地点或知识点的问题，不是一个复合问题(比如某个时间段)
## 注意事项
1. 注意，每个搜索节点的内容必须单个问题，不要包含多个问题(比如同时问多个知识点的问题或者多个事物的比较加筛选，类似 A, B, C 有什么区别,那个价格在哪个区间 -> 分别查询)
## 返回格式示例，结果为JSON格式
===
{
  "questions": [
    "问题1",
    "问题2",
    "问题3"
  ]
}
===
`,
  SUMMARY: `基于提供的问答对，撰写一篇详细完备的最终回答。
- 回答内容需要逻辑清晰，层次分明，确保读者易于理解。
- 回答中每个关键点需标注引用的搜索结果来源(保持跟问答对中的索引一致)，以确保信息的可信度。给出索引的形式为[int]，如果有多个索引，则用多个[]表示，如[id_1][id_2]。
- 回答部分需要全面且完备，不要出现"基于上述内容"等模糊表达，最终呈现的回答不包括提供给你的问答对。
- 语言风格需要专业、严谨，避免口语化表达。
- 保持统一的语法和词汇使用，确保整体文档的一致性和连贯性。`
}

interface SearchResult {
  id: number
  title: string
  link: string
  content?: string
  parentId: number
}

interface Question {
  id: number
  content: string
  results: SearchResult[]
}
