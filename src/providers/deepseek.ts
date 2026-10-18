import OpenAI from 'openai'
import {ChatMessage, CompleteOptions, CompleteResult, LLMProvider} from './types.js'

const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504])

function isRetryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    return err.status === undefined || RETRYABLE_STATUS.has(err.status)
  }
  return err instanceof OpenAI.APIConnectionError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class DeepSeekProvider implements LLMProvider {
  private client: OpenAI
  private model: string
  totals = {promptTokens: 0, completionTokens: 0, calls: 0}

  constructor(opts?: {apiKey?: string; baseURL?: string; chatModel?: string}) {
    const apiKey = opts?.apiKey ?? process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is required (set env or pass apiKey)')
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: opts?.baseURL ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    })
    this.model = opts?.chatModel ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
  }

  async complete(messages: ChatMessage[], options: CompleteOptions = {}): Promise<CompleteResult> {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await this.client.chat.completions.create({
          model: this.model,
          messages,
          temperature: options.temperature ?? 0.8,
          max_tokens: options.maxTokens ?? 512,
        })

        const choice = res.choices[0]
        const text = choice?.message?.content ?? ''
        const promptTokens = res.usage?.prompt_tokens ?? 0
        const completionTokens = res.usage?.completion_tokens ?? 0

        this.totals.promptTokens += promptTokens
        this.totals.completionTokens += completionTokens
        this.totals.calls += 1

        return {text, promptTokens, completionTokens}
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS || !isRetryable(err)) throw err
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1))
      }
    }
  }
}
