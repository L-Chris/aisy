import dotenv from 'dotenv'
import { SearchGraph } from './search-graph'

dotenv.config()

async function main () {
  const searchGraph = new SearchGraph({ proxy: 'http://127.0.0.1:7890' })
  const res = await searchGraph.plan('书籍《有聊》的作者的微博主页地址是？')
  console.log('最终答案:', res.answer)
}

main()
