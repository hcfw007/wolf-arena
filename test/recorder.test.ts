import {mkdtempSync, readFileSync, rmSync} from 'fs'
import {tmpdir} from 'os'
import {join} from 'path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'

import {GameRecorder} from '../src/recorder.js'
import {createGame, makePlayers} from './helpers/fixtures.js'

let tmpDir: string

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wolf-arena-recorder-'))
})

afterAll(() => {
  rmSync(tmpDir, {recursive: true, force: true})
})

function render(name: string, fill: (recorder: GameRecorder) => void): string {
  const recorder = new GameRecorder()
  recorder.start(makePlayers([[1, 'werewolf'], [2, 'seer'], [3, 'witch'], [4, 'hunter'], [5, 'villager']]))
  fill(recorder)
  return readFileSync(recorder.save(join(tmpDir, name)), 'utf-8')
}

describe('GameRecorder 复盘文档', () => {
  it('start 写入标题与身份分配表', () => {
    const md = render('start.md', () => {})
    expect(md).toContain('# Wolf Arena 对局复盘')
    expect(md).toContain('## 身份分配')
    expect(md).toContain('| 1 | 玩家1 | 狼人 | 冷静的逻辑型玩家 |')
    expect(md).toContain('| 2 | 玩家2 | 预言家 |')
    expect(md).toContain('| 3 | 玩家3 | 女巫 |')
  })

  it('狼队终投落盘刀杀目标与未达成决策两种结果', () => {
    const md = render('wolf-final.md', (r) => {
      r.wolfFinal([{wolfId: 1, choice: 2, thinking: '他最可疑'}], 2)
      r.wolfFinal([], null)
    })
    expect(md).toContain('狼队最终投票')
    expect(md).toContain('🗡 狼队最终刀杀目标：**2号(玩家2)**')
    expect(md).toContain('狼队未达成有效决策')
  })

  it('死亡记录四种原因文案正确并带身份', () => {
    const md = render('deaths.md', (r) => {
      r.deaths(1, [
        {id: 2, reason: 'wolves'},
        {id: 3, reason: 'vote'},
        {id: 4, reason: 'poison'},
        {id: 5, reason: 'hunter'},
      ])
    })
    expect(md).toContain('☠️ 2号(玩家2) [预言家] — 昨夜倒牌')
    expect(md).toContain('☠️ 3号(玩家3) [女巫] — 被投票出局')
    expect(md).toContain('☠️ 4号(玩家4) [猎人] — 昨夜被毒')
    expect(md).toContain('☠️ 5号(玩家5) [平民] — 被猎人开枪带走')
  })

  it('空死亡列表渲染为平安夜', () => {
    const md = render('peaceful.md', (r) => r.deaths(1, []))
    expect(md).toContain('☀️ **平安夜！**')
  })

  it('投票记录包含逐票明细、统计与处决结果', () => {
    const md = render('votes.md', (r) => {
      r.votes(1, [{voter: 1, target: 2}, {voter: 2, target: 2}, {voter: 3, target: 1}], 2)
    })
    expect(md).toContain('1号(玩家1) → 2号(玩家2)')
    expect(md).toContain('_统计：2号: 2票，1号: 1票_')
    expect(md).toContain('⚖️ **2号(玩家2)** 被投票出局')
  })

  it('平票或无人出局的投票渲染为无结果', () => {
    const md = render('votes-tie.md', (r) => {
      r.votes(1, [{voter: 1, target: 2}, {voter: 2, target: 1}], null)
    })
    expect(md).toContain('🤝 平票或无人达成出局票数')
  })

  it('猎人开枪与不开枪两种落盘', () => {
    const md = render('hunter.md', (r) => {
      r.hunterShoot(4, 5, '他一直在带节奏')
      r.hunterShoot(4, null, '')
    })
    expect(md).toContain('💥 带走 **5号(玩家5)**')
    expect(md).toContain('选择不开枪')
  })

  it('女巫用药四种文案', () => {
    const md = render('witch.md', (r) => {
      r.witchSave(true, 2)
      r.witchSave(false, 2)
      r.witchPoison(5)
      r.witchPoison(null)
    })
    expect(md).toContain('使用解药救 2号(玩家2)')
    expect(md).toContain('不救（解药保留）')
    expect(md).toContain('💊 毒杀 5号(玩家5)')
    expect(md).toContain('不使用毒药')
  })

  it('对局结束包含阵营、身份揭晓与 Token 统计', () => {
    const players = makePlayers([[1, 'werewolf'], [2, 'seer']])
    const dead = {...players[1]!, alive: false}
    const md = render('end.md', (r) => r.end('wolves', [players[0]!, dead], {
      calls: 3,
      promptTokens: 100,
      completionTokens: 50,
    }))
    expect(md).toContain('### 🏆 狼人阵营胜利')
    expect(md).toContain('| 1 | 玩家1 | 狼人 | ✅ 存活 |')
    expect(md).toContain('| 2 | 玩家2 | 预言家 | ☠️ 出局 |')
    expect(md).toContain('### Token 统计')
    expect(md).toContain('- 调用次数：3')
    expect(md).toContain('- Prompt tokens：100')
    expect(md).toContain('- Completion tokens：50')
  })

  it('save 自动创建多级目录并返回绝对路径', () => {
    const recorder = new GameRecorder()
    recorder.start(makePlayers([[1, 'villager']]))
    const saved = recorder.save(join(tmpDir, 'nested', 'deep', 'file.md'))
    expect(saved.startsWith('/')).toBe(true)
    expect(() => readFileSync(saved, 'utf-8')).not.toThrow()
  })
})

describe('GameRecorder 完整对局复盘', () => {
  it('按流程生成结构连贯的完整复盘', async () => {
    const recorder = new GameRecorder()
    const players = makePlayers([[1, 'werewolf'], [2, 'villager'], [3, 'villager'], [4, 'seer']])
    const {master} = createGame({
      players,
      recorder,
      script: {
        kills: {1: 2},
        seerTarget: {4: 1},
        votes: {1: 3, 3: 1, 4: 1},
      },
    })

    const winner = await master.run(1)
    master.endGameWithStats(winner, {calls: 8, promptTokens: 1000, completionTokens: 500})
    const md = readFileSync(recorder.save(join(tmpDir, 'full-game.md')), 'utf-8')

    const markers = [
      '# Wolf Arena 对局复盘',
      '## 身份分配',
      '## 第 1 天',
      '### 夜晚',
      '**狼队第一轮商议**',
      '🗡 狼队最终刀杀目标',
      '**预言家查验**',
      '### 第 1 天 白天',
      '#### 讨论',
      '#### 投票',
      '## 对局结束',
      '### 🏆 好人阵营胜利',
      '### 身份揭晓',
      '### Token 统计',
      '- 调用次数：8',
    ]
    let lastIndex = -1
    for (const marker of markers) {
      const index = md.indexOf(marker)
      expect(index, `复盘缺少段落：${marker}`).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })
})
