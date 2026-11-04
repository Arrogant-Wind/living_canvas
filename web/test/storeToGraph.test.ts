import { describe, expect, it } from 'vitest'
import { richTextToPlain, storeToGraph } from '../src/canvas/storeToGraph'

const rt = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] })

const node = (id: string, title: string, extra: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
  typeName: 'shape',
  id: `shape:${id}`,
  type: 'wf-node',
  parentId: 'page:page',
  meta,
  props: { w: 180, h: 70, title, kind: 'unknown', inputs: '', outputs: '', description: '', container: false, ...extra },
})
const arrow = (id: string, label: string, meta: Record<string, unknown> = {}) => ({
  typeName: 'shape',
  id: `shape:${id}`,
  type: 'arrow',
  parentId: 'page:page',
  meta,
  props: { richText: rt(label) },
})
const bind = (id: string, arrowId: string, to: string, terminal: 'start' | 'end') => ({
  typeName: 'binding',
  id: `binding:${id}`,
  type: 'arrow',
  fromId: `shape:${arrowId}`,
  toId: `shape:${to}`,
  props: { terminal },
})

describe('storeToGraph', () => {
  const records = [
    node('a', 'Tìm hiểu dữ kiện', { kind: 'agent', outputs: 'dữ kiện, nguồn', outputSchema: '{"type":"array"}' }),
    node('b', 'Chuẩn hóa', { container: true }),
    { ...node('c', 'Nhân vật'), parentId: 'shape:b' },
    node('g', 'Ghost', {}, { ghost: 'p1' }),
    arrow('e1', 'dữ kiện'),
    bind('1', 'e1', 'a', 'start'),
    bind('2', 'e1', 'b', 'end'),
    arrow('e2', 'lơ lửng'),
    bind('3', 'e2', 'a', 'start'),
    {
      typeName: 'shape',
      id: 'shape:n1',
      type: 'note',
      parentId: 'page:page',
      meta: { author: 'user', kind: 'comment', targetIds: ['b'] },
      props: { richText: rt('bước này còn mơ hồ') },
    },
  ]

  it('builds nodes, edges and notes and skips ghosts', () => {
    const g = storeToGraph(records as any)
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(g.nodes[0]).toMatchObject({ title: 'Tìm hiểu dữ kiện', kind: 'agent', outputs: ['dữ kiện', 'nguồn'] })
    expect(g.nodes[0].inputs).toBeUndefined()
    expect(g.nodes[0].outputSchema).toBe('{"type":"array"}')
    expect(g.nodes[0].inputSchema).toBeUndefined()
    expect(g.nodes[2].parentId).toBe('b')
    expect(g.edges).toEqual([{ id: 'e1', from: 'a', to: 'b', label: 'dữ kiện', type: 'flow' }])
    expect(g.notes).toEqual([{ id: 'n1', text: 'bước này còn mơ hồ', author: 'user', targetIds: ['b'], kind: 'comment' }])
  })

  it('includes ghosts when asked', () => {
    expect(storeToGraph(records as any, { includeGhosts: true }).nodes.map((n) => n.id)).toContain('g')
  })

  it('flattens rich text paragraphs with newlines', () => {
    expect(richTextToPlain({ type: 'doc', content: [rt('a').content[0], rt('b').content[0]] })).toBe('a\nb')
  })
})
