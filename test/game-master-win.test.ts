import {describe, expect, it} from 'vitest'

import {createGame, eventsOfType, makePlayers} from './helpers/fixtures.js'

describe('胜负判定', () => {
  it('屠边：最后一狼被投出局则好人阵营胜利', async () => {
    const {master} = createGame({
      players: makePlayers([[1, 'werewolf'], [2, 'villager'], [3, 'villager'], [4, 'seer']]),
      script: {
        kills: {1: 2},
        seerTarget: {4: 1},
        votes: {1: 3, 3: 1, 4: 1},
      },
    })

    const winner = await master.run(1)

    expect(winner).toBe('villagers')
    expect(master.state.phase).toEqual({kind: 'game-over', winner: 'villagers'})
  })

  it('屠城：狼人存活数 >= 好人时立即判狼人胜利', async () => {
    const {master} = createGame({
      players: makePlayers([[1, 'werewolf'], [2, 'werewolf'], [3, 'villager'], [4, 'seer']]),
      script: {
        wolfProposals: {1: 4, 2: 4},
        wolfFinals: {1: 4, 2: 4},
        seerTarget: {4: 1},
      },
    })

    const winner = await master.run(1)

    expect(winner).toBe('wolves')
    expect(master.state.phase).toEqual({kind: 'game-over', winner: 'wolves'})
    expect(eventsOfType(master, 'death')).toEqual([
      {type: 'death', day: 1, victim: 4, reason: 'wolves'},
    ])
    // 夜里达成屠城，白天不再进行
    expect(eventsOfType(master, 'speak')).toEqual([])
  })

  it('达到天数上限仍无胜负时默认狼人获胜', async () => {
    const {master} = createGame({
      players: makePlayers([[1, 'werewolf'], [2, 'villager'], [3, 'villager'], [4, 'seer']]),
      script: {
        kills: {1: 2},
        seerTarget: {4: 1},
        votes: {1: 3, 3: 4, 4: 1},
      },
    })

    const winner = await master.run(1)

    expect(winner).toBe('wolves')
    expect(eventsOfType(master, 'vote')).toHaveLength(3)
  })

  it('猎人被投票出局可开枪带走狼人，好人翻盘', async () => {
    const {master} = createGame({
      players: makePlayers([[1, 'werewolf'], [2, 'villager'], [3, 'villager'], [4, 'hunter']]),
      script: {
        kills: {1: 2},
        votes: {1: 4, 3: 4, 4: 3},
        hunterTarget: 1,
      },
    })

    const winner = await master.run(1)

    expect(winner).toBe('villagers')
    expect(eventsOfType(master, 'death')).toEqual([
      {type: 'death', day: 1, victim: 2, reason: 'wolves'},
      {type: 'death', day: 1, victim: 4, reason: 'vote'},
      {type: 'death', day: 1, victim: 1, reason: 'hunter'},
    ])
  })

  it('猎人被毒杀不能开枪', async () => {
    const {master, provider} = createGame({
      players: makePlayers([[1, 'werewolf'], [2, 'witch'], [3, 'hunter'], [4, 'villager']]),
      script: {
        kills: {1: 4},
        witchSave: false,
        witchPoison: 3,
      },
    })

    const winner = await master.run(1)

    expect(winner).toBe('wolves')
    expect(provider.requests.map((r) => r.kind)).not.toContain('hunter')
    expect(eventsOfType(master, 'death')).toEqual([
      {type: 'death', day: 1, victim: 4, reason: 'wolves'},
      {type: 'death', day: 1, victim: 3, reason: 'poison'},
    ])
  })
})
