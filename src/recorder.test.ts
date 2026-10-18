import assert from 'node:assert/strict'
import {readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {PlayerState} from './game/types.js'
import {GameRecorder} from './recorder.js'

const players: PlayerState[] = [
  {id: 1, name: '狼甲', role: 'werewolf', alive: true, personality: '沉默'},
  {id: 2, name: '民乙', role: 'villager', alive: true, personality: '话多'},
]

test('复盘保留死因（公开信息里被刻意隐藏的那部分）', () => {
  const recorder = new GameRecorder()
  recorder.start(players)
  recorder.dayHeader(1)
  recorder.deaths(1, [{id: 2, reason: 'poison'}])
  recorder.end('wolves', players, {calls: 3, promptTokens: 10, completionTokens: 20})

  const file = join(tmpdir(), `wolf-arena-test-${process.pid}-${Date.now()}.md`)
  recorder.save(file)
  try {
    const content = readFileSync(file, 'utf-8')
    assert.match(content, /被毒/, '复盘是上帝视角，死因必须保留')
    assert.match(content, /狼人阵营胜利/)
    assert.match(content, /Token 统计/)
    assert.match(content, /\| 1 \| 狼甲 \| 狼人 \|/)
  } finally {
    rmSync(file, {force: true})
  }
})
