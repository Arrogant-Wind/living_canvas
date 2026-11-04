import type { Graph } from '@lc/shared'
import type { AskResult } from '../src/orchestrator'

export interface EvalCase {
  id: string
  graph: Graph
  selection: string[]
  message: string
  /** null = đạt; chuỗi = lý do trượt. */
  check: (r: AskResult) => string | null
}

const node = (id: string, title: string, extra = {}) => ({ id, title, status: 'draft' as const, ...extra })
const flow = (id: string, from: string, to: string, label?: string) => ({ id, from, to, type: 'flow' as const, ...(label && { label }) })

const video: Graph = {
  nodes: [
    node('n1', 'Tìm hiểu dữ kiện', { outputs: ['dữ kiện'] }),
    node('n2', 'Chuẩn hóa', { inputs: ['dữ kiện'], outputs: ['mốc + địa điểm'] }),
    node('n3', 'Tạo map', { outputs: ['bản đồ'] }),
    node('n4', 'Generate bằng API', { outputs: ['video'] }),
  ],
  edges: [flow('e1', 'n1', 'n2', 'dữ kiện'), flow('e2', 'n2', 'n3'), flow('e3', 'n3', 'n4')],
  notes: [],
}

const count = (r: AskResult, op: string) => r.ops.filter((o) => o.op === op).length

export const cases: EvalCase[] = [
  {
    id: 'mismatch',
    graph: {
      nodes: [node('n1', 'Tạo map', { outputs: ['bản đồ'] }), node('n2', 'Generate bằng API')],
      edges: [flow('e1', 'n1', 'n2')],
      notes: [],
    },
    selection: [],
    message: '/review',
    check: (r) =>
      r.ops.some((o) => o.op === 'add_note' && o.kind === 'review' && /prompt/i.test(o.text))
        ? null
        : 'không có note review nào nhắc tới "prompt"',
  },
  {
    id: 'expand-video',
    graph: video,
    selection: ['n4'],
    message: '/expand video lịch sử cần nhân vật, bối cảnh, nhịp độ, B-roll',
    check: (r) =>
      count(r, 'add_node') < 3
        ? `chỉ có ${count(r, 'add_node')} add_node`
        : r.dropped.length
          ? `${r.dropped.length} op không hợp lệ sau khi sửa`
          : null,
  },
  {
    id: 'containment',
    graph: {
      nodes: [node('n1', 'Tìm hiểu dữ kiện'), node('n2', 'Chuẩn hóa'), node('n5', 'Nhân vật'), node('n6', 'Bối cảnh')],
      edges: [flow('e1', 'n1', 'n2'), flow('e2', 'n1', 'n5'), flow('e3', 'n1', 'n6')],
      notes: [{ id: 'c1', text: 'Nhân vật, bối cảnh thuộc bước chuẩn hóa, không song song', author: 'user', targetIds: ['n5', 'n6'], kind: 'comment' }],
    },
    selection: ['n5', 'n6'],
    message: 'Nhân vật, bối cảnh thuộc bước chuẩn hóa chứ không song song với nó. Sửa giúp.',
    check: (r) => {
      const moved = r.ops.filter((o) => o.op === 'set_parent' && o.parent === 'n2').map((o) => (o as any).id)
      return moved.includes('n5') && moved.includes('n6') ? null : `set_parent vào n2: [${moved.join(', ')}]`
    },
  },
  {
    id: 'insert-between',
    graph: video,
    selection: ['n3', 'n4'],
    message: 'Generate cần prompt. Chèn một bước gom cảnh thành prompt vào giữa Tạo map và Generate.',
    check: (r) => {
      if (count(r, 'add_node') < 1) return 'không thêm bước'
      if (!r.ops.some((o) => o.op === 'delete_edge' && o.id === 'e3')) return 'không xóa cạnh cũ e3'
      return r.dropped.length ? `${r.dropped.length} op lỗi` : null
    },
  },
  {
    id: 'explain-noop',
    graph: video,
    selection: ['n2'],
    message: '/explain',
    check: (r) => (r.ops.length ? `explain mà vẫn có ${r.ops.length} op` : r.reply.trim() ? null : 'reply rỗng'),
  },
  {
    id: 'noop-chat',
    graph: video,
    selection: [],
    message: 'chào bạn',
    check: (r) => (r.ops.length ? `có ${r.ops.length} op` : r.reply.trim() ? null : 'reply rỗng'),
  },
]
