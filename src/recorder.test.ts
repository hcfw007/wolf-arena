import assert from 'node:assert/strict'
import {readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {PlayerState} from './game/types.js'
import {GameRecorder, ReplayFormat} from './recorder.js'

const PLAYERS: PlayerState[] = [
  {id: 1, name: '狼甲', role: 'werewolf', alive: false, personality: '沉默'},
  {id: 2, name: '预乙', role: 'seer', alive: true, personality: '话多'},
  {id: 3, name: '民丙', role: 'villager', alive: true, personality: '谨慎'},
]

const XSS = '<script>alert(1)</script>'

function filledRecorder(): GameRecorder {
  const recorder = new GameRecorder()
  recorder.start(PLAYERS)
  recorder.dayHeader(1)
  recorder.wolfRound1([{wolfId: 1, choice: 2, thinking: '先刀预言家'}])
  recorder.wolfFinal([{wolfId: 1, choice: 2, thinking: '集中票'}], 2)
  recorder.seerCheck(2, 1, 'wolves')
  recorder.witchSave(false, 2)
  recorder.witchPoison(null)
  recorder.deaths(1, [{id: 1, reason: 'poison'}])
  recorder.speak(2, '他是狼', `我查杀 1 号 ${XSS}`)
  recorder.pkSpeak(1, '我是好人', '别投我')
  recorder.votes(1, [{voter: 2, target: 1}], 1)
  recorder.votes(1, [{voter: 3, target: 1}], 1, 'PK 轮重投')
  recorder.hunterShoot(1, null, '没把握')
  recorder.end('villagers', PLAYERS, {calls: 7, promptTokens: 100, completionTokens: 200})
  return recorder
}

function withTempFile(ext: string, run: (file: string) => void) {
  const file = join(tmpdir(), `wolf-arena-test-${process.pid}-${Date.now()}${ext}`)
  try {
    run(file)
  } finally {
    rmSync(file, {force: true})
  }
}

test('Markdown 导出：保留死因、投票统计与 Token 统计', () => {
  const markdown = filledRecorder().render('md')
  assert.match(markdown, /狼队第一轮商议/)
  assert.match(markdown, /被毒/, '复盘是上帝视角，死因必须保留')
  assert.match(markdown, /#### 投票（PK 轮重投）/)
  assert.match(markdown, /⚖️ \*\*1号\(狼甲\)\*\* 被投票出局/)
  assert.match(markdown, /好人阵营胜利/)
  assert.match(markdown, /Token 统计/)
  assert.match(markdown, /\| 1 \| 狼甲 \| 狼人 \|/)
})

test('JSON 导出：结构化且可机器读取', () => {
  const data = JSON.parse(filledRecorder().render('json'))
  assert.equal(data.players.length, 3)
  assert.equal(data.winner, 'villagers')
  assert.equal(data.days[0].day, 1)
  assert.equal(data.days[0].wolves.target, 2)
  assert.deepEqual(data.days[0].seer, {seerId: 2, target: 1, result: 'wolves'})
  assert.deepEqual(data.days[0].deaths, [{id: 1, reason: 'poison'}])
  assert.equal(data.days[0].voteRounds.length, 2)
  assert.equal(data.days[0].voteRounds[1].label, 'PK 轮重投')
  assert.equal(data.days[0].hunter.target, null)
  assert.equal(data.stats.calls, 7)
})

test('HTML 导出：单文件页面且转义 LLM 输出', () => {
  const html = filledRecorder().render('html')
  assert.match(html, /^<!doctype html>/)
  assert.match(html, /<title>Wolf Arena 对局复盘<\/title>/)
  assert.match(html, /<style>/)
  assert.match(html, /好人阵营胜利/)
  assert.ok(!html.includes(XSS), '发言里的 HTML 必须被转义，不能原样注入')
  assert.match(html, /&lt;script&gt;/)
})

test('save() 按扩展名选格式', () => {
  const cases: [string, ReplayFormat, (content: string) => void][] = [
    ['.md', 'md', (c) => assert.match(c, /^# Wolf Arena/)],
    ['.json', 'json', (c) => assert.equal(JSON.parse(c).winner, 'villagers')],
    ['.html', 'html', (c) => assert.match(c, /^<!doctype html>/)],
  ]
  for (const [ext, , check] of cases) {
    withTempFile(ext, (file) => {
      const written = filledRecorder().save(file)
      check(readFileSync(written, 'utf-8'))
    })
  }
})
