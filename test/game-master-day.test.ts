import {describe, expect, it} from 'vitest'

import {createGame, eventsOfType, makePlayers} from './helpers/fixtures.js'

const dayPlayers = () =>
  makePlayers([[1, 'werewolf'], [2, 'witch'], [3, 'villager'], [4, 'seer']])

describe('白天阶段 - 发言', () => {
  it('存活玩家依次发言并写入公共历史', async () => {
    const {master} = createGame({
      players: dayPlayers(),
      script: {
        kills: {1: 3},
        seerTarget: {4: 1},
        witchSave: true,
        speeches: {1: '我是好人。', 2: '过。', 3: '相信我。', 4: '我是预言家，昨晚查了 1 号。'},
        votes: {1: 3, 2: 4, 3: 4, 4: 3},
      },
    })

    await master.run(1)

    const speaks = eventsOfType(master, 'speak')
    expect(speaks.map((s) => s.speaker)).toEqual([1, 2, 3, 4])
    expect(speaks[3]?.text).toBe('我是预言家，昨晚查了 1 号。')
  })

  it('超长发言被截断到上限以内', async () => {
    const {master} = createGame({
      players: dayPlayers(),
      script: {
        kills: {1: 3},
        seerTarget: {4: 1},
        witchSave: true,
        speeches: {3: '长'.repeat(200)},
        votes: {1: 3, 2: 4, 3: 4, 4: 3},
      },
    })

    await master.run(1)

    const longSpeech = eventsOfType(master, 'speak').find((s) => s.speaker === 3)
    expect(longSpeech?.text.length).toBeLessThanOrEqual(90)
    expect(longSpeech?.text.endsWith('…')).toBe(true)
  })
})

describe('白天阶段 - 投票计票', () => {
  it('多数票玩家被处决，记为被投票出局', async () => {
    const {master} = createGame({
      players: dayPlayers(),
      script: {
        kills: {1: 3},
        seerTarget: {4: 1},
        witchSave: true,
        votes: {1: 3, 2: 3, 3: 1, 4: 3},
      },
    })

    await master.run(1)

    const voteEvents = eventsOfType(master, 'vote')
    expect(voteEvents).toHaveLength(4)
    expect(voteEvents.map((v) => v.target)).toEqual([3, 3, 1, 3])
    expect(eventsOfType(master, 'death')).toEqual([
      {type: 'death', day: 1, victim: 3, reason: 'vote'},
    ])
    expect(master.state.players.find((p) => p.id === 3)?.alive).toBe(false)
  })

  it('平票时无人出局', async () => {
    const {master} = createGame({
      players: dayPlayers(),
      script: {
        kills: {1: 3},
        seerTarget: {4: 1},
        witchSave: true,
        votes: {1: 3, 2: 4, 3: 4, 4: 3},
      },
    })

    await master.run(1)

    expect(eventsOfType(master, 'vote')).toHaveLength(4)
    expect(eventsOfType(master, 'death')).toEqual([])
    expect(master.state.players.every((p) => p.alive)).toBe(true)
  })

  it('票数完全分散（三人各得一票）同样无人出局', async () => {
    const {master} = createGame({
      players: dayPlayers(),
      script: {
        kills: {1: 3},
        seerTarget: {4: 1},
        witchSave: true,
        votes: {1: 2, 2: 3, 3: 4, 4: 1},
      },
    })

    await master.run(1)

    expect(eventsOfType(master, 'death')).toEqual([])
    expect(master.state.players.every((p) => p.alive)).toBe(true)
  })
})
