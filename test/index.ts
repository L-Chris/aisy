import { defaultConfig } from '../src/config'
import { SearchGraph } from '../src/search-graph'
import { cleanLogs } from '../src/utils'

async function main() {
  // 清除logs目录下的所有文件
  cleanLogs()
  const searchGraph = new SearchGraph(defaultConfig)
  const res = await searchGraph.plan('书籍《有聊》的作者的小红书主页？')
  console.log('最终答案:', res.answer)
}

main()