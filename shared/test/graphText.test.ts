import { describe, expect, it } from 'vitest'
import { graphToText, refToText } from '../src/graphText'
import { historyGraph } from './fixtures'

describe('graphToText', () => {
  it('renders nodes, children, edges and notes in the fixed format', () => {
    expect(graphToText(historyGraph())).toBe(
      [
        'NODES',
        'n1 | Tìm hiểu dữ kiện | kind=agent | in: sự kiện | out: dữ kiện',
        'n2 | Chuẩn hóa | kind=? | in: dữ kiện | out: mốc + địa điểm',
        '  n5 | Nhân vật | kind=? | parent=n2',
        'n3 | Tạo map | kind=code',
        'n4 | Generate bằng API | kind=?',
        'EDGES',
        'e1: n1 -[dữ kiện]-> n2',
        'e2: n2 --> n3',
        'e3: n3 --> n4',
        'e4: n1 ..[facts]..> n3        (data edge)',
        'NOTES',
        'c1 (user, comment) on n4: "bước này còn mơ hồ quá"',
      ].join('\n'),
    )
  })

  it('prints schemas on one line so the line format survives', () => {
    const t = graphToText({
      nodes: [{ id: 'n1', title: 'A', outputSchema: '{\n  "type": "object"\n}', status: 'draft' }],
      edges: [],
      notes: [],
    })
    expect(t).toContain('n1 | A | kind=? | out_schema: { "type": "object" }')
  })

  it('marks an empty graph', () => {
    expect(graphToText({ nodes: [], edges: [], notes: [] })).toContain('NODES\n(trống)')
  })
})

describe('refToText', () => {
  it('prints the group with children of frames, inner edges, boundary edges and notes', () => {
    expect(refToText(historyGraph(), ['n2', 'n3'])).toBe(
      [
        'NODES TRONG NHÓM',
        'n2 | Chuẩn hóa | kind=? | in: dữ kiện | out: mốc + địa điểm',
        '  n5 | Nhân vật | kind=? | parent=n2',
        'n3 | Tạo map | kind=code',
        'CẠNH TRONG NHÓM',
        'e2: n2 --> n3',
        'CẠNH VÀO / RA NHÓM',
        'e1: n1 -[dữ kiện]-> n2',
        'e3: n3 --> n4',
        'e4: n1 ..[facts]..> n3        (data edge)',
      ].join('\n'),
    )
  })

  it('includes notes pinned to the group and skips unknown ids', () => {
    const t = refToText(historyGraph(), ['n4', 'zzz'])
    expect(t).toContain('n4 | Generate bằng API')
    expect(t).toContain('NOTES\nc1 (user, comment) on n4: "bước này còn mơ hồ quá"')
    expect(t).not.toContain('zzz')
  })

  it('returns empty text when nothing is attached', () => {
    expect(refToText(historyGraph(), [])).toBe('')
  })
})
