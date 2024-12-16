import dotenv from 'dotenv'
import { Searcher } from './searcher'
import { Browser } from './browser'

dotenv.config()

async function main () {
  // const browser = new Browser()
  // const res = await browser.search('国富论')
  const searcher = new Searcher()
  const res = await searcher.run('书籍《有聊》的作者？', [])
  console.log(res.answer)
}

main()
