import {describe, expect, it} from 'vitest'

import {AIPlayer} from '../src/ai/player.js'
import type {PlayerState} from '../src/game/types.js'
import {makePlayers, saveDecision, skipTarget, target, voteFor} from './helpers/fixtures.js'
import {type MockHandler, MockProvider} from './helpers/mock-provider.js'

const players = makePlayers([[1, 'werewolf'], [2, 'villager'], [3, 'villager']])
const me = players[0]!
const others = players.slice(1)

function createAgent(player: PlayerState, output: string | MockHandler): AIPlayer {
  const handler: MockHandler = typeof output === 'function' ? output : () => output
  return new AIPlayer(player, new MockProvider(handler))
}

describe('AIPlayer.vote 计票输入容错', () => {
  const voteOpts = {candidates: players, publicHistory: '', privateInfo: '', day: 1}

  it('采纳合法 VOTE', async () => {
    const agent = createAgent(me, voteFor(3))
    await expect(agent.vote(voteOpts)).resolves.toMatchObject({choice: 3})
  })

  it('乱输出（无 VOTE 标记）回退到第一个有效候选人', async () => {
    const agent = createAgent(me, '完全不知道该投谁，就这样吧。')
    await expect(agent.vote(voteOpts)).resolves.toMatchObject({choice: 2})
  })

  it('投给自己时回退到第一个有效候选人', async () => {
    const agent = createAgent(me, voteFor(1))
    await expect(agent.vote(voteOpts)).resolves.toMatchObject({choice: 2})
  })

  it('VOTE 指向不存在的编号时回退到第一个有效候选人', async () => {
    const agent = createAgent(me, voteFor(99))
    await expect(agent.vote(voteOpts)).resolves.toMatchObject({choice: 2})
  })
})

describe('AIPlayer.chooseTarget 目标选择容错', () => {
  const targetOpts = {candidates: others, instruction: '测试指令', privateInfo: '', day: 1}

  it('采纳合法 TARGET', async () => {
    const agent = createAgent(me, target(3))
    await expect(agent.chooseTarget(targetOpts)).resolves.toMatchObject({choice: 3})
  })

  it('不允许跳过时 TARGET: none 回退到第一个候选', async () => {
    const agent = createAgent(me, skipTarget())
    await expect(agent.chooseTarget(targetOpts)).resolves.toMatchObject({choice: 2})
  })

  it('不允许跳过时乱输出同样回退到第一个候选', async () => {
    const agent = createAgent(me, '忘了写 TARGET')
    await expect(agent.chooseTarget(targetOpts)).resolves.toMatchObject({choice: 2})
  })

  it('允许跳过时 TARGET: none 返回 null', async () => {
    const agent = createAgent(me, skipTarget())
    await expect(agent.chooseTarget({...targetOpts, allowSkip: true})).resolves.toMatchObject({
      choice: null,
    })
  })

  it('允许跳过时非法编号返回 null 而不是瞎选', async () => {
    const agent = createAgent(me, target(99))
    await expect(agent.chooseTarget({...targetOpts, allowSkip: true})).resolves.toMatchObject({
      choice: null,
    })
  })

  it('TARGET: 无 视为跳过', async () => {
    const agent = createAgent(me, '<thinking>算了</thinking>\nTARGET: 无')
    await expect(agent.chooseTarget({...targetOpts, allowSkip: true})).resolves.toMatchObject({
      choice: null,
    })
  })
})

describe('AIPlayer 候选列表极端路径', () => {
  const baseOpts = {publicHistory: '', privateInfo: '', day: 1}

  it('vote 无有效候选人（候选为空）时抛错', async () => {
    const agent = createAgent(me, voteFor(3))
    await expect(agent.vote({...baseOpts, candidates: []})).rejects.toThrow(
      'No valid vote candidate',
    )
  })

  it('vote 有效候选人全被过滤（候选仅剩自己）时抛错', async () => {
    const agent = createAgent(me, voteFor(1))
    await expect(agent.vote({...baseOpts, candidates: [me]})).rejects.toThrow(
      'No valid vote candidate',
    )
  })

  it('chooseTarget 无候选且不允许跳过时抛错', async () => {
    const agent = createAgent(me, target(3))
    await expect(
      agent.chooseTarget({...baseOpts, candidates: [], instruction: '测试指令'}),
    ).rejects.toThrow('No valid target')
  })

  it('chooseTarget 无候选但允许跳过时返回 null 不抛错', async () => {
    const agent = createAgent(me, skipTarget())
    await expect(
      agent.chooseTarget({...baseOpts, candidates: [], instruction: '测试指令', allowSkip: true}),
    ).resolves.toMatchObject({choice: null})
  })
})

describe('AIPlayer.witchSaveDecision 解药决策容错', () => {
  const saveOpts = {killedTonight: others[0]!, privateInfo: '', day: 1}

  it('SAVE: yes / 是 / 救 均判定为救人', async () => {
    for (const line of [saveDecision(true), 'SAVE: 是', 'SAVE: 救']) {
      const agent = createAgent(me, line)
      await expect(agent.witchSaveDecision(saveOpts)).resolves.toMatchObject({choice: true})
    }
  })

  it('SAVE: no / 否 / 不救 均判定为不救', async () => {
    for (const line of [saveDecision(false), 'SAVE: 否', 'SAVE: 不救']) {
      const agent = createAgent(me, line)
      await expect(agent.witchSaveDecision(saveOpts)).resolves.toMatchObject({choice: false})
    }
  })

  it('乱输出默认不救', async () => {
    const agent = createAgent(me, '今晚先不折腾了。')
    await expect(agent.witchSaveDecision(saveOpts)).resolves.toMatchObject({choice: false})
  })
})

describe('AIPlayer.speak 发言裁剪', () => {
  it('把超长发言硬截到 maxChars + 10', async () => {
    const agent = createAgent(me, `<thinking>x</thinking>\n<speech>${'话'.repeat(80)}</speech>`)
    const out = await agent.speak({
      alivePlayers: players,
      publicHistory: '',
      privateInfo: '',
      currentDay: 1,
      round: 1,
      maxChars: 10,
    })
    expect(out.speech).toHaveLength(20)
    expect(out.speech.endsWith('…')).toBe(true)
  })
})
