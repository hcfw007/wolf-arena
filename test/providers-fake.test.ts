import {describe, expect, it} from 'vitest'

import {GameMaster} from '../src/game/master.js'
import {FakeProvider} from '../src/providers/fake.js'
import {makePlayers} from './helpers/fixtures.js'

// FakeProvider 是 CLI --provider fake 的生产后端，这里覆盖它自己的行为契约。
const PLAYERS = makePlayers([
  [1, 'werewolf'],
  [2, 'werewolf'],
  [3, 'werewolf'],
  [4, 'seer'],
  [5, 'witch'],
  [6, 'hunter'],
  [7, 'villager'],
  [8, 'villager'],
  [9, 'villager'],
])

describe('FakeProvider（CLI 假后端）', () => {
  it('确定性假后端能驱动整局并留下完整记录', async () => {
    const provider = new FakeProvider()
    const gm = new GameMaster({players: PLAYERS, provider, verbose: false})
    const winner = await gm.run(8)

    expect(['wolves', 'villagers']).toContain(winner)
    expect(gm.state.phase).toBe('game-over')
    expect(gm.state.publicLog.some((e) => e.type === 'death')).toBe(true)
    expect(gm.state.seerChecks.length).toBeGreaterThan(0)

    const kinds = new Set(provider.calls.map((c) => c.kind))
    expect(kinds).toEqual(new Set(['speak', 'vote', 'target', 'save']))
    expect(provider.totals.calls).toBe(provider.calls.length)
    expect(provider.totals.calls).toBeGreaterThan(0)
  })

  it('同一假后端两局调用序列完全一致（确定性）', async () => {
    const run = async (): Promise<string[]> => {
      const provider = new FakeProvider()
      const gm = new GameMaster({players: PLAYERS, provider, verbose: false})
      await gm.run(8)
      return provider.calls.map((c) => `${c.kind}:${c.selfId}`)
    }
    expect(await run()).toEqual(await run())
  })
})
