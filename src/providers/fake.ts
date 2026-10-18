import {ChatMessage, CompleteResult, LLMProvider} from './types.js'

export type FakeCallKind = 'speak' | 'vote' | 'target' | 'save'

export interface FakeCall {
  kind: FakeCallKind;
  selfId: number | null;
  system: string;
  user: string;
}

const SELF_ID_RE = /你是 (\d+) 号/
const CANDIDATES_RE = /(?:候选目标|可投候选人)[:：]([^\n]*)/
const CANDIDATE_ID_RE = /(\d+)号\(/g

/**
 * 确定性假 provider：不联网、不花钱，按 prompt 里的候选列表机械选择。
 * 用于测试整局流程与信息隔离（见 src/game/master.test.ts）。
 */
export class FakeProvider implements LLMProvider {
  calls: FakeCall[] = []
  totals = {promptTokens: 0, completionTokens: 0, calls: 0}

  async complete(messages: ChatMessage[]): Promise<CompleteResult> {
    const system = messages[0]?.content ?? ''
    const user = messages[1]?.content ?? ''
    const kind = this.kind(system)
    this.calls.push({kind, selfId: Number(system.match(SELF_ID_RE)?.[1]) || null, system, user})
    const text = this.render(kind, user)
    this.totals.calls += 1
    this.totals.promptTokens += system.length + user.length
    this.totals.completionTokens += text.length
    return {text, promptTokens: system.length, completionTokens: text.length}
  }

  private kind(system: string): FakeCallKind {
    if (system.includes('SAVE:')) return 'save'
    if (system.includes('VOTE:')) return 'vote'
    if (system.includes('TARGET:')) return 'target'
    return 'speak'
  }

  private render(kind: FakeCallKind, user: string): string {
    if (kind === 'speak') return '<thinking>假玩家的内心戏</thinking>\n<speech>我先听前置位发言。</speech>'
    if (kind === 'save') return '<thinking>假女巫：不救</thinking>\nSAVE: no'
    const target = this.candidates(user)[0]
    if (kind === 'vote') return `<thinking>假玩家投票</thinking>\nVOTE: ${target ?? 'none'}`
    return `<thinking>假玩家选目标</thinking>\nTARGET: ${target ?? 'none'}`
  }

  private candidates(user: string): number[] {
    const segment = user.match(CANDIDATES_RE)?.[1] ?? ''
    return [...segment.matchAll(CANDIDATE_ID_RE)].map((m) => Number(m[1]))
  }
}
