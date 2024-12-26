import { LLMConfig } from './config'
import axios from 'axios'
import { getErrorMessage } from './utils'

export class LLM {
  private config: LLMConfig

  constructor (config: LLMConfig) {
    this.config = config
  }

  async generate (prompt: string, type: 'json_object' | 'text' = 'text') {
    try {
      const res = await axios({
        method: 'POST',
        url: this.config.endpoint,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        data: {
          model: this.config.model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: false
        }
      })

      const data = res.data as LLMResponse

      return data.choices[0].message.content
    } catch (e) {
      console.error(`[LLM] Error:`, getErrorMessage(e))
      return ''
    }
  }
}

interface LLMResponse {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  system_fingerprint: string
}
