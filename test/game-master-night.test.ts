import {describe, expect, it} from 'vitest'

import {createGame, eventsOfType, makePlayers, skipTarget, speech, target, voteFor} from './helpers/fixtures.js'
import type {MockHandler} from './helpers/mock-provider.js'

describe('夜晚阶段 - 狼人刀人', () => {
  it('单狼刀杀目标在黎明结算为昨夜倒牌', async () => {
    const {master} = createGame({
      players: makePlayers([[1, 'werewolf'], [2, 'villager'], [3, 'villager'], [4, 'seer']]),
      script: {
        kills: {1: 2},
        seerTarget: {4: 1},
        votes: {1: 3, 3: 4, 4: 1},
      },
    })

    await master.run(1)

    expect(eventsOfType(master, 'death')).toEqual([
      {type: 'death', day: 1, victim: 2, reason: 'wolves'},
    ])
    expect(master.state.players.find((p) => p.id === 2)?.alive).toBe(false)
  })

  it('多狼两轮商议，按第二轮终投多数票定刀', async () => {
    const {master, provider} = createGame({
      players: makePlayers([
        [1, 'werewolf'],
        [2, 'werewolf'],
        [3, 'villager'],
        [4, 'villager'],
        [5, 'seer'],
        [6, 'villager'],
      ]),
      script: {
        wolfProposals: {1: 5, 2: 3},
        wolfFinals: {1: 5, 2: 5},
        seerTarget: {5: 1},
        votes: {1: 3, 2: 3, 3: 6, 4: 6, 6: 3},
      },
    })

    await master.run(1)

    expect(eventsOfType(master, 'death')).toContainEqual(
      {type: 'death', day: 1, victim: 5, reason: 'wolves'},
    )
    const kinds = provider.requests.map((r) => r.kind)
    expect(kinds.filter((k) => k === 'wolvesRound1')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'wolvesRound2')).toHaveLength(2)
    const finalVotes = provider.requests.filter((r) => r.kind === 'wolvesRound2')
    // 二轮终投的指令里必须带上队友的一轮提议供参考
    expect(finalVotes).toHaveLength(2)
    expect(finalVotes[0]?.system).toContain('【狼队第一轮提议】')
    expect(finalVotes[0]?.system).toContain('狼2号 提议刀 3号')
  })
})

describe('夜晚阶段 - 预言家查验', () => {
  it('查验狼人记录为查杀（wolves）', async () => {
    const {master} = createGame({
      players: makePlayers([[1, 'werewolf'], [2, 'villager'], [3, 'villager'], [4, 'seer']]),
      script: {
        kills: {1: 2},
        seerTarget: {4: 1},
        votes: {1: 3, 3: 4, 4: 1},
      },
    })

    await master.run(1)

    expect(master.state.seerChecks).toEqual([{day: 1, target: 1, result: 'wolves'}])
  })

  it('查验好人记录为金水（villagers）', async () => {
    const {master} = createGame({
      players: makePlayers([[1, 'werewolf'], [2, 'villager'], [3, 'villager'], [4, 'seer']]),
      script: {
        kills: {1: 2},
        seerTarget: {4: 3},
        votes: {1: 3, 3: 4, 4: 1},
      },
    })

    await master.run(1)

    expect(master.state.seerChecks).toEqual([{day: 1, target: 3, result: 'villagers'}])
  })

  it('第二晚的查验请求携带第一晚的查验记录', async () => {
    const handler: MockHandler = (req) => {
      switch (req.kind) {
        case 'wolvesRound1':
          return req.user.includes('第 1 晚') ? target(2) : target(3)
        case 'seer':
          return target(1)
        case 'speak':
          return speech('过。')
        case 'vote': {
          const tie: Record<number, number> = {1: 3, 3: 4, 4: 1}
          return voteFor(tie[req.playerId] ?? 999)
        }
        default:
          return skipTarget()
      }
    }
    const {master, provider} = createGame({
      players: makePlayers([[1, 'werewolf'], [2, 'villager'], [3, 'villager'], [4, 'seer']]),
      script: handler,
    })

    await master.run(2)

    expect(master.state.seerChecks).toHaveLength(2)
    const seerCalls = provider.requests.filter((r) => r.kind === 'seer')
    expect(seerCalls).toHaveLength(2)
    expect(seerCalls[1]?.user).toContain('查验记录')
    expect(seerCalls[1]?.user).toContain('第1晚查验')
  })
})

describe('夜晚阶段 - 女巫用药', () => {
  const witchPlayers = () => makePlayers([[1, 'werewolf'], [2, 'witch'], [3, 'villager'], [4, 'seer']])

  it('使用解药救人 → 平安夜且解药耗尽', async () => {
    const {master} = createGame({
      players: witchPlayers(),
      script: {
        kills: {1: 3},
        seerTarget: {4: 1},
        witchSave: true,
        votes: {1: 3, 2: 4, 3: 4, 4: 3},
      },
    })

    await master.run(1)

    expect(eventsOfType(master, 'death')).toEqual([])
    expect(eventsOfType(master, 'announce')).toContainEqual(
      {type: 'announce', day: 1, text: '第 1 天，昨夜平安夜。'},
    )
    expect(master.state.witchPotions).toEqual({heal: false, poison: true})
    expect(master.state.players.every((p) => p.alive)).toBe(true)
  })

  it('不用解药改用毒药，毒杀目标结算为昨夜被毒', async () => {
    const {master} = createGame({
      players: witchPlayers(),
      script: {
        kills: {1: 3},
        seerTarget: {4: 1},
        witchSave: false,
        witchPoison: 1,
      },
    })

    const winner = await master.run(1)

    expect(eventsOfType(master, 'death')).toEqual([
      {type: 'death', day: 1, victim: 3, reason: 'wolves'},
      {type: 'death', day: 1, victim: 1, reason: 'poison'},
    ])
    expect(master.state.witchPotions).toEqual({heal: true, poison: false})
    // 毒死最后一狼，屠边判定好人胜利
    expect(winner).toBe('villagers')
  })

  it('狼人刀中女巫时女巫不能自救，但仍可选择开毒', async () => {
    const {master, provider} = createGame({
      players: witchPlayers(),
      script: {
        kills: {1: 2},
        seerTarget: {4: 1},
        votes: {1: 3, 3: 4, 4: 1},
      },
    })

    await master.run(1)

    const kinds = provider.requests.map((r) => r.kind)
    expect(kinds).not.toContain('witchSave')
    expect(kinds.filter((k) => k === 'witchPoison')).toHaveLength(1)
    expect(eventsOfType(master, 'death')).toEqual([
      {type: 'death', day: 1, victim: 2, reason: 'wolves'},
    ])
  })
})
