import OpenAI from 'openai'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  temperature?: number;
  maxTokens?: number;
  reasoning?: boolean;
}

export interface CompleteResult {
  text: string;
  reasoning?: string;
  promptTokens: number;
  completionTokens: number;
}

export class DeepSeekProvider {
  private client: OpenAI
  private chatModel: string
  private reasonerModel: string
  totals = {promptTokens: 0, completionTokens: 0, calls: 0}

  constructor(opts?: {
    apiKey?: string;
    baseURL?: string;
    chatModel?: string;
    reasonerModel?: string;
  }) {
    const apiKey = opts?.apiKey ?? process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is required (set env or pass apiKey)')
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: opts?.baseURL ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    })
    this.chatModel = opts?.chatModel ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
    this.reasonerModel = opts?.reasonerModel ?? 'deepseek-reasoner'
  }

  async complete(messages: ChatMessage[], options: CompleteOptions = {}): Promise<CompleteResult> {
    const model = options.reasoning ? this.reasonerModel : this.chatModel
    const res = await this.client.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens ?? 512,
    })

    const choice = res.choices[0]
    const text = choice?.message?.content ?? ''
    const reasoning = (choice?.message as {reasoning_content?: string} | undefined)?.reasoning_content

    this.totals.promptTokens += res.usage?.prompt_tokens ?? 0
    this.totals.completionTokens += res.usage?.completion_tokens ?? 0
    this.totals.calls += 1

    return {
      text,
      reasoning,
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
    }
  }
}
