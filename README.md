# 🔍 AI Search Engine

A powerful AI-driven search engine capable of breaking down complex questions into sub-questions and recursively searching for answers.

## ✨ Features

- 🤖 Smart Question Decomposition - Automatically breaks complex queries into searchable sub-questions
- 🌲 Tree Search Structure - Implements deep search through question tree construction
- 🔄 Parallel Search Processing - Supports multi-threaded concurrent search for improved efficiency
- 🧠 Intelligent Answer Synthesis - Uses AI to summarize and synthesize final answers
- 🛡️ Built-in Anti-Crawler Protection - Smart request scheduling to avoid bans
- ⚡ High Performance - Page pool reuse and intelligent caching mechanism
- 📝 Smart Query Building - Optimizes search queries with domain-specific commands and removes colloquial expressions

## 🚀 Quick Start

### Install

```bash
npm install aisy
```

### Basic Usage

```typescript
import { SearchGraph } from 'aisy'
const search = new SearchGraph({
  proxy: 'http://127.0.0.1:7890' // Optional proxy
})
const result = await search.plan('Complex problem...')
console.log(result.answer)
```

### Environment Variable Configuration

```bash
LLM_BASEURL=Your LLM API address
LLM_API_KEY=Your API key
LLM_MODEL=Model name
```

## 📖 API Documentation 

### SearchGraph

The main search engine class, used to handle the decomposition and search of complex problems.

```typescript
typescript
interface SearchOptions {
  proxy?: string // Proxy server
  maxConcurrency?: number // Maximum concurrency
  timeout?: number // Timeout (ms)
  maxResults?: number // Maximum number of results per search
}
class SearchGraph {
  constructor(options?: SearchOptions)
  // Analyze the problem and perform the search
  async plan(question: string): Promise<{
    answer: string
    pages: Page[]
  }>
}
```

### Searcher

The class that performs a single search.

```typescript
interface Page {
  id: number
  title: string
  url: string
  content?: string
}
class Searcher {
  constructor(options?: SearchOptions)
  // Perform a search
  async run(content: string): Promise<{
    content: string
    pages: Page[]
    answer: string
  }>
}
```

## 🛠️ Advanced Configuration

### Custom Search Engine

By default, Bing is used for searching. You can modify the search engine by configuring:

```typescript
const search = new SearchGraph({
  baseURL: 'https://www.google.com/search'
})
```

### Adjust Concurrency and Timeout

```typescript
const search = new SearchGraph({
  maxConcurrency: 5, // Maximum 5 concurrent requests
  timeout: 20000, // 20 seconds timeout
  maxResults: 10 // 10 results per search
})
```

## 📝 Examples

```typescript
// Complex problem decomposition
const result = await search.plan('Explain the concept of quantum entanglement and its application in quantum computing')
// Get specific information
const result = await search.plan(
  'Which movie had the highest box office in the Spring Festival of 2024? What is the specific data?'
)
// Multi-step query
const result = await search.plan(
  'What is the revenue of Apple\'s latest financial report? How much did it increase compared to last year?'
)
```

## 🤝 Contribution

Welcome to submit issues and PRs!

## 📄 License

MIT © [Jiahui.Liang](LICENSE)
