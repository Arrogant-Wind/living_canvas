import { describe, expect, it } from 'vitest'
import { diffGraphs, diffToText } from '../src/diff'
import type { Graph } from '../src/ir'

const prev: Graph = {
  nodes: [
    { id: 'n1', title: 'A', status: 'draft' },
    { id: 'n2', title: 'B', status: 'draft' },
  ],
  edges: [],
  notes: [],
}

describe('diffGraphs', () => {
  it('reports changed, added nodes and added edges', () => {
    const next: Graph = {
      nodes: [
        { id: 'n1', title: 'A', status: 'draft' },
        { id: 'n2', title: 'B2', status: 'draft' },
        { id: 'n3', title: 'C', status: 'draft' },
      ],
      edges: [{ id: 'e9', from: 'n2', to: 'n3', type: 'flow' }],
      notes: [],
    }
    const d = diffGraphs(prev, next)
    expect(d.changedNodes).toEqual(['n2'])
    expect(d.addedNodes).toEqual(['n3'])
    expect(d.addedEdges).toEqual(['e9'])
    expect(d.removedNodes).toEqual([])
    expect(diffToText(d, next, prev)).toContain('n3')
  })

  it('prints (không đổi) for an empty diff', () => {
    expect(diffToText(diffGraphs(prev, prev), prev, prev)).toBe('(không đổi)')
  })
})
