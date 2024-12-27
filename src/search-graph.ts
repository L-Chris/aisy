import { Page, QuestionAnswer, Searcher } from './searcher'
import { Browser } from './browser'
import { getErrorMessage, getUUID, normalizeLLMResponse } from './utils'
import { PROMPT } from './prompts'
import fs from 'fs'
import { writeFile, stat } from 'fs/promises'
import path from 'path'
import { Query, QueryBuilder } from './query-builder'
import { LLMPool } from './llm-pool'
import { Config, defaultConfig } from './config'
import { Timer } from './utils'
import { EventEmitter } from 'events'

class SearchGraph extends EventEmitter {
  private nodes: Map<string, Node>
  private edges: Map<string, Edge[]>
  private llmPool: LLMPool
  private proxy?: string
  private searchEngine: 'bing' | 'baidu'
  private logDir: string
  private logs: {name: string; content: Record<string, any>}[] = []
  private queryBuilder: QueryBuilder
  private timer: Timer

  constructor (config: Config = defaultConfig) {
    super()
    this.nodes = new Map()
    this.edges = new Map()
    this.llmPool = new LLMPool(config)
    this.queryBuilder = new QueryBuilder(this.llmPool)
    this.proxy = config.proxy
    this.searchEngine = config.searchEngine || 'bing'
    this.logDir = path.join(process.cwd(), 'logs')
    this.logs = []
    this.timer = new Timer()
    // 确保日志目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  private async addLog (type: string, data: any) {
    const timestamp = new Date().getTime()
    const name = `${type}_${timestamp}.json`
    this.logs.push({
      name,
      content: data
    })
  }

  private async writeLogs() {
    for (let log of this.logs) {
      const logFile = path.join(this.logDir, log.name)
      writeFile(logFile, JSON.stringify(log.content, null, 2))
    }
  }

  async plan (content: string) {
    this.timer.start('total')
    this.timer.start('planning')
    console.log('\n[Plan] Starting with question:', content)
    try {
      // LLM planning
      this.timer.start('llm_planning')
      const res = await this.llmPool
        .next()
        .generate(`${PROMPT.PLAN}\n## 问题\n${content}\n`, 'json_object')
      this.timer.end('llm_planning')

      this.addLog('plan_llm_response', { question: content, response: res })

      const qs = normalizeLLMResponse(res)
      const nodes = Array.isArray(qs?.nodes) ? (qs.nodes as RawNode[]) : []
      console.log(
        '[Plan] Parsed nodes structure:',
        JSON.stringify(nodes, null, 2)
      )

      const root = this.addRootNode(content)
      console.log('[Plan] Root node created:', root.id)

      this.timer.start('process_nodes')
      await this.processNodes(nodes, root.id)
      this.timer.end('process_nodes')

      this.timer.start('process_root')
      await this.processRootNode(root.id)
      this.timer.end('process_root')

      this.timer.end('total')

      // 异步记录时间指标
      this.addLog('timing_metrics', {
        question: content,
        metrics: this.timer.getMetrics()
      })

      // 异步记录最终的搜索图结构
      this.addLog('final_search_graph', {
        nodes: Array.from(this.nodes.entries()),
        edges: Array.from(this.edges.entries())
      })

      // 从所有节点收集访问的网页
      const allPages: Page[] = []
      for (const [_, node] of this.nodes) {
        if (node.pages && Array.isArray(node.pages)) {
          allPages.push(...node.pages)
        }
      }

      return {
        nodes: this.nodes,
        edges: this.edges,
        answer: root.answer || '',
        timing: this.timer.getMetrics(),
        pages: allPages
      }
    } catch (error) {
      this.timer.end('total')
      console.error(`[Plan] Error:`, error)
      
      // 异步记录错误
      this.addLog('plan_error', {
        error: getErrorMessage(error),
        question: content
      })

      return {
        nodes: new Map() as Map<string, Node>,
        edges: new Map() as Map<string, Edge[]>,
        pages: [],
        answer: '',
        timing: this.timer.getMetrics()
      }
    } finally {
      this.writeLogs()
      // 确保关闭浏览器实例
      await Browser.close()
    }
  }

  private async processNodes (nodes: RawNode[], parentId: string) {
    console.log(`\n[ProcessNodes] Processing ${nodes.length} nodes for parent:`, parentId)

    // 并行处理所有子节点
    const promises = nodes.map(async node => {
      console.log(`[ProcessNodes] Creating node for content:`, node.content)
      const newNode = this.addNode(
        node.content, 
        parentId,
        node.queries
      )
      
      this.emit('progress', {
        nodeId: newNode.id,
        status: 'created',
        content: newNode.content,
        children: node.children?.map(child => child.content)
      })

      await this.executeNode(newNode.id)

      if (Array.isArray(node.children) && node.children.length > 0) {
        await this.processNodes(node.children, newNode.id)
      }
    })

    await Promise.all(promises)
    console.log(`[ProcessNodes] Completed all nodes for parent:`, parentId)
  }

  private addNode (nodeContent: string, parentId: string, queries: Query[] = []): Node {
    const node: Node = {
      id: getUUID(),
      content: nodeContent,
      type: 'node',
      state: NODE_STATE.NOT_STARTED,
      answer: '',
      pages: [],
      queries
    }
    this.nodes.set(node.id, node)
    if (parentId) {
      this.addEdge(parentId, node.id)
    }
    return node
  }

  private async executeNode (nodeId: string) {
    const nodeTimer = new Timer()
    nodeTimer.start('node_execution')
    console.log(`\n[ExecuteNode] Starting execution for node:`, nodeId)
    const node = this.nodes.get(nodeId)
    if (!node) {
      console.error(`[ExecuteNode] Node ${nodeId} not found`)
      return
    }

    try {
      this.emit('progress', {
        nodeId,
        status: 'running',
        content: node.content
      })

      node.state = NODE_STATE.RUNNING
      const ancestorResponses = await this.getAncestorResponses(nodeId)
      nodeTimer.start('question_adjustment')
      if (ancestorResponses.length > 0 && (node.content_template || node.queries?.[0]?.text_template)) {
        const adjustPrompt = `${PROMPT.ADJUST_NODE}
## 上下文信息
${ancestorResponses
  .map(r => `问题：${r.content}\n回答：${r.answer}`)
  .join('\n---\n')}
## 节点数据
${JSON.stringify(node, null, 2)}`
        try {
          const newNodeData = await this.llmPool.next().generate(adjustPrompt)
          const newNode = normalizeLLMResponse(newNodeData) as Node
          if (!newNode.content) {
            throw new Error('LLM返回的不是JSON格式')
          }
          console.log(
            `[ExecuteNode] Adjusted node from "${JSON.stringify(node, null, 2)}" to "${JSON.stringify(newNode, null, 2)}"`
          )
          node.content = newNode.content
          node.queries = newNode.queries
        } catch (error) {
          console.error(`[ExecuteNode] Error adjusting node:`, error)
        }
      }

      nodeTimer.end('question_adjustment')

      // 尝试最多两次搜索
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          // 构建查询
          let query: Query

          if (attempt === 1) {
            query = node.queries[0]
          } else {
            nodeTimer.start(`query_building_attempt_${attempt}`)
            query = await this.queryBuilder.build(
              node.content,
              "请使用不同的关键词重新组织查询"
            )
            nodeTimer.end(`query_building_attempt_${attempt}`)
          }

          // 执行搜索
          const searchText = query.commands
            ? `${query.text} ${query.commands.join(' ')}`
            : query.text

          const searcher = new Searcher({
            proxy: this.proxy,
            searchEngine: query.platform || this.searchEngine // 使用查询指定的平台或默认平台
          })
          nodeTimer.start(`search_execution_attempt_${attempt}`)
          const response = await searcher.run(
            node.content,
            searchText,
            ancestorResponses
          )
          nodeTimer.end(`search_execution_attempt_${attempt}`)

          // 检查搜索结果是否有效
          if (
            response.pages.length > 0 &&
            response.answer &&
            !['没有找到相关链接', '未找到足够相关的网页内容'].includes(
              response.answer
            )
          ) {
            node.answer = response.answer
            node.pages = response.pages
            node.state = NODE_STATE.FINISHED

            // 异步记录结果
            this.addLog(`node_${nodeId}_result`, {
              nodeId,
              attempt,
              originalContent: node.content,
              query,
              answer: node.answer,
              pages: node.pages,
              ancestorResponses
            })

            // 异步记录时间
            this.addLog(`node_${nodeId}_timing`, {
              nodeId,
              attempt,
              metrics: nodeTimer.getMetrics(),
              searchMetrics: response.timing
            })

            // 在节点执行成功时发送事件
            this.emit('progress', {
              nodeId,
              status: 'finished',
              content: node.content,
              answer: node.answer,
              pages: node.pages,
              timing: nodeTimer.getMetrics()
            })

            return // 成功找到答案，退出重试循环
          }

          // 如果是第一次尝试失败，异步记录失败信息
          if (attempt === 1) {
            console.log(
              `[ExecuteNode] First attempt failed for node ${nodeId}, trying with adjusted query...`
            )
            this.addLog(`node_${nodeId}_first_attempt_failed`, {
              nodeId,
              query,
              response
            })
          }
        } catch (error) {
          console.error(
            `[ExecuteNode] Attempt ${attempt} error for node ${nodeId}:`,
            error
          )
          // 在节点执行失败时发送事件
          this.emit('progress', {
            nodeId,
            status: 'error',
            content: node.content,
            error: getErrorMessage(error)
          })
          if (attempt === 2) throw error // 第二次尝试时的错误直接抛出
        }
      }

      // 如果两次尝试都失败，标记节点为错误状态
      node.state = NODE_STATE.ERROR
      this.addLog(`node_${nodeId}_all_attempts_failed`, {
        nodeId,
        originalContent: node.content,
        adjustedContent: node.content
      })

      // 不再处理该节点的子节点
      const childrenIds = this.getChildren(nodeId)
      for (const childId of childrenIds) {
        const childNode = this.nodes.get(childId)
        if (childNode) {
          childNode.state = NODE_STATE.ERROR
          this.addLog(`node_${childId}_skipped`, {
            reason: `Parent node ${nodeId} failed`
          })
        }
      }
    } catch (error) {
      console.error(`[ExecuteNode] Error for node ${nodeId}:`, error)
      node.state = NODE_STATE.ERROR
      this.addLog(`node_${nodeId}_error`, {
        nodeId,
        error: getErrorMessage(error),
        content: node.content
      })

      // 同样不处理子节点
      const childrenIds = this.getChildren(nodeId)
      for (const childId of childrenIds) {
        const childNode = this.nodes.get(childId)
        if (childNode) {
          childNode.state = NODE_STATE.ERROR
          this.addLog(`node_${childId}_skipped`, {
            reason: `Parent node ${nodeId} failed with error`
          })
        }
      }
    }
  }

  // 新增方法：获取所有祖先节点（从直接父节点到根节点）
  private getAllAncestors (nodeId: string): string[] {
    const ancestors: string[] = []
    let currentId = nodeId

    while (true) {
      const parents = this.getParents(currentId)
      if (parents.length === 0) break

      // 在这个实现中，每个节点只有一个父节点
      const parentId = parents[0]
      ancestors.push(parentId)
      currentId = parentId
    }

    return ancestors
  }

  private async processRootNode (rootId: string) {
    console.log('\n[ProcessRoot] Starting root node processing')
    const root = this.nodes.get(rootId)
    if (!root) return

    // 收集所有子孙节点
    const allDescendants = this.getAllDescendants(rootId)
    const descendants = allDescendants
      .map(id => this.nodes.get(id))
      .filter((node): node is Node => !!node)

    const allFinished = descendants.every(
      node =>
        node.state === NODE_STATE.FINISHED || node.state === NODE_STATE.ERROR
    )

    if (!allFinished) {
      console.error('[ProcessRoot] Some descendant nodes are not finished')
      this.addLog('root_node_error', {
        descendants: descendants.map(c => ({
          id: c.id,
          state: c.state,
          content: c.content
        }))
      })
      return
    }

    const responses = descendants
      .filter(node => node.answer)
      .map(node => ({
        content: node.content,
        answer: node.answer || ''
      }))

    const finalAnswer = await this.llmPool
      .next()
      .generate(
        `${PROMPT.SUMMARY}\n## 原始问题\n${
          root.content
        }\n## 所有子问题回答\n${responses
          .map((r, i) => `[${i}] 问题：${r.content}\n回答：${r.answer}`)
          .join('\n---\n')}`
      )

    root.answer = finalAnswer
    root.state = NODE_STATE.FINISHED
    console.log('[ProcessRoot] Root node processing completed')
    this.addLog('root_node_result', {
      answer: finalAnswer,
      descendantResponses: responses
    })
  }

  // 新增方法：递归获取所有子孙节点
  private getAllDescendants (nodeId: string): string[] {
    const descendants: string[] = []
    const childrenIds = this.getChildren(nodeId)

    for (const childId of childrenIds) {
      descendants.push(childId)
      descendants.push(...this.getAllDescendants(childId))
    }

    return descendants
  }

  addRootNode (nodeContent: string) {
    const node: Node = {
      id: 'root',
      content: nodeContent,
      type: 'root',
      state: NODE_STATE.NOT_STARTED,
      answer: '',
      pages: [],
      queries: []
    }
    this.nodes.set(node.id, node)
    this.edges.set(node.id, [])
    return node
  }

  addEdge (startNode: string, endNode: string) {
    const edges = this.edges.get(startNode) || []
    const edge = {
      id: getUUID(),
      name: endNode
    }
    edges.push(edge)
    this.edges.set(startNode, edges)
    return edge
  }

  getNode (nodeName: string): Node | undefined {
    return this.nodes.get(nodeName)
  }

  getChildren (nodeName: string): string[] {
    const edges = this.edges.get(nodeName) || []
    return edges.map(edge => edge.name)
  }

  getParents (nodeName: string): string[] {
    const parents: string[] = []
    this.edges.forEach((edges, startNode) => {
      if (edges.some(edge => edge.name === nodeName)) {
        parents.push(startNode)
      }
    })
    return parents
  }

  reset (): void {
    this.nodes.clear()
    this.edges.clear()
  }

  // 新增：获取祖先节点的答案
  private async getAncestorResponses(nodeId: string): Promise<QuestionAnswer[]> {
    const ancestors = this.getAllAncestors(nodeId)
    const responses: QuestionAnswer[] = []

    for (const ancestorId of ancestors) {
      const ancestorNode = this.nodes.get(ancestorId)
      if (ancestorNode && ancestorNode.answer) {
        responses.push({
          content: ancestorNode.content,
          answer: ancestorNode.answer
        })
      }
    }

    return responses
  }
}

type NodeType = 'root' | 'node'

export interface Node {
  id: string
  content: string
  content_template?: string
  type: NodeType
  state: NODE_STATE
  answer: string
  pages: Page[]
  queries: Query[]  // 保留 queries 数组,用于存储查询模板和实际查询
}

interface RawNode {
  content: string
  children?: RawNode[]
  queries?: Query[]  // 添加 queries 数组,存储 LLM 规划的查询模板
}

export interface Edge {
  id: string
  name: string
}

enum NODE_STATE {
  NOT_STARTED = 1,
  RUNNING = 2,
  FINISHED = 3,
  ERROR = 4
}

export { SearchGraph }
