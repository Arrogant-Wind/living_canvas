import { describe, expect, it } from 'vitest'
import { AiReplySchema, OpSchema } from '../src/ir'

describe('IR schemas', () => {
  it('accepts a reply with an add_node op', () => {
    const r = AiReplySchema.parse({ reply: 'ok', ops: [{ op: 'add_node', tempId: 'n1', title: 'Xây nhân vật' }] })
    expect(r.ops[0]).toMatchObject({ op: 'add_node', tempId: 'n1', title: 'Xây nhân vật' })
  })

  it('rejects add_node without tempId', () => {
    expect(OpSchema.safeParse({ op: 'add_node', title: 'x' }).success).toBe(false)
  })

  it('rejects unknown op', () => {
    expect(OpSchema.safeParse({ op: 'fly', id: 'a' }).success).toBe(false)
  })

  it('defaults ops to an empty list', () => {
    expect(AiReplySchema.parse({ reply: 'ok' }).ops).toEqual([])
  })
})
