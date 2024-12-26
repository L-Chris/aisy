import dotenv from 'dotenv'

dotenv.config()

export interface LLMConfig {
  type: 'deepseek' | 'qwen' | 'kimi' | 'doubao' | 'glm'
  apiKey: string
  endpoint: string
  model: string
  maxTokens?: number
  temperature?: number
}

export interface Config {
  llmPool: {
    providers: LLMConfig[]
    defaultSize?: number
  }
  proxy?: string
  searchEngine?: 'bing' | 'baidu'
  maxConcurrency?: number
  timeout?: number
  maxResults?: number
}

// 默认配置
export const defaultConfig: Config = {
  llmPool: {
    defaultSize: 3,
    providers: [
      {
        type: 'deepseek',
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        endpoint: process.env.DEEPSEEK_ENDPOINT || '',
        model: 'deepseek'
      },
      // {
      //   type: 'qwen',
      //   apiKey: process.env.QWEN_API_KEY || '',
      //   endpoint: process.env.QWEN_ENDPOINT || '',
      //   model: 'qwen'
      // },
      {
        type: 'kimi',
        apiKey: process.env.KIMI_API_KEY || '',
        endpoint: process.env.KIMI_ENDPOINT || '',
        model: 'kimi'
      },
      {
        type: 'doubao',
        apiKey: process.env.DOUBAO_API_KEY || '',
        endpoint: process.env.DOUBAO_ENDPOINT || '',
        model: 'doubao'
      },
      {
        type: 'glm',
        apiKey: process.env.GLM_API_KEY || '',
        endpoint: process.env.GLM_ENDPOINT || '',
        model: 'glm4'
      }
    ]
  },
  searchEngine: 'baidu',
  maxConcurrency: 5,
  timeout: 10000,
  maxResults: 5
} 