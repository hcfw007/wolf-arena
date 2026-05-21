import {PlayerId, PlayerState, ROLE_LABEL_CN} from '../game/types.js'
import {DeepSeekProvider} from '../providers/deepseek.js'
import {clipText, parseSpeech} from './parse.js'
import {
  buildSpeakSystemPrompt,
  buildSpeakUserPrompt,
  ROLE_GUIDE,
  SpeakContext,
} from './prompts.js'

export interface SpeakOutput {
  thinking: string;
  speech: string;
  promptTokens: number;
  completionTokens: number;
}

export interface DecisionOutput<T> {
  thinking: string;
  choice: T;
}

const VOTE_RE = /VOTE\s*[:：]\s*(\d+)/i
const TARGET_RE = /TARGET\s*[:：]\s*(\d+|none|无|不?用)/i
const SAVE_RE = /SAVE\s*[:：]\s*(yes|no|是|否|救|不救)/i

export class AIPlayer {
  constructor(
    public state: PlayerState,
    private provider: DeepSeekProvider,
  ) {}

  async speak(ctx: Omit<SpeakContext, 'self'>): Promise<SpeakOutput> {
    const system = buildSpeakSystemPrompt(this.state)
    const user = buildSpeakUserPrompt({...ctx, self: this.state})
    const result = await this.provider.complete(
      [
        {role: 'system', content: system},
        {role: 'user', content: user},
      ],
      {temperature: 0.85, maxTokens: 600},
    )
    const parsed = parseSpeech(result.text)
    return {
      thinking: parsed.thinking,
      speech: clipText(parsed.speech, ctx.maxChars + 10),
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    }
  }

  async vote(opts: {
    candidates: PlayerState[];
    publicHistory: string;
    privateInfo: string;
    day: number;
  }): Promise<DecisionOutput<PlayerId>> {
    const candidateList = opts.candidates
      .filter((p) => p.id !== this.state.id)
      .map((p) => `${p.id}号(${p.name})`)
      .join('、')

    const system = [
      `你是 ${this.state.id} 号「${this.state.name}」，身份：${ROLE_LABEL_CN[this.state.role]}。`,
      ROLE_GUIDE[this.state.role],
      '现在是投票阶段。基于全天讨论，投出你认为最该出局的玩家。',
      '严格按以下格式输出：',
      '<thinking>你的真实分析（包括隐藏身份的考量）</thinking>',
      'VOTE: <玩家编号>',
    ].join('\n')

    const user = [
      `第 ${opts.day} 天投票阶段。可投候选人：${candidateList}。`,
      '',
      '【今日讨论】',
      opts.publicHistory,
      '',
      '【你的私密信息】',
      opts.privateInfo || '（无）',
      '',
      '请按格式输出 thinking 和 VOTE。VOTE 必须是上面候选人之一的编号。',
    ].join('\n')

    const result = await this.provider.complete(
      [
        {role: 'system', content: system},
        {role: 'user', content: user},
      ],
      {temperature: 0.7, maxTokens: 400},
    )

    const parsed = parseSpeech(result.text)
    const m = result.text.match(VOTE_RE)
    const validIds = new Set(opts.candidates.filter((p) => p.id !== this.state.id).map((p) => p.id))
    let choice = m ? Number(m[1]) : NaN
    if (!validIds.has(choice)) {
      const first = [...validIds][0]
      if (first === undefined) throw new Error('No valid vote candidate')
      choice = first
    }
    return {thinking: parsed.thinking || result.text, choice}
  }

  async chooseTarget(opts: {
    candidates: PlayerState[];
    instruction: string;
    privateInfo: string;
    allowSkip?: boolean;
    day: number;
  }): Promise<DecisionOutput<PlayerId | null>> {
    const candidateList = opts.candidates.map((p) => `${p.id}号(${p.name})`).join('、')
    const skipHint = opts.allowSkip ? '；如果选择跳过，输出 TARGET: none' : ''

    const system = [
      `你是 ${this.state.id} 号「${this.state.name}」，身份：${ROLE_LABEL_CN[this.state.role]}。`,
      ROLE_GUIDE[this.state.role],
      opts.instruction,
      '严格按以下格式输出：',
      '<thinking>你的考量</thinking>',
      `TARGET: <玩家编号${opts.allowSkip ? ' 或 none' : ''}>`,
    ].join('\n')

    const user = [
      `第 ${opts.day} 晚。候选目标：${candidateList}${skipHint}。`,
      '',
      '【你的私密信息】',
      opts.privateInfo || '（无）',
      '',
      '按格式输出 thinking 和 TARGET。',
    ].join('\n')

    const result = await this.provider.complete(
      [
        {role: 'system', content: system},
        {role: 'user', content: user},
      ],
      {temperature: 0.75, maxTokens: 400},
    )

    const parsed = parseSpeech(result.text)
    const m = result.text.match(TARGET_RE)
    const validIds = new Set(opts.candidates.map((p) => p.id))

    let choice: PlayerId | null = null
    if (m && m[1]) {
      const raw = m[1].toLowerCase()
      if (raw === 'none' || raw === '无' || raw.startsWith('不')) {
        choice = null
      } else {
        const n = Number(m[1])
        if (validIds.has(n)) choice = n
      }
    }
    if (choice === null && !opts.allowSkip) {
      const first = [...validIds][0]
      if (first === undefined) throw new Error('No valid target')
      choice = first
    }
    return {thinking: parsed.thinking || result.text, choice}
  }

  async witchSaveDecision(opts: {
    killedTonight: PlayerState;
    privateInfo: string;
    day: number;
  }): Promise<DecisionOutput<boolean>> {
    const system = [
      `你是 ${this.state.id} 号「${this.state.name}」，身份：女巫。`,
      ROLE_GUIDE.witch,
      '今晚有人被狼人刀。决定是否使用解药救他（解药只能用一次）。',
      '严格按以下格式输出：',
      '<thinking>你的考量（救与不救的利弊）</thinking>',
      'SAVE: yes 或 no',
    ].join('\n')

    const user = [
      `第 ${opts.day} 晚。被狼人刀的是 ${opts.killedTonight.id}号(${opts.killedTonight.name})。`,
      '',
      '【你的私密信息】',
      opts.privateInfo || '（无）',
      '',
      '按格式输出 thinking 和 SAVE。',
    ].join('\n')

    const result = await this.provider.complete(
      [
        {role: 'system', content: system},
        {role: 'user', content: user},
      ],
      {temperature: 0.7, maxTokens: 400},
    )

    const parsed = parseSpeech(result.text)
    const m = result.text.match(SAVE_RE)
    let choice = false
    if (m && m[1]) {
      const v = m[1].toLowerCase()
      choice = v === 'yes' || v === '是' || v === '救'
    }
    return {thinking: parsed.thinking || result.text, choice}
  }
}
