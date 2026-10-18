import assert from 'node:assert/strict'
import {test} from 'node:test'
import {PlayerState, Role} from './types.js'
import {evaluateWinner} from './winner.js'

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

test('狼人全灭时好人胜（两种赛制一致）', () => {
  const dead = [1, 2, 3]
  assert.equal(evaluateWinner(players(NINE, dead), 'edge'), 'villagers')
  assert.equal(evaluateWinner(players(NINE, dead), 'city'), 'villagers')
})

test('屠边：神职全灭即狼胜，哪怕狼比好人少', () => {
  // 死掉预言家/女巫/猎人，只剩 1 狼 + 3 民
  const state = players(NINE, [4, 5, 6, 1, 2])
  assert.equal(evaluateWinner(state, 'edge'), 'wolves')
  assert.equal(evaluateWinner(state, 'city'), null, '屠城赛制下狼少不该赢')
})

test('屠边：平民全灭即狼胜', () => {
  const state = players(NINE, [7, 8, 9, 1, 2])
  assert.equal(evaluateWinner(state, 'edge'), 'wolves')
  assert.equal(evaluateWinner(state, 'city'), null)
})

test('屠城：狼数 ≥ 好人数即狼胜，哪怕神职平民都还在', () => {
  // 3 狼剩 3 好人（预言家+女巫+平民）
  const state = players(NINE, [6, 8, 9])
  assert.equal(evaluateWinner(state, 'city'), 'wolves')
  assert.equal(evaluateWinner(state, 'edge'), null, '屠边赛制下还没屠干净就不该结束')
})

test('未分胜负时返回 null', () => {
  assert.equal(evaluateWinner(players(NINE), 'edge'), null)
  assert.equal(evaluateWinner(players(NINE), 'city'), null)
})
