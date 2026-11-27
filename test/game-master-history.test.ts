import {describe, expect, it} from 'vitest'

import {
  createGame,
  eventsOfType,
  makePlayers,
  rawTarget,
  saveDecision,
  skipTarget,
  speech,
  target,
  voteFor,
} from './helpers/fixtures.js'
import type {MockHandler} from './helpers/mock-provider.js'

/** 从请求文案中提取「第 N 晚/天」标记 */
function requestDay(user: string): string {
  return /第 (\d+) [晚天]/.exec(user)?.[1] ?? '?'
}

describe('公共历史渲染 - 多日全流程', () => {
  it('三类中立死亡文案（死因不外露）、sinceDay 过滤与女巫毒药状态按天正确渲染', async () => {
    const handler: MockHandler = (req) => {
      const day = requestDay(req.user)
      switch (req.kind) {
        case 'wolvesRound1':
        case 'wolvesRound2':
          return rawTarget(day === '1' ? 3 : 8)
        case 'seer':
          return target(1)
        case 'witchSave':
          return saveDecision(false)
        case 'witchPoison':
          return target(10)
        case 'hunter':
          return target(6)
        case 'speak':
          return speech(day === '1' ? '第一天的发言标记' : '第二天换个说法')
        case 'vote': {
          const day1: Record<number, number> = {1: 7, 2: 7, 4: 1, 5: 2, 7: 4, 8: 7, 9: 7}
          const day2: Record<number, number> = {1: 4, 2: 5, 4: 9, 5: 1, 9: 2}
          return voteFor((day === '1' ? day1 : day2)[req.playerId] ?? 999)
        }
        case 'chooseTarget':
          throw new Error('GameMaster 不应发出通用 chooseTarget 请求')
      }
    }

    const {master, provider} = createGame({
      players: makePlayers([
        [1, 'werewolf'],
        [2, 'werewolf'],
        [3, 'hunter'],
        [4, 'seer'],
        [5, 'witch'],
        [6, 'villager'],
        [7, 'villager'],
        [8, 'villager'],
        [9, 'villager'],
        [10, 'villager'],
      ]),
      script: handler,
    })

    const winner = await master.run(2)

    expect(winner).toBe('wolves')
    expect(eventsOfType(master, 'death')).toEqual([
      {type: 'death', day: 1, victim: 3, reason: 'wolves'},
      {type: 'death', day: 1, victim: 10, reason: 'poison'},
      {type: 'death', day: 1, victim: 6, reason: 'hunter'},
      {type: 'death', day: 1, victim: 7, reason: 'vote'},
      {type: 'death', day: 2, victim: 8, reason: 'wolves'},
    ])

    const day2Proposal = provider.requests.find(
      (r) => r.kind === 'wolvesRound1' && r.user.includes('第 2 晚'),
    )
    // 新行为：公开信息不暴露死亡原因——狼刀与毒杀统一渲染为「昨夜倒牌出局」
    expect(day2Proposal?.system).toContain('系统：3号(玩家3) 昨夜倒牌出局。')
    expect(day2Proposal?.system).toContain('系统：10号(玩家10) 昨夜倒牌出局。')
    expect(day2Proposal?.system).not.toContain('昨夜被毒')
    expect(day2Proposal?.system).toContain('系统：6号(玩家6) 被猎人开枪带走。')
    expect(day2Proposal?.system).toContain('系统：7号(玩家7) 被投票出局。')

    const day2Vote = provider.requests.find(
      (r) => r.kind === 'vote' && r.user.includes('第 2 天投票阶段'),
    )
    expect(day2Vote?.user).toContain('第二天换个说法')
    expect(day2Vote?.user).not.toContain('第一天的发言标记')

    const day2Witch = provider.requests.find(
      (r) => r.kind === 'witchSave' && r.user.includes('第 2 晚'),
    )
    expect(day2Witch?.user).toContain('解药可用，毒药已用')
  })
})

describe('公共历史渲染 - 文案单元', () => {
  it('渲染全部十个阶段标签、发言、投票、公告与中立死因文案', () => {
    const {master} = createGame({
      players: makePlayers([
        [1, 'werewolf'],
        [2, 'seer'],
        [3, 'witch'],
        [4, 'hunter'],
      ]),
      script: () => skipTarget(),
    })
    master.state.publicLog.push(
      {type: 'phase', day: 1, phase: 'night-wolves'},
      {type: 'phase', day: 1, phase: 'night-seer'},
      {type: 'phase', day: 1, phase: 'night-witch'},
      {type: 'phase', day: 1, phase: 'day-announce'},
      {type: 'phase', day: 1, phase: 'day-discuss'},
      {type: 'phase', day: 1, phase: 'day-vote'},
      {type: 'phase', day: 1, phase: 'day-pk'},
      {type: 'phase', day: 1, phase: 'day-execute'},
      {type: 'phase', day: 1, phase: 'hunter-shoot'},
      {type: 'phase', day: 1, phase: 'game-over'},
      {type: 'speak', day: 1, speaker: 1, text: '发言内容'},
      {type: 'death', day: 1, victim: 1, reason: 'wolves'},
      {type: 'death', day: 1, victim: 2, reason: 'vote'},
      {type: 'death', day: 1, victim: 3, reason: 'poison'},
      {type: 'death', day: 1, victim: 4, reason: 'hunter'},
      {type: 'vote', day: 1, voter: 1, target: 2},
      {type: 'announce', day: 1, text: '公告内容'},
      {type: 'announce', day: 2, text: '第二天的公告'},
    )

    const rendered = master['renderPublicHistory']()
    expect(rendered).toContain('【第 1 天 夜晚-狼人行动】')
    expect(rendered).toContain('【第 1 天 夜晚-预言家查验】')
    expect(rendered).toContain('【第 1 天 夜晚-女巫行动】')
    expect(rendered).toContain('【第 1 天 白天-公告】')
    expect(rendered).toContain('【第 1 天 白天-讨论】')
    expect(rendered).toContain('【第 1 天 白天-投票】')
    expect(rendered).toContain('【第 1 天 白天-平票 PK】')
    expect(rendered).toContain('【第 1 天 白天-处决】')
    expect(rendered).toContain('【第 1 天 猎人开枪】')
    expect(rendered).toContain('【第 1 天 对局结束】')
    expect(rendered).toContain('1号(玩家1)：发言内容')
    // 新行为：狼刀与毒杀不可区分，统一「昨夜倒牌出局」；死因只保留在复盘里
    expect(rendered).toContain('系统：1号(玩家1) 昨夜倒牌出局。')
    expect(rendered).toContain('系统：2号(玩家2) 被投票出局。')
    expect(rendered).toContain('系统：3号(玩家3) 昨夜倒牌出局。')
    expect(rendered).not.toContain('昨夜被毒')
    expect(rendered).toContain('系统：4号(玩家4) 被猎人开枪带走。')
    expect(rendered).toContain('1号 → 2号')
    expect(rendered).toContain('系统：公告内容')

    expect(master['renderPublicHistory'](2)).toBe('系统：第二天的公告')
  })
})
