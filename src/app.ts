import Koa from 'koa'
import Router from 'koa-router'
import bodyParser from 'koa-bodyparser'
import cors from 'koa-cors'
import { Node, Edge, SearchGraph } from './search-graph'
import { defaultConfig } from './config'
import { cleanLogs, Timer, TimingInfo } from './utils'
import { SearchEvent, SearchProgress } from './types'
import { Page } from './searcher'

const app = new Koa()
const router = new Router()

// 中间件
app.use(cors())
app.use(bodyParser())

const searchGraph = new SearchGraph(defaultConfig)

const searchProgress = new Map<string, {
  progress: Map<string, SearchProgress>
  timer: Timer
  result?: {
    nodes: Map<string, Node>
    edges: Map<string, Edge[]>
    answer: string
    timing: TimingInfo
    pages: Page[]
  }
  error?: string
}>()

// 搜索接口
router.post('/api/search', async (ctx) => {
  const { question } = ctx.request.body as { question: string }
  const searchId = Math.random().toString(36).substring(2)
  
  try {
    // 初始化进度追踪
    searchProgress.set(searchId, {
      progress: new Map(),
      timer: new Timer()
    })

    // 监听搜索进度
    const progressHandler = (event: SearchEvent) => {
      const progress = searchProgress.get(searchId)?.progress
      if (progress && event.nodeId) {
        progress.set(event.nodeId, {
          nodeId: event.nodeId,
          status: event.status as 'running' | 'finished' | 'error',
          content: event.content,
          answer: event.answer,
          pages: event.pages || [],
          timing: event.timing,
          children: event.children
        })
      }
    }

    searchGraph.on('progress', progressHandler)
    cleanLogs()

    // 立即返回 searchId
    ctx.body = {
      success: true,
      data: {
        searchId
      }
    }

    // 异步执行搜索
    searchGraph.plan(question).then(result => {
      const search = searchProgress.get(searchId)
      if (search) {
        search.result = result
      }
    }).catch(error => {
      console.error('Search error:', error)
      const search = searchProgress.get(searchId)
      if (search) {
        search.error = error.message
      }
    }).finally(() => {
      searchGraph.off('progress', progressHandler)
      // 不要立即删除进度信息，让前端可以获取最终结果
      setTimeout(() => {
        searchProgress.delete(searchId)
      }, 5000) // 5秒后清理
    })

  } catch (error: any) {
    console.error('Search error:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: error.message
    }
  }
})

// 修改进度查询接口，增加返回最终结果
router.get('/api/search/:searchId/progress', async (ctx) => {
  const { searchId } = ctx.params
  const search = searchProgress.get(searchId)

  if (!search) {
    ctx.status = 404
    ctx.body = {
      success: false,
      error: 'Search not found'
    }
    return
  }

  const progressData = Array.from(search.progress.values())
  const timing = search.timer.getMetrics()

  ctx.body = {
    success: true,
    data: {
      progress: progressData,
      timing,
      result: search.result, // 返回最终结果
      error: search.error,   // 返回错误信息
      completed: !!search.result || !!search.error // 标记是否完成
    }
  }
})

// 注册路由
app.use(router.routes())
app.use(router.allowedMethods())

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})

export default app 