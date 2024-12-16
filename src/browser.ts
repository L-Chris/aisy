import fs from 'fs'
import axios from 'axios'
import { HttpsProxyAgent } from "https-proxy-agent"
import { getErrorMessage } from './utils'

export const httpsAgent = new HttpsProxyAgent('http://127.0.0.1:7890')

export class Browser {
  private baseURL = 'https://www.bing.com/search'

  constructor () {}

  private async request(url: string) {
    try {
      const res = await axios({
        method: 'GET',
        url: `https://r.jina.ai/${url}`,
        headers: {
          'Accept-Language': 'zh-CN,zh;q=0.9', // 添加语言头
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        httpsAgent
      })
  
      return res.data as string
    } catch (e) {
      console.error(`[request] error ${getErrorMessage(e)}`)
      return ''
    }
  }

  async search (keyword: string) {
    const res = await this.request(`${this.baseURL}?q=${encodeURIComponent(
      keyword.split(/\s+/g).join('+')
    )}`)

    fs.writeFileSync('./data/search_result.html', res)

    const regex = /\d+\.\s+\[([^\]]+)\]\(([^)]+)\)/g;
    const links = [];
    let match;
    
    while ((match = regex.exec(res)) !== null) {
      links.push({
        content: match[1],
        url: match[2]
      });
    }
    
    return links
  }

  async fetch (url: string) {
    try {
      return this.request(url)
    } catch (e) {
      console.error(`[fetch] error ${getErrorMessage(e)}`)
      return ''
    }
  }
}
