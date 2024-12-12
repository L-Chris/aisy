import dotenv from 'dotenv'
import { Searcher, LLM } from './search'

dotenv.config()

async function main () {
    // const input = process.argv[2]
    // if (!input) {
    //   console.error('请输入问题')
    //   return
    // }
    const searcher = new Searcher()
    const res = await searcher.run("书籍《有聊》的作者的微博主页链接是？")
    console.log(res)
  }
  
  main()