import axios from 'axios'
import { getErrorMessage } from './utils'

export class LLM {
  constructor () {}

  async generate (prompt: string, type: 'json_object' | 'text' = 'text') {
    try {
      const res = await axios({
        method: 'POST',
        url: process.env.LLM_BASEURL,
        headers: {
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: process.env.LLM_MODEL,
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
