import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {GameMaster} from '../src/game/master.js'
import {
  createGame,
  makePlayers,
  rawTarget,
  scriptedHandler,
  skipTarget,
  speech,
  target,
  voteFor,
} from './helpers/fixtures.js'
import {type MockHandler, MockProvider, asGameProvider} from './helpers/mock-provider.js'

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
})

describe('verbose 控制台输出', () => {
  it('verbose 缺省即开启：单狼流程完整打印并以狼人胜利收尾', async () => {
    const provider = new MockProvider(
      scriptedHandler({
        kills: {1: 2},
        seerTarget: {4: 1},
        votes: {1: 3, 3: 4, 4: 1},
      }),
    )

    const master = new GameMaster({
      players: makePlayers([
        [1, 'werewolf'],
        [2, 'villager'],
        [3, 'villager'],
        [4, 'seer'],
      ]),
      provider: asGameProvider(provider),
    })

    await master.run(1)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('========== 第 1 天 =========='))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[夜晚] 狼人行动中...'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('→ 最终刀杀目标：2号'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('预言家查验 1号 → 查杀'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('  2号(玩家2) 出局'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[白天] 讨论开始'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[白天] 投票'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('平票，无人出局'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('游戏结束：狼人阵营胜利'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('身份揭晓：'))
  })

  it('女巫救出平安夜、预言家金水与处决均有打印', async () => {
    const {master} = createGame({
      players: makePlayers([
        [1, 'werewolf'],
        [2, 'witch'],
        [3, 'villager'],
        [4, 'seer'],
      ]),
      script: {
        kills: {1: 3},
        seerTarget: {4: 3},
        witchSave: true,
        votes: {1: 3, 2: 3, 3: 1, 4: 3},
      },
      verbose: true,
    })

    await master.run(1)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('  平安夜！'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('女巫使用解药救 3号'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('预言家查验 3号 → 金水'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('  3号(玩家3) 被投票出局'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[夜晚] 女巫行动中...'))
  })

  it('女巫用毒有打印', async () => {
    const {master} = createGame({
      players: makePlayers([
        [1, 'werewolf'],
        [2, 'witch'],
        [3, 'villager'],
        [4, 'seer'],
      ]),
      script: {
        kills: {1: 3},
        seerTarget: {4: 1},
        witchSave: false,
        witchPoison: 4,
      },
      verbose: true,
    })

    await master.run(1)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('女巫使用毒药毒 4号'))
  })

  it('猎人开枪与好人阵营胜利均有打印', async () => {
    const {master} = createGame({
      players: makePlayers([
        [1, 'werewolf'],
        [2, 'villager'],
        [3, 'villager'],
        [4, 'hunter'],
      ]),
      script: {
        kills: {1: 2},
        votes: {1: 4, 3: 4, 4: 3},
        hunterTarget: 1,
      },
      verbose: true,
    })

    await master.run(1)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[猎人] 4号(玩家4) 出局，是否开枪？'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('→ 猎人开枪带走 1号(玩家1)'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('游戏结束：好人阵营胜利'))
  })

  it('多狼两轮商议与空 thinking 回退均有打印', async () => {
    const handler: MockHandler = (req) => {
      switch (req.kind) {
        case 'wolvesRound1':
          return rawTarget(3)
        case 'wolvesRound2':
          return req.playerId === 1 ? target(3) : rawTarget(3)
        case 'seer':
          return target(1)
        case 'speak':
          return speech('过。')
        case 'vote': {
          const tie: Record<number, number> = {1: 4, 2: 5, 4: 6, 5: 1, 6: 2}
          return voteFor(tie[req.playerId] ?? 999)
        }
        default:
          return skipTarget()
      }
    }
    const {master} = createGame({
      players: makePlayers([
        [1, 'werewolf'],
        [2, 'werewolf'],
        [3, 'villager'],
        [4, 'villager'],
        [5, 'villager'],
        [6, 'seer'],
      ]),
      script: handler,
      verbose: true,
    })

    await master.run(1)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[一轮] 狼1号 提议刀 3号'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[二轮] 狼2号 终投 3号'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('→ 最终刀杀目标：3号'))
  })
})
