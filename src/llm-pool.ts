import { LLM } from './llm'
import { Config, LLMConfig, defaultConfig } from './config'

export class LLMPool {
    private pool: LLM[] = []
    private currentIndex = 0
    private readonly providers: LLMConfig[]

    constructor(config: Config = defaultConfig) {
        this.providers = config.llmPool.providers
        this.initializePool()
    }

    private initializePool() {
        // 为每个提供商创建LLM实例
        for (const provider of this.providers) {
            this.pool.push(new LLM(provider))
        }
    }

    public next(): LLM {
        if (this.pool.length === 0) {
            throw new Error('LLM pool is empty')
        }
        const llm = this.pool[this.currentIndex]
        this.currentIndex = (this.currentIndex + 1) % this.pool.length
        return llm
    }

    public reset() {
        this.pool = []
        this.initializePool()
        this.currentIndex = 0
    }

    public size(): number {
        return this.pool.length
    }
} 