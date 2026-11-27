import type {
  ChatMessage,
  CompleteOptions,
  CompleteResult,
  LLMProvider,
} from '../../src/providers/types.js'

export type MockRequestKind =
  | 'speak'
  | 'vote'
  | 'witchSave'
  | 'wolvesRound1'
  | 'wolvesRound2'
  | 'seer'
  | 'witchPoison'
  | 'hunter'
  | 'chooseTarget'

export interface MockRequest {
  kind: MockRequestKind;
  playerId: number;
  /** 从 prompt 提取的对局天数（发言/投票取「第 N 天」，夜晚决策取「第 N 晚」）。 */
  day: number;
  system: string;
  user: string;
}

export type MockHandler = (request: MockRequest) => string

const PLAYER_ID_RE = /你是 (\d+) 号/
const DAY_RE = /第 (\d+) [晚天]/

/**
 * 结构化识别 AIPlayer 发出的请求类型。
 * 通过 system prompt 中的稳定标记区分阶段；新增阶段后若忘记补分支会显式抛错。
 */
function classifyRequest(messages: ChatMessage[]): MockRequest {
  const system = messages[0]?.content ?? ''
  const user = messages[1]?.content ?? ''
  return {
    kind: kindOfSystem(system),
    playerId: Number(PLAYER_ID_RE.exec(system)?.[1] ?? Number.NaN),
    day: Number(DAY_RE.exec(user)?.[1] ?? Number.NaN),
    system,
    user,
  }
}

function kindOfSystem(system: string): MockRequestKind {
  if (system.includes('【发言规则】')) return 'speak'
  if (system.includes('现在是投票阶段')) return 'vote'
  if (system.includes('决定是否使用解药救他')) return 'witchSave'
  if (system.includes('【狼队第一轮商议】')) return 'wolvesRound1'
  if (system.includes('【狼队第二轮商议')) return 'wolvesRound2'
  if (system.includes('请选择今晚查验的目标')) return 'seer'
  if (system.includes('是否使用毒药毒杀一名玩家')) return 'witchPoison'
  if (system.includes('你是猎人，刚刚出局')) return 'hunter'
  if (system.includes('TARGET: <玩家编号')) return 'chooseTarget'
  throw new Error(`Unrecognized LLM request, system prompt: ${system.slice(0, 80)}`)
}

/**
 * 离线可跑的 LLM 假实现：按请求类型返回脚本化输出，绝不触网。
 * 实现远端 LLMProvider 接口，可直接注入 GameMaster。
 */
export class MockProvider implements LLMProvider {
  readonly requests: MockRequest[] = []
  totals = {promptTokens: 0, completionTokens: 0, calls: 0}

  constructor(private readonly handler: MockHandler) {}

  async complete(messages: ChatMessage[], _options?: CompleteOptions): Promise<CompleteResult> {
    const request = classifyRequest(messages)
    this.requests.push(request)
    const text = this.handler(request)
    this.totals.promptTokens += 10
    this.totals.completionTokens += 20
    this.totals.calls += 1
    return {text, promptTokens: 10, completionTokens: 20}
  }
}
