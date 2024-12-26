import fs from 'fs'
import path from 'path'
import { defaultConfig } from '../src/config'
import { SearchGraph } from '../src/search-graph'

async function main() {
  // 清除logs目录下的所有文件
  const logsDir = path.join(process.cwd(), 'logs');
  if (fs.existsSync(logsDir)) {
    const files = fs.readdirSync(logsDir);
    for (const file of files) {
      fs.unlinkSync(path.join(logsDir, file));
    }
    console.log('已清除logs目录下的所有文件');
  }
  const searchGraph = new SearchGraph(defaultConfig)
  const res = await searchGraph.plan('书籍《有聊》的作者的小红书主页？')
  console.log('最终答案:', res.answer)
}

main()