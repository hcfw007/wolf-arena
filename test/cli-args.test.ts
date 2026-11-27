import {describe, expect, it} from 'vitest'

import {DEFAULTS, parseCliArgs} from '../src/cli-args.js'

describe('parseCliArgs', () => {
  it('空参数走默认值', () => {
    const opts = parseCliArgs([])
    expect(opts.days).toBe(DEFAULTS.days)
    expect(opts.provider).toBe(DEFAULTS.provider)
    expect(opts.winCondition).toBe(DEFAULTS.winCondition)
    expect(opts.format).toBe(DEFAULTS.format)
    expect(opts.verbose).toBe(DEFAULTS.verbose)
    expect(opts.help).toBe(false)
    expect(opts.out).toBeUndefined()
  })

  it('解析完整参数', () => {
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
    expect(opts.days).toBe(3)
    expect(opts.provider).toBe('fake')
    expect(opts.winCondition).toBe('city')
    expect(opts.format).toBe('all')
    expect(opts.out).toBe('logs/')
    expect(opts.verbose).toBe(false)
    expect(opts.model).toBe('deepseek-reasoner')
    expect(opts.baseUrl).toBe('https://example.com')
  })

  it('--help / -h 被识别', () => {
    expect(parseCliArgs(['--help']).help).toBe(true)
    expect(parseCliArgs(['-h']).help).toBe(true)
  })

  it('非法参数直接报错，不静默忽略', () => {
    expect(() => parseCliArgs(['--days', '0'])).toThrow(/--days/)
    expect(() => parseCliArgs(['--days', 'abc'])).toThrow(/--days/)
    expect(() => parseCliArgs(['--provider', 'gpt'])).toThrow(/--provider/)
    expect(() => parseCliArgs(['--format', 'pdf'])).toThrow(/--format/)
    expect(() => parseCliArgs(['--win-condition', 'chaos'])).toThrow(/--win-condition/)
    expect(() => parseCliArgs(['--nope'])).toThrow(/参数解析失败/)
    expect(() => parseCliArgs(['extra'])).toThrow(/参数解析失败/)
  })
})
