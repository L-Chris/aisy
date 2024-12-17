import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { SearchGraph } from './search-graph'

dotenv.config()

async function main () {

  
  // 清除logs目录下的所有文件
  const logsDir = path.join(process.cwd(), 'logs');
  if (fs.existsSync(logsDir)) {
    const files = fs.readdirSync(logsDir);
    for (const file of files) {
      fs.unlinkSync(path.join(logsDir, file));
    }
    console.log('已清除logs目录下的所有文件');
  }
  const searchGraph = new SearchGraph({ proxy: 'http://127.0.0.1:7890' })
  const res = await searchGraph.plan('书籍《有聊》的作者的微博主页地址是？')
  console.log('最终答案:', res.answer)
}

main()
