import puppeteer, { Browser as PuppeteerBrowser, Page } from 'puppeteer'
import { getErrorMessage } from './utils'

export class Browser {
  private baseURL = 'https://www.bing.com/search'
  private proxy?: string
  private static instance?: Browser
  private static browserInstance?: PuppeteerBrowser
  private static pagePool: Page[] = []
  private static MAX_PAGES = 3
  private searchEngine: 'bing' | 'baidu' = 'bing'

  constructor(options: { 
    proxy?: string,
    maxPages?: number,
    baseURL?: string,
    searchEngine?: 'bing' | 'baidu'
  } = {}) {
    this.proxy = options.proxy
    this.searchEngine = options.searchEngine || 'bing'
    this.baseURL = options.baseURL || (
      this.searchEngine === 'baidu' 
        ? 'https://www.baidu.com/s' 
        : 'https://www.bing.com/search'
    )
    Browser.MAX_PAGES = options.maxPages || 3
    if (!Browser.instance) {
      Browser.instance = this
    }
    return Browser.instance
  }

  private async initBrowser() {
    if (!Browser.browserInstance) {
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-sync',
        '--no-first-run',
        '--blink-settings=imagesEnabled=false'
      ]
      if (this.proxy) {
        args.push(`--proxy-server=${this.proxy}`)
      }
      
      Browser.browserInstance = await puppeteer.launch({
        headless: true,
        args,
        timeout: 0
      })
    }
    
    let page = Browser.pagePool.pop()
    if (!page) {
      page = await Browser.browserInstance.newPage()
      await page.setRequestInterception(true)
      page.on('request', request => {
        if (request.resourceType() === 'document') {
          request.continue()
        } else {
          request.abort()
        }
      })
      
      await page.setViewport({ width: 1280, height: 800 })
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9'
      })
    }
    
    return page
  }

  private async releasePage(page: Page) {
    if (Browser.pagePool.length < Browser.MAX_PAGES) {
      Browser.pagePool.push(page)
    } else {
      await page.close()
    }
  }

  private async request(url: string) {
    let page: Page | undefined
    try {
      page = await this.initBrowser()
      await page.goto(url, { 
        waitUntil: 'networkidle0',
        timeout: 10000
      })
      
      const content = await page.evaluate(() => {
        // @ts-ignore
        const scripts = document.getElementsByTagName('script')
        // @ts-ignore
        const styles = document.getElementsByTagName('style')
        for (const element of [...scripts, ...styles]) {
          element.remove()
        }
        // @ts-ignore
        return document.body.innerText
      })
      
      return content
    } catch (e) {
      console.error(`[request] error ${getErrorMessage(e)}`)
      return ''
    } finally {
      if (page) {
        await this.releasePage(page)
      }
    }
  }

  async search(keyword: string) {
    console.log(`[search] searching for ${keyword}`)
    const page = await this.initBrowser()
    
    try {
      if (this.searchEngine === 'baidu') {
        await page.goto(`${this.baseURL}?wd=${encodeURIComponent(keyword)}`, { waitUntil: 'networkidle0' })
        await page.waitForSelector('.result.c-container')
        
        const results = await page.evaluate(() => {
          // @ts-ignore
          const items = document.querySelectorAll('.result.c-container')
          return Array.from(items).map(item => {
            // @ts-ignore
            const titleEl = item.querySelector('.t a, .c-title a')
            const title = titleEl?.textContent?.trim() || ''
            const url = titleEl?.getAttribute('href') || ''
            return { title, url }
          }).filter(item => item.url)
        })

        // 处理百度的重定向链接
        const processedResults = []
        for (const result of results) {
          try {
            const response = await page.goto(result.url, { waitUntil: 'networkidle0' })
            const finalUrl = response?.url() || result.url
            if (!finalUrl.includes('baidu.com')) {
              processedResults.push({
                ...result,
                url: finalUrl
              })
            }
          } catch (error) {
            console.error(`Failed to process URL: ${result.url}`, error)
          }
        }

        return processedResults
      } else {
        // 原有的必应搜索逻辑
        await page.goto(`${this.baseURL}?q=${encodeURIComponent(keyword)}`)
        await page.waitForSelector('#b_results')
        
        return await page.evaluate(() => {
          // @ts-ignore
          const items = document.querySelectorAll('#b_results > li.b_algo')
          return Array.from(items).map(item => {
            // @ts-ignore
            const titleEl = item.querySelector('h2 a')
            const title = titleEl?.textContent?.trim() || ''
            const url = titleEl?.getAttribute('href') || ''
            return { title, url }
          }).filter(item => item.url)
        })
      }
    } catch (e) {
      console.error(`[search] error ${getErrorMessage(e)}`)
      return []
    } finally {
      if (page) {
        await this.releasePage(page)
      }
    }
  }

  async fetch(url: string) {
    try {
      return this.request(url)
    } catch (e) {
      console.error(`[fetch] error ${getErrorMessage(e)}`)
      return ''
    }
  }

  static async close() {
    if (Browser.browserInstance) {
      for (const page of Browser.pagePool) {
        await page.close()
      }
      Browser.pagePool = []
      
      await Browser.browserInstance.close()
      Browser.browserInstance = undefined
    }
  }
}
