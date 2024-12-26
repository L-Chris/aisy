import express from 'express'
import cors from 'cors'
import { SearchGraph } from './search-graph'
import { defaultConfig } from './config'
import { Timer } from './utils'

const app = express()
app.use(cors())
app.use(express.json())

const searchGraph = new SearchGraph(defaultConfig)

interface SearchProgress {
  nodeId: string
  status: 'running' | 'finished' | 'error'
  content: string
  answer?: string
  pages?: any[]
  timing?: any
  children?: string[]
}

const searchProgress = new Map<string, {
  progress: Map<string, SearchProgress>
  timer: Timer
}>()

app.post('/api/search', async (req, res) => {
  const { question } = req.body
  const searchId = Math.random().toString(36).substring(2)
  
  try {
    // 初始化进度追踪
    searchProgress.set(searchId, {
      progress: new Map(),
      timer: new Timer()
    })

    // 监听搜索进度
    const progressHandler = (event: any) => {
      const progress = searchProgress.get(searchId)?.progress
      if (progress && event.nodeId) {
        progress.set(event.nodeId, {
          nodeId: event.nodeId,
          status: event.status,
          content: event.content,
          answer: event.answer,
          pages: event.pages,
          timing: event.timing,
          children: event.children
        })
      }
    }

    searchGraph.on('progress', progressHandler)
    
    // 执行搜索
    const result = await searchGraph.plan(question)
    
    searchGraph.off('progress', progressHandler)
    searchProgress.delete(searchId)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Search error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

app.get('/api/search/:searchId/progress', (req, res) => {
  const { searchId } = req.params
  const search = searchProgress.get(searchId)
  
  if (!search) {
    return res.status(404).json({
      success: false,
      error: 'Search not found'
    })
  }

  const progressData = Array.from(search.progress.values())
  const timing = search.timer.getMetrics()

  res.json({
    success: true,
    data: {
      progress: progressData,
      timing
    }
  })
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server running on port ${port}`)
}) 