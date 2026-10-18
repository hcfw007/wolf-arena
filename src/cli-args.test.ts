import assert from 'node:assert/strict'
import {test} from 'node:test'
import {DEFAULTS, parseCliArgs} from './cli-args.js'

test('空参数走默认值', () => {
  const opts = parseCliArgs([])
  assert.equal(opts.days, DEFAULTS.days)
  assert.equal(opts.provider, DEFAULTS.provider)
  assert.equal(opts.winCondition, DEFAULTS.winCondition)
  assert.equal(opts.format, DEFAULTS.format)
  assert.equal(opts.verbose, DEFAULTS.verbose)
  assert.equal(opts.help, false)
  assert.equal(opts.out, undefined)
})

test('解析完整参数', () => {
  const opts = parseCliArgs([
    '--days',
    '3',
    '--provider',
    'fake',
    '--win-condition',
    'city',
    '--format',
    'all',
    '--out',
    'logs/',
    '--quiet',
    '--model',
    'deepseek-reasoner',
    '--base-url',
    'https://example.com',
  ])
  assert.equal(opts.days, 3)
  assert.equal(opts.provider, 'fake')
  assert.equal(opts.winCondition, 'city')
  assert.equal(opts.format, 'all')
  assert.equal(opts.out, 'logs/')
  assert.equal(opts.verbose, false)
  assert.equal(opts.model, 'deepseek-reasoner')
  assert.equal(opts.baseUrl, 'https://example.com')
})

test('--help / -h 被识别', () => {
  assert.equal(parseCliArgs(['--help']).help, true)
  assert.equal(parseCliArgs(['-h']).help, true)
})

test('非法参数直接报错，不静默忽略', () => {
  assert.throws(() => parseCliArgs(['--days', '0']), /--days/)
  assert.throws(() => parseCliArgs(['--days', 'abc']), /--days/)
  assert.throws(() => parseCliArgs(['--provider', 'gpt']), /--provider/)
  assert.throws(() => parseCliArgs(['--format', 'pdf']), /--format/)
  assert.throws(() => parseCliArgs(['--win-condition', 'chaos']), /--win-condition/)
  assert.throws(() => parseCliArgs(['--nope']), /参数解析失败/)
  assert.throws(() => parseCliArgs(['extra']), /参数解析失败/)
})
