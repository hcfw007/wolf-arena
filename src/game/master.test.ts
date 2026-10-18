import assert from 'node:assert/strict'
import {test} from 'node:test'
import {FakeProvider} from '../providers/fake.js'
import {GameMaster} from './master.js'
import {PlayerState} from './types.js'

const SEER_ID = 4
const WITCH_ID = 5
const WOLF_IDS = new Set([1, 2, 3])

const PLAYERS: PlayerState[] = [
  {id: 1, name: '老张', role: 'werewolf', alive: true, personality: '出租车司机'},
  {id: 2, name: '小美', role: 'werewolf', alive: true, personality: '95 后'},
  {id: 3, name: '大刘', role: 'werewolf', alive: true, personality: '程序员'},
  {id: 4, name: '阿珍', role: 'seer', alive: true, personality: '广东阿姨'},
  {id: 5, name: '陈博', role: 'witch', alive: true, personality: '医生'},
  {id: 6, name: '老猎', role: 'hunter', alive: true, personality: '退伍军人'},
  {id: 7, name: '小王', role: 'villager', alive: true, personality: '应届生'},
  {id: 8, name: '老李', role: 'villager', alive: true, personality: '中学老师'},
  {id: 9, name: '阿明', role: 'villager', alive: true, personality: '摄影师'},
]

async function runFakeGame() {
  const provider = new FakeProvider()
  const gm = new GameMaster({players: PLAYERS, provider, verbose: false})
  const winner = await gm.run(8)
  return {provider, gm, winner}
}

test('整局能跑完：产出合法胜方并进入 game-over', async () => {
  const {gm, winner} = await runFakeGame()
  assert.ok(winner === 'wolves' || winner === 'villagers')
  assert.equal(gm.state.phase, 'game-over')
  assert.ok(gm.state.publicLog.some((e) => e.type === 'death'), '至少应有人出局')
  assert.ok(gm.state.seerChecks.length > 0, '预言家应留下查验记录')
})

test('公开信息不泄露死因：毒杀与狼刀在 prompt 里无法区分', async () => {
  const {provider, gm} = await runFakeGame()
  const poisonDeaths = gm.state.publicLog.filter((e) => e.type === 'death' && e.reason === 'poison')
  assert.ok(poisonDeaths.length > 0, '假女巫每晚会用毒，本局应出现毒杀')

  // 所有出现在 prompt 里的死亡公告，措辞只能是这三种。
  const allowed = new Set(['昨夜倒牌出局', '被投票出局', '被猎人开枪带走'])
  const phrases = new Set<string>()
  for (const call of provider.calls) {
    for (const text of [call.system, call.user]) {
      for (const m of text.matchAll(/系统：(\d+)号\(([^)]*)\) ([^。]+)。/g)) phrases.add(m[3]!)
    }
  }
  assert.ok(phrases.size > 0, '应能从 prompt 里提取到死亡公告')
  assert.deepEqual(
    [...phrases].filter((p) => !allowed.has(p)),
    [],
    '出现未知的死亡公告措辞，可能泄露死因',
  )
  assert.ok(phrases.has('昨夜倒牌出局'), '狼刀/毒杀应渲染成同一种中立措辞')

  assert.ok(
    provider.calls.every((c) => !/昨夜被毒/.test(c.user) && !/昨夜被毒/.test(c.system)),
    '公开历史不应出现「昨夜被毒」这类带死因的措辞',
  )

  const hunterDeath = gm.state.publicLog.some((e) => e.type === 'death' && e.reason === 'hunter')
  if (hunterDeath) {
    assert.ok(phrases.has('被猎人开枪带走'), '猎人开枪是公开信息')
  }
})

test('信息隔离：私密信息只出现在本人 prompt 里', async () => {
  const {provider} = await runFakeGame()
  assert.ok(provider.calls.length > 0)

  for (const call of provider.calls) {
    assert.ok(call.selfId !== null, '每个 prompt 都应能识别出玩家编号')
    if (call.selfId !== SEER_ID) assert.ok(!call.user.includes('查验记录'), '查验记录只能发给预言家')
    if (!WOLF_IDS.has(call.selfId)) assert.ok(!call.user.includes('你的狼队友'), '狼队友只能发给狼人')
    if (call.selfId !== WITCH_ID) assert.ok(!call.user.includes('药剂状态'), '药剂状态只能发给女巫')
  }
})
