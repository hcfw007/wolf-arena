import {describe, expect, it} from 'vitest'

import type {PlayerState, Role} from '../src/game/types.js'
import {evaluateWinner} from '../src/game/winner.js'

function players(spec: Role[], dead: number[] = []): PlayerState[] {
  return spec.map((role, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    role,
    alive: !dead.includes(i + 1),
    personality: '',
  }))
}

// 3 狼 / 预言家 / 女巫 / 猎人 / 3 平民
const NINE: Role[] = [
  'werewolf',
  'werewolf',
  'werewolf',
  'seer',
  'witch',
  'hunter',
  'villager',
  'villager',
  'villager',
]

describe('evaluateWinner 胜负判定', () => {
  it('狼人全灭时好人胜（两种赛制一致）', () => {
    const dead = [1, 2, 3]
    expect(evaluateWinner(players(NINE, dead), 'edge')).toBe('villagers')
    expect(evaluateWinner(players(NINE, dead), 'city')).toBe('villagers')
  })

  it('屠边：神职全灭即狼胜，哪怕狼比好人少', () => {
    // 死掉预言家/女巫/猎人，只剩 1 狼 + 3 民
    const state = players(NINE, [4, 5, 6, 1, 2])
    expect(evaluateWinner(state, 'edge')).toBe('wolves')
    expect(evaluateWinner(state, 'city')).toBeNull()
  })

  it('屠边：平民全灭即狼胜', () => {
    const state = players(NINE, [7, 8, 9, 1, 2])
    expect(evaluateWinner(state, 'edge')).toBe('wolves')
    expect(evaluateWinner(state, 'city')).toBeNull()
  })

  it('屠城：狼数 ≥ 好人数即狼胜，哪怕神职平民都还在', () => {
    // 3 狼剩 3 好人（预言家+女巫+平民）
    const state = players(NINE, [6, 8, 9])
    expect(evaluateWinner(state, 'city')).toBe('wolves')
    expect(evaluateWinner(state, 'edge')).toBeNull()
  })

  it('未分胜负时返回 null', () => {
    expect(evaluateWinner(players(NINE), 'edge')).toBeNull()
    expect(evaluateWinner(players(NINE), 'city')).toBeNull()
  })
})
