import {describe, expect, it, vi} from 'vitest'

import {createGame, eventsOfType, makePlayers, skipTarget} from './helpers/fixtures.js'

describe('猎人开枪决策 - master 路径', () => {
  it('猎人夜里被刀可开枪带走目标', async () => {
    const {master} = createGame({
      players: makePlayers([
        [1, 'werewolf'],
        [2, 'villager'],
        [3, 'hunter'],
        [4, 'seer'],
      ]),
      script: {
        kills: {1: 3},
        seerTarget: {4: 1},
        hunterTarget: 2,
      },
    })

    const winner = await master.run(1)

    expect(eventsOfType(master, 'death')).toEqual([
      {type: 'death', day: 1, victim: 3, reason: 'wolves'},
      {type: 'death', day: 1, victim: 2, reason: 'hunter'},
    ])
    // 开枪带走 2 号后仅剩 1 狼 1 神职，平民全灭，屠边判定狼人胜利
    expect(winner).toBe('wolves')
  })

  it('猎人被处决后可主动不开枪', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const {master, provider} = createGame({
        players: makePlayers([
          [1, 'werewolf'],
          [2, 'villager'],
          [3, 'villager'],
          [4, 'hunter'],
        ]),
        script: {
          kills: {1: 2},
          votes: {1: 4, 3: 4, 4: 3},
          hunterTarget: null,
        },
        verbose: true,
      })

      await master.run(1)

      expect(provider.requests.map((r) => r.kind)).toContain('hunter')
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('猎人选择不开枪'))
      expect(eventsOfType(master, 'death')).toEqual([
        {type: 'death', day: 1, victim: 2, reason: 'wolves'},
        {type: 'death', day: 1, victim: 4, reason: 'vote'},
      ])
    } finally {
      logSpy.mockRestore()
    }
  })

  it('猎人被处决后 verbose 关闭时静默不开枪', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const {master, provider} = createGame({
        players: makePlayers([
          [1, 'werewolf'],
          [2, 'villager'],
          [3, 'villager'],
          [4, 'hunter'],
        ]),
        script: {
          kills: {1: 2},
          votes: {1: 4, 3: 4, 4: 3},
          hunterTarget: null,
        },
        verbose: false,
      })

      await master.run(1)

      expect(provider.requests.map((r) => r.kind)).toContain('hunter')
      expect(logSpy).not.toHaveBeenCalled()
      expect(eventsOfType(master, 'death')).toEqual([
        {type: 'death', day: 1, victim: 2, reason: 'wolves'},
        {type: 'death', day: 1, victim: 4, reason: 'vote'},
      ])
    } finally {
      logSpy.mockRestore()
    }
  })

  it('猎人出局时场上无存活玩家则跳过开枪', async () => {
    const {master, provider} = createGame({
      players: makePlayers([[1, 'hunter']]),
      script: () => skipTarget(),
    })
    master.state.players.forEach((p) => {
      p.alive = false
    })

    await expect(master['maybeHunterShoot'](1)).resolves.toBeNull()

    expect(provider.requests).toHaveLength(0)
  })
})
