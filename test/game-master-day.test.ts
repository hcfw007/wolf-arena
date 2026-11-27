import {describe, expect, it} from 'vitest'

import {createGame, eventsOfType, makePlayers, skipTarget} from './helpers/fixtures.js'

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
    // 平票进 PK 后平票者会追加发言：讨论轮 [1,2,3,4] + PK 发言 [3,4]
    expect(speaks.map((s) => s.speaker)).toEqual([1, 2, 3, 4, 3, 4])
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

  it('平票进 PK 重投仍然平票时无人出局', async () => {
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

    // 旧「平票直接无人出局」语义已改为平票进 PK：首轮 4 票 + PK 重投 4 票
    expect(eventsOfType(master, 'vote')).toHaveLength(8)
    expect(eventsOfType(master, 'phase').map((p) => p.phase)).toContain('day-pk')
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

  // run() 判胜检查保证进入投票时至少 3 人存活，此分支仅在直接调用退化场景下可达，
  // 与猎人「无存活目标跳过开枪」同为防御性退化语义，用直调用例钉住行为
  it('无存活玩家时记空票并无人出局（退化场景直调）', async () => {
    const {master} = createGame({
      players: makePlayers([[1, 'villager']]),
      script: () => skipTarget(),
    })
    master.state.players.forEach((p) => {
      p.alive = false
    })

    await expect(master['runVotePhase']()).resolves.toBeNull()
    expect(eventsOfType(master, 'vote')).toHaveLength(0)
  })
})
