import assert from 'node:assert/strict'
import {test} from 'node:test'
import {clipText, parseSpeech} from './parse.js'

test('parseSpeech 同时提取 thinking 和 speech', () => {
  const out = parseSpeech('<thinking>我是狼</thinking>\n<speech>我投 4 号。</speech>')
  assert.equal(out.thinking, '我是狼')
  assert.equal(out.speech, '我投 4 号。')
})

test('parseSpeech 只有 speech 标签时不丢内容', () => {
  const out = parseSpeech('<speech>过。</speech>')
  assert.equal(out.thinking, '')
  assert.equal(out.speech, '过。')
})

test('parseSpeech 没有标签时把原文当作发言', () => {
  const out = parseSpeech('<thinking>想一下</thinking>\n我过。')
  assert.equal(out.thinking, '想一下')
  assert.equal(out.speech, '我过。')
})

test('clipText 在超长时截断并加省略号', () => {
  assert.equal(clipText('短', 10), '短')
  const long = 'a'.repeat(50)
  const clipped = clipText(long, 10)
  assert.equal(clipped.length, 10)
  assert.ok(clipped.endsWith('…'))
})
