import {describe, expect, it} from 'vitest'

import {clipText, parseSpeech} from '../src/ai/parse.js'

describe('parseSpeech', () => {
  it('解析标准 thinking + speech 标签', () => {
    const parsed = parseSpeech('<thinking>先观察</thinking>\n<speech>我认为 3 号是狼。</speech>')
    expect(parsed).toEqual({thinking: '先观察', speech: '我认为 3 号是狼。'})
  })

  it('只有 speech 标签时 thinking 为空', () => {
    expect(parseSpeech('<speech>大家好。</speech>')).toEqual({thinking: '', speech: '大家好。'})
  })

  it('缺失 speech 标签时剥离 thinking 与残留标签，取剩余文本兜底', () => {
    const parsed = parseSpeech('<thinking>策略</thinking>\n裸奔的发言内容')
    expect(parsed).toEqual({thinking: '策略', speech: '裸奔的发言内容'})
  })

  it('未闭合的 speech 标签按裸文本兜底', () => {
    const parsed = parseSpeech('<thinking>t</thinking><speech>没闭合')
    expect(parsed).toEqual({thinking: 't', speech: '没闭合'})
  })

  it('无任何标签的乱输出整体作为 speech', () => {
    const parsed = parseSpeech(' 这是一段没有任何格式的输出。\n第二行。 ')
    expect(parsed.thinking).toBe('')
    expect(parsed.speech).toBe('这是一段没有任何格式的输出。\n第二行。')
  })

  it('标签大小写不敏感', () => {
    const parsed = parseSpeech('<THINKING>x</THINKING><SPEECH>hello</SPEECH>')
    expect(parsed).toEqual({thinking: 'x', speech: 'hello'})
  })

  it('空输出返回空结构而不是抛错', () => {
    expect(parseSpeech('')).toEqual({thinking: '', speech: ''})
  })
})

describe('clipText', () => {
  it('未超长时原样返回', () => {
    expect(clipText('短文本', 10)).toBe('短文本')
  })

  it('超长时截断为 maxChars 并以省略号结尾', () => {
    const clipped = clipText('abcdefghij', 5)
    expect(clipped).toBe('abcd…')
    expect(clipped).toHaveLength(5)
  })
})
