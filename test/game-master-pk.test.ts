import {describe, expect, it} from 'vitest'

import type {PublicEvent} from '../src/game/types.js'
import {createGame, makePlayers} from './helpers/fixtures.js'

const PLAYERS = makePlayers([
  [1, 'werewolf'],
  [2, 'werewolf'],
  [3, 'werewolf'],
  [4, 'seer'],
  [5, 'witch'],
  [6, 'hunter'],
  [7, 'villager'],
  [8, 'villager'],
  [9, 'villager'],
])

// 第 1 晚狼刀 4 号（GameScript 固定刀杀目标），女巫不救也不毒，
// 白天存活 1,2,3,5,6,7,8,9 共 8 人，正好能靠顺序票脚本构造 4:4 平票。
const TIE_ROUND: number[] = [2, 1, 2, 1, 1, 2, 1, 2]

type DeathEvent = Extract<PublicEvent, {type: 'death'}>
type SpeakEvent = Extract<PublicEvent, {type: 'speak'}>
type PhaseEvent = Extract<PublicEvent, {type: 'phase'}>

function pkEvents(gm: ReturnType<typeof createGame>['master']) {
  const log = gm.state.publicLog
  const pkAt = log.findIndex((e): e is PhaseEvent => e.type === 'phase' && e.phase === 'day-pk')
  return {
    pkAt,
    pkSpeeches: log
      .slice(pkAt + 1)
      .filter((e): e is SpeakEvent => e.type === 'speak')
      .map((e) => e.speaker),
    voteDeaths: log
      .filter((e): e is DeathEvent => e.type === 'death' && e.reason === 'vote')
      .map((e) => e.victim),
    voteCount: log.filter((e) => e.type === 'vote').length,
  }
}

async function runPkGame(pkVotes: number[]) {
  const game = createGame({
    players: PLAYERS,
    script: {
      kills: {1: 4, 2: 4, 3: 4},
      seerTarget: {4: 1},
      voteScript: [...TIE_ROUND, ...pkVotes],
    },
  })
  await game.master.run(1)
  return game.master
}

describe('投票平票 PK 轮', () => {
  it('平票进入 PK：只有平票者发言，重投后决出出局者', async () => {
    const gm = await runPkGame([2, 1, 1, 1, 1, 1, 1, 1])
    const {pkAt, pkSpeeches, voteDeaths, voteCount} = pkEvents(gm)

    expect(pkAt).toBeGreaterThanOrEqual(0)
    expect(pkSpeeches).toEqual([1, 2])
    expect(voteCount).toBe(16)
    expect(voteDeaths).toEqual([1])
  })

  it('PK 后仍然平票则无人出局', async () => {
    const gm = await runPkGame([...TIE_ROUND])
    const {pkAt, voteDeaths, voteCount} = pkEvents(gm)

    expect(pkAt).toBeGreaterThanOrEqual(0)
    expect(voteCount).toBe(16)
    expect(voteDeaths).toEqual([])
    expect(gm.state.players.every((p) => p.alive || p.id === 4)).toBe(true)
  })
})
