# 🔍 AI Search Engine

一个强大的 AI 驱动的智能搜索引擎，能够将复杂问题分解为子问题并递归搜索答案。

## ✨ 特性

- 🤖 智能问题分解 - 自动将复杂查询分解为可搜索的子问题
- 🌲 树状搜索结构 - 通过构建问题树实现深度搜索
- 🔄 并行搜索处理 - 支持多线程并发搜索提高效率
- 🧠 智能答案合成 - 利用 AI 总结归纳最终答案
- 🛡️ 内置反爬虫保护 - 智能请求调度避免被封禁
- ⚡ 高性能 - 页面池复用和智能缓存机制
- 📝 智能查询构建 - 优化搜索查询，添加领域特定指令并移除口语化表达
- 🔄 多引擎支持 - 支持包括必应和百度在内的多个搜索引擎
- 🌐 代理支持 - 灵活的代理配置，适应不同地区需求
- 🔋 LLM池 - 支持多个LLM提供商，自动负载均衡

## 🚀 快速开始

### 安装

```bash
npm install aisy
```

### 基础使用

```typescript
import { SearchGraph } from 'aisy'
const search = new SearchGraph({
  proxy: 'http://127.0.0.1:7890' // 可选代理
})
const result = await search.plan('复杂问题...')
console.log(result.answer)
```

### 环境变量配置

```bash
DEEPSEEK_API_KEY=
DEEPSEEK_ENDPOINT=
KIMI_API_KEY=
KIMI_ENDPOINT=
QWEN_API_KEY=
QWEN_ENDPOINT=
```

## 📖 API 文档

### SearchGraph

主要的搜索引擎类,用于处理复杂问题的分解与搜索。

```typescript
typescript
interface SearchOptions {
  proxy?: string // 代理服务器
  maxConcurrency?: number // 最大并发数
  timeout?: number // 超时时间(ms)
  maxResults?: number // 每次搜索最大结果数
}
class SearchGraph {
  constructor(options?: SearchOptions)
  // 分析问题并执行搜索
  async plan(question: string): Promise<{
    answer: string
    pages: Page[]
  }>
}
```

### Searcher

执行单次搜索的类。

```typescript
interface Page {
  id: number
  title: string
  url: string
  content?: string
}
class Searcher {
  constructor(options?: SearchOptions)
  // 执行搜索
  async run(content: string): Promise<{
    content: string
    pages: Page[]
    answer: string
  }>
}
```

## 🛠️ 进阶配置

### 自定义搜索引擎

默认使用必应搜索,你可以通过配置修改搜索引擎:

```typescript
const search = new SearchGraph({
  baseURL: 'https://www.google.com/search'
})
```

### 调整并发与超时

```typescript
const search = new SearchGraph({
  maxConcurrency: 5, // 最大5个并发请求
  timeout: 20000, // 20秒超时
  maxResults: 10 // 每次搜索返回10条结果
})
```

### 高级配置

#### LLM池配置

```typescript
const search = new SearchGraph({
  llmPool: {
    providers: [
      {
        endpoint: process.env.DEEPSEEK_ENDPOINT,
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: 'deepseek-chat'
      },
      {
        endpoint: process.env.KIMI_ENDPOINT,
        apiKey: process.env.KIMI_API_KEY,
        model: 'kimi-chat'
      },
      {
        endpoint: process.env.QWEN_ENDPOINT,
        apiKey: process.env.QWEN_API_KEY,
        model: 'qwen-chat'
      }
    ]
  }
})
```

#### 搜索引擎配置

```typescript
const search = new SearchGraph({
  searchEngine: 'baidu', // 'bing' 或 'baidu'
  baseURL: 'https://www.baidu.com/s', // 可选，会根据 searchEngine 自动设置
  proxy: 'http://127.0.0.1:7890'
})
```

## 📝 示例

```typescript
// 复杂问题分解
const result = await search.plan('解释量子纠缠的概念以及它在量子计算中的应用')
// 获取特定信息
const result = await search.plan(
  '2024年春节档电影票房最高的是哪部?具体数据是多少?'
)
// 多步骤查询
const result = await search.plan(
  '苹果公司最新财报中营收多少?相比去年同期增长了多少?'
)
```

## 🤝 贡献

欢迎提交 issue 和 PR!

## 📄 许可证

MIT © [Jiahui.Liang](LICENSE)
