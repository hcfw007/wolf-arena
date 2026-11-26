import {GameMaster} from '../../src/game/master.js'
import type {PlayerState, PublicEvent, Role} from '../../src/game/types.js'
import type {GameRecorder} from '../../src/recorder.js'
import {type MockHandler, type MockRequest, MockProvider, asGameProvider} from './mock-provider.js'

export function makePlayers(spec: ReadonlyArray<readonly [number, Role]>): PlayerState[] {
  return spec.map(([id, role]) => ({
    id,
    name: `玩家${id}`,
    role,
    alive: true,
    personality: '冷静的逻辑型玩家',
  }))
}

export interface GameScript {
  /** 单狼或一二轮一致的刀杀目标 */
  kills?: Record<number, number>;
  /** 狼队第一轮提议（不填则回退 kills） */
  wolfProposals?: Record<number, number>;
  /** 狼队第二轮终投（不填则回退 kills） */
  wolfFinals?: Record<number, number>;
  /** 预言家查验目标 */
  seerTarget?: Record<number, number>;
  /** 女巫是否用解药，默认不救 */
  witchSave?: boolean;
  /** 女巫毒杀目标，默认不用毒 */
  witchPoison?: number | null;
  /** 猎人开枪目标，默认不开枪 */
  hunterTarget?: number | null;
  /** 每人公开发言文本 */
  speeches?: Record<number, string>;
  /** 投票目标；缺省输出非法 VOTE 触发 AIPlayer 回退分支 */
  votes?: Record<number, number>;
}

export function target(id: number): string {
  return `<thinking>锁定目标</thinking>\nTARGET: ${id}`
}

export function skipTarget(): string {
  return '<thinking>先按兵不动</thinking>\nTARGET: none'
}

/** 不带 <thinking> 段的原始输出，用于覆盖 thinking 回退分支 */
export function rawTarget(id: number): string {
  return `TARGET: ${id}`
}

export function voteFor(id: number): string {
  return `<thinking>投出这一票</thinking>\nVOTE: ${id}`
}

export function saveDecision(save: boolean): string {
  return `<thinking>救还是不救</thinking>\nSAVE: ${save ? 'yes' : 'no'}`
}

export function speech(text: string): string {
  return `<thinking>内心盘算</thinking>\n<speech>${text}</speech>`
}

export function scriptedHandler(script: GameScript): MockHandler {
  return (req: MockRequest): string => {
    switch (req.kind) {
      case 'wolvesRound1':
        return target(requireEntry(script.wolfProposals ?? script.kills, req, '狼队一轮提议'))
      case 'wolvesRound2':
        return target(requireEntry(script.wolfFinals ?? script.kills, req, '狼队二轮终投'))
      case 'seer':
        return target(requireEntry(script.seerTarget, req, '预言家查验'))
      case 'witchSave':
        return saveDecision(script.witchSave ?? false)
      case 'witchPoison':
        return typeof script.witchPoison === 'number' ? target(script.witchPoison) : skipTarget()
      case 'hunter':
        return typeof script.hunterTarget === 'number' ? target(script.hunterTarget) : skipTarget()
      case 'speak':
        return speech(script.speeches?.[req.playerId] ?? '我是好人，跟着逻辑走。')
      case 'vote': {
        const choice = script.votes?.[req.playerId]
        return voteFor(choice ?? 999)
      }
      case 'chooseTarget':
        throw new Error('GameMaster 不应发出通用 chooseTarget 请求，请检查阶段分类')
    }
  }
}

function requireEntry(
  table: Record<number, number> | undefined,
  req: MockRequest,
  label: string,
): number {
  const value = table?.[req.playerId]
  if (value === undefined) {
    throw new Error(`${label} 缺少脚本：player ${req.playerId} (${req.kind})`)
  }
  return value
}

export interface TestGame {
  master: GameMaster;
  provider: MockProvider;
}

export function createGame(opts: {
  players: PlayerState[];
  script: GameScript | MockHandler;
  recorder?: GameRecorder;
  verbose?: boolean;
}): TestGame {
  const handler = typeof opts.script === 'function' ? opts.script : scriptedHandler(opts.script)
  const provider = new MockProvider(handler)
  const master = new GameMaster({
    players: opts.players,
    provider: asGameProvider(provider),
    verbose: opts.verbose ?? false,
    recorder: opts.recorder,
  })
  return {master, provider}
}

export function eventsOfType<T extends PublicEvent['type']>(
  master: GameMaster,
  type: T,
): Array<Extract<PublicEvent, {type: T}>> {
  return master.state.publicLog.filter((e): e is Extract<PublicEvent, {type: T}> => e.type === type)
}
