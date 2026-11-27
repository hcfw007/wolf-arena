import {describe, expect, it, vi} from 'vitest'

import {GameRecorder} from '../src/recorder.js'
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

  // 二轮终投未开 allowSkip，choice 恒有回退目标，finalVotes 不可能为空；
  // 该分支仅在决策被劫持的退化场景下可达，与 runVotePhase 空票分支同为防御性语义，用直调用例钉住
  it('二轮终投全部为空的退化场景直调：记「狼队未达成有效决策」并空刀', async () => {
    const recorder = new GameRecorder()
    const {master, provider} = createGame({
      players: makePlayers([[1, 'werewolf'], [2, 'werewolf'], [3, 'villager'], [4, 'seer']]),
      script: () => skipTarget(),
      recorder,
    })
    for (const agent of master.agents.values()) {
      vi.spyOn(agent, 'chooseTarget').mockResolvedValue({thinking: '', choice: null})
    }

    await expect(master['runWolvesPhase']()).resolves.toBeNull()

    expect(provider.requests).toHaveLength(0)
    const wolves = recorder.data().days[0]?.wolves
    expect(wolves?.finals).toHaveLength(2)
    expect(wolves?.target).toBeNull()
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

  it('救人状态跨夜归位：解药耗尽后第二晚不再触发救人流，被刀者直接结算', async () => {
    const {master, provider} = createGame({
      players: witchPlayers(),
      script: {
        kills: {1: 3},
        seerTarget: {4: 1},
        // 第 1 晚救人，第 2 晚无药可救
        witchSave: {1: true, 2: false},
        // 平票进 PK 再平票，白天无人出局，保证能活到第 2 晚
        votes: {1: 3, 2: 4, 3: 4, 4: 3},
      },
    })

    await master.run(2)

    // 第 1 晚：救下 3 号，平安夜，解药耗尽
    expect(eventsOfType(master, 'announce')).toContainEqual(
      {type: 'announce', day: 1, text: '第 1 天，昨夜平安夜。'},
    )
    expect(master.state.witchPotions).toEqual({heal: false, poison: true})

    // 第 2 晚：不再询问救人（witchSave 请求只出现在第 1 晚），3 号被刀直接结算
    const saveRequests = provider.requests.filter((r) => r.kind === 'witchSave')
    expect(saveRequests).toHaveLength(1)
    expect(saveRequests[0]?.day).toBe(1)
    expect(eventsOfType(master, 'death')).toEqual([
      {type: 'death', day: 2, victim: 3, reason: 'wolves'},
    ])

    // 女巫第 2 晚的私密信息如实显示「解药已用」
    const day2Witch = provider.requests.find((r) => r.kind === 'witchPoison' && r.day === 2)
    expect(day2Witch?.user).toContain('解药已用')
  })
})
