import assert from 'node:assert/strict'
import {test} from 'node:test'
import {PlayerState} from '../game/types.js'
import {LLMProvider} from '../providers/types.js'
import {AIPlayer} from './player.js'

function stub(text: string): LLMProvider {
  return {
    totals: {calls: 0, promptTokens: 0, completionTokens: 0},
    complete: async () => ({text, promptTokens: 0, completionTokens: 0}),
  }
}

const players: PlayerState[] = [
  {id: 1, name: '狼甲', role: 'werewolf', alive: true, personality: '沉默'},
  {id: 2, name: '民乙', role: 'villager', alive: true, personality: '话多'},
  {id: 3, name: '女巫', role: 'witch', alive: true, personality: '谨慎'},
]

const me = players[2]!
const others = players.filter((p) => p.id !== me.id)

test('vote 解析非法编号时兜底到合法候选人', async () => {
  const player = new AIPlayer(me, stub('<thinking>乱投</thinking>\nVOTE: 99'))
  const out = await player.vote({candidates: players, publicHistory: '', privateInfo: '', day: 1})
  assert.ok(others.some((p) => p.id === out.choice), '必须落在候选列表内')
})

test('vote 解析失败时也兜底到合法候选人', async () => {
  const player = new AIPlayer(me, stub('我不投了。'))
  const out = await player.vote({candidates: players, publicHistory: '', privateInfo: '', day: 1})
  assert.ok(others.some((p) => p.id === out.choice))
})

test('chooseTarget 允许跳过时解析 TARGET: none', async () => {
  const player = new AIPlayer(me, stub('<thinking>不毒</thinking>\nTARGET: none'))
  const out = await player.chooseTarget({
    candidates: others,
    instruction: '是否用毒？',
    privateInfo: '',
    allowSkip: true,
    day: 1,
  })
  assert.equal(out.choice, null)
})

test('chooseTarget 不允许跳过时兜底到合法目标', async () => {
  const player = new AIPlayer(me, stub('<thinking>刀他</thinking>\nTARGET: 42'))
  const out = await player.chooseTarget({
    candidates: others,
    instruction: '刀谁？',
    privateInfo: '',
    day: 1,
  })
  assert.equal(out.choice, others[0]!.id)
})

test('witchSaveDecision 认中文「救」', async () => {
  const player = new AIPlayer(me, stub('<thinking>救</thinking>\nSAVE: 救'))
  const out = await player.witchSaveDecision({
    killedTonight: players[0]!,
    privateInfo: '',
    day: 1,
  })
  assert.equal(out.choice, true)
})

test('witchSaveDecision 认 SAVE: no', async () => {
  const player = new AIPlayer(me, stub('<thinking>不救</thinking>\nSAVE: no'))
  const out = await player.witchSaveDecision({
    killedTonight: players[0]!,
    privateInfo: '',
    day: 1,
  })
  assert.equal(out.choice, false)
})

test('speak 把超长发言硬截到 maxChars + 10', async () => {
  const player = new AIPlayer(me, stub(`<thinking>x</thinking>\n<speech>${'话'.repeat(80)}</speech>`))
  const out = await player.speak({
    alivePlayers: players,
    publicHistory: '',
    privateInfo: '',
    currentDay: 1,
    round: 1,
    maxChars: 10,
  })
  assert.equal(out.speech.length, 20)
  assert.ok(out.speech.endsWith('…'))
})
