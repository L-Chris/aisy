import puppeteer, { Browser as PuppeteerBrowser, Page } from 'puppeteer'
import { getErrorMessage } from './utils'

export class Browser {
  private baseURL = 'https://www.bing.com/search'
  private proxy?: string
  private static instance?: Browser
  private static browserInstance?: PuppeteerBrowser
  private static pagePool: Page[] = []
  private static MAX_PAGES = 10
  private searchEngine: 'bing' | 'baidu' | 'xiaohongshu' = 'bing'

  constructor(options: { 
    proxy?: string,
    maxPages?: number,
    baseURL?: string,
    searchEngine?: 'bing' | 'baidu' | 'xiaohongshu'
  } = {}) {
    this.proxy = options.proxy
    this.searchEngine = options.searchEngine || 'bing'
    this.baseURL = options.baseURL || this.getDefaultBaseURL()
    Browser.MAX_PAGES = options.maxPages || 10
    if (!Browser.instance) {
      Browser.instance = this
    }
    return Browser.instance
  }

  private getDefaultBaseURL(): string {
    switch(this.searchEngine) {
      case 'baidu':
        return 'https://www.baidu.com/s'
      case 'xiaohongshu':
        return 'https://www.xiaohongshu.com/search_result/'
      default:
        return 'https://www.bing.com/search'
    }
  }

  private async initBrowser() {
    if (!Browser.browserInstance) {
      const args = [
        '--js-flags=--expose-gc',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
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
      
      const response = await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 8000
      })

      const finalUrl = response?.url() || url
      
      const content = await page.evaluate(() => {
        const elementsToRemove = document.querySelectorAll('script, style, iframe, nav, footer, header, aside')
        elementsToRemove.forEach(el => el.remove())

        const mainContent = document.querySelector('main, article, .content, #content')
        // @ts-ignore
        const result = mainContent ? mainContent.innerText : document.body.innerText
        return (result || '').replace(/\n/g, '')
      })

      return { content, finalUrl }
    } catch (e) {
      console.error(`[request] error ${getErrorMessage(e)}`)
      return { content: '', finalUrl: url }
    } finally {
      if (page) await this.releasePage(page)
    }
  }

  async search(keyword: string) {
    console.log(`[search] searching for ${keyword} on ${this.searchEngine}`)
    const page = await this.initBrowser()
    
    try {
      switch(this.searchEngine) {
        case 'baidu':
          return await this.searchBaidu(page, keyword)
        case 'xiaohongshu':
          return await this.searchXiaohongshu(page, keyword)
        default:
          return await this.searchBing(page, keyword)
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

  private async searchXiaohongshu(page: Page, keyword: string) {
    await page.goto(`${this.baseURL}?keyword=${encodeURIComponent(keyword)}`, { 
      waitUntil: 'networkidle0' 
    })
    
    // 等待搜索结果加载
    await page.waitForSelector('.note-item')
    
    return await page.evaluate(() => {
      // @ts-ignore
      const items = document.querySelectorAll('.note-item')
      return Array.from(items).map(item => {
        // @ts-ignore
        const titleEl = item.querySelector('.note-title')
        const title = titleEl?.textContent?.trim() || ''
        // @ts-ignore
        const url = item.querySelector('a')?.href || ''
        // @ts-ignore
        const description = item.querySelector('.note-desc')?.textContent?.trim() || ''
        // @ts-ignore
        const author = item.querySelector('.user-name')?.textContent?.trim() || ''
        // @ts-ignore
        const likes = item.querySelector('.like-count')?.textContent?.trim() || ''
        
        return { 
          title, 
          url, 
          description,
          platform: 'xiaohongshu',
          metadata: {
            author,
            likes
          }
        }
      }).filter(item => item.url)
    })
  }

  private async searchBaidu(page: Page, keyword: string) {
    await page.goto(`${this.baseURL}?wd=${encodeURIComponent(keyword)}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('.result.c-container')
    
    return await page.evaluate(() => {
      // @ts-ignore
      const items = document.querySelectorAll('.result.c-container')
      return Array.from(items).map(item => {
        // @ts-ignore
        const titleEl = item.querySelector('.t a, .c-title a')
        const title = titleEl?.textContent?.trim() || ''
        const url = titleEl?.getAttribute('href') || ''
        // @ts-ignore
        const description = item.querySelector('.c-span9')?.textContent?.trim() || ''
        return { 
          title, 
          url, 
          description,
          platform: 'baidu'
        }
      }).filter(item => item.url)
    })
  }

  private async searchBing(page: Page, keyword: string) {
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
        // @ts-ignore
        const description = item.querySelector('.b_caption p')?.textContent?.trim() || ''
        return { title, url, description }
      }).filter(item => item.url)
    })
  }

  async fetch(url: string) {
    try {
      return this.request(url)
    } catch (e) {
      console.error(`[fetch] error ${getErrorMessage(e)}`)
      return {
        finalUrl: url,
        content: '',
      }
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
