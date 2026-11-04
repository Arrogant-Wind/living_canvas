import { describe, expect, it } from 'vitest'
import { extractJson } from '../src/json'

describe('extractJson', () => {
  it('reads a fenced json block surrounded by prose', () => {
    expect(extractJson('Đây:\n```json\n{"reply":"a","ops":[]}\n```\nxong')).toEqual({ reply: 'a', ops: [] })
  })

  it('reads a bare object surrounded by text', () => {
    expect(extractJson('xx {"a":1} yy')).toEqual({ a: 1 })
  })

  it('handles braces inside strings', () => {
    expect(extractJson('ok {"reply":"dùng {x} nhé","ops":[]}')).toEqual({ reply: 'dùng {x} nhé', ops: [] })
  })

  it('throws when there is no json', () => {
    expect(() => extractJson('không có')).toThrow()
  })
})
