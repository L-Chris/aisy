import axios from 'axios'
import { getErrorMessage } from './utils'

export class LLM {
  constructor () {}

  async generate (prompt: string, type: 'json_object' | 'text' = 'text') {
    try {
      const res = await axios({
        method: 'POST',
        url: 'https://api.siliconflow.cn/v1/chat/completions',
        headers: {
        Authorization: `Bearer ${process.env.API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: 'internlm/internlm2_5-7b-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1024,
        // stop: '',
        temperature: 0.7,
        top_p: 0.7,
        top_k: 50,
        frequency_penalty: 0,
        n: 1,
        response_format: { type: type }
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
