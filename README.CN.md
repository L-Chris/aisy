# 🔍 AI Search Engine

一个强大的 AI 驱动的智能搜索引擎，能够将复杂问题分解为子问题并递归搜索答案。

## ✨ 特性

- 🤖 智能问题分解 - 自动将复杂查询分解为可搜索的子问题
- 🌲 树状搜索结构 - 通过构建问题树实现深度搜索
- 🔄 并行搜索处理 - 支持多线程并发搜索提高效率
- 🧠 智能答案合成 - 利用 AI 总结归纳最终答案
- 🛡️ 内置反爬虫保护 - 智能请求调度避免被封禁
- ⚡ 高性能 - 页面池复用和智能缓存机制

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
LLM_BASEURL=你的LLM API地址
LLM_API_KEY=你的API密钥
LLM_MODEL=模型名称
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
