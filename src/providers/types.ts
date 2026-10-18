export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export interface TokenTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

/** 任何 LLM 后端只要实现这一个方法就能接入对局。 */
export interface LLMProvider {
  /** 累计用量，用于结算 token 与成本。 */
  readonly totals: TokenTotals;
  complete(messages: ChatMessage[], options?: CompleteOptions): Promise<CompleteResult>;
}
