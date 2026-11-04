import { tidy, type Box } from '@lc/shared'
import type { Editor, TLShapeId } from 'tldraw'
import { graphId, WF_NODE } from './storeToGraph'
import { frameContentTop, type WfNodeShape } from './WfNodeShape'
import { currentGraph } from '../proposal/useProposal'

const sid = (id: string) => `shape:${id}` as TLShapeId
const FRAME_PAD = 20

/** Box (tọa độ trang) của mọi ô workflow thật, kể cả ô con trong khung. */
export function pageBoxes(editor: Editor): Record<string, Box> {
  const out: Record<string, Box> = {}
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== WF_NODE || s.meta.ghost) continue
    const b = editor.getShapePageBounds(s.id)
    if (b) out[graphId(s.id)] = { x: b.x, y: b.y, w: b.w, h: b.h }
  }
  return out
}

export interface TidyPreview {
  markId: string
  scope: string | null
  label: string
}

/** Xếp lại một phạm vi (không đệ quy). Trả về độ dịch của từng ô đã xếp. */
function tidyOne(editor: Editor, scope: string | null): Map<string, { dx: number; dy: number }> {
  const boxes = pageBoxes(editor)
  const frame = scope ? (editor.getShape(sid(scope)) as WfNodeShape | undefined) : undefined
  const target = tidy(currentGraph(editor), boxes, scope, {
    headerH: frame ? frameContentTop(editor, frame) : undefined,
    gapX: scope ? 80 : 120,
  })
  const moved = new Map<string, { dx: number; dy: number }>()
  for (const [id, b] of Object.entries(target)) {
    const s = editor.getShape(sid(id))!
    const parentBox = s.parentId === editor.getCurrentPageId() ? { x: 0, y: 0 } : editor.getShapePageBounds(s.parentId as TLShapeId)!
    moved.set(id, { dx: b.x - boxes[id].x, dy: b.y - boxes[id].y })
    editor.updateShape({ id: s.id, type: s.type, x: b.x - parentBox.x, y: b.y - parentBox.y } as any)
  }
  // Khung được xếp lại thì co/giãn vừa khít phần chứa mới.
  if (frame && Object.keys(target).length) {
    const fb = editor.getShapePageBounds(frame.id)!
    const kids = Object.values(target)
    const w = Math.max(...kids.map((k) => k.x + k.w)) - fb.x + FRAME_PAD
    const h = Math.max(...kids.map((k) => k.y + k.h)) - fb.y + FRAME_PAD
    editor.updateShape({ id: frame.id, type: WF_NODE, props: { w, h } } as any)
  }
  return moved
}

/** Các khung con (đệ quy) của `scope`, khung sâu nhất trước. */
function framesInside(editor: Editor, scope: string | null): string[] {
  const out: string[] = []
  const walk = (parent: TLShapeId | string) => {
    for (const id of editor.getSortedChildIdsForParent(parent as TLShapeId)) {
      const s = editor.getShape(id)
      if (s?.type !== WF_NODE || s.meta.ghost || !(s.props as any).container) continue
      walk(s.id)
      out.push(graphId(s.id))
    }
  }
  walk(scope ? sid(scope) : editor.getCurrentPageId())
  return out
}

/**
 * Sắp xếp lại `scope` ngay trên canvas sau một mốc lịch sử, để Bỏ = quay về mốc,
 * Giữ = để nguyên (cả lần sắp xếp là một mục undo). Xếp từ khung trong cùng ra ngoài,
 * vì kích thước khung trong quyết định chỗ của nó ở tầng ngoài.
 */
export function startTidy(editor: Editor, scope: string | null): TidyPreview | null {
  const before = JSON.stringify(pageBoxes(editor))
  const markId = editor.markHistoryStoppingPoint('tidy')
  editor.run(() => {
    const boxesBefore = pageBoxes(editor)
    for (const f of framesInside(editor, scope)) tidyOne(editor, f)
    tidyOne(editor, scope)
    // Note ghim vào ô đi theo ô.
    const after = pageBoxes(editor)
    for (const s of editor.getCurrentPageShapes()) {
      if (s.type !== 'note' || s.parentId !== editor.getCurrentPageId()) continue
      const t = (s.meta.targetIds as string[] | undefined)?.[0] ?? ''
      if (!boxesBefore[t] || !after[t]) continue
      const dx = after[t].x - boxesBefore[t].x
      const dy = after[t].y - boxesBefore[t].y
      if (dx || dy) editor.updateShape({ id: s.id, type: 'note', x: s.x + dx, y: s.y + dy } as any)
    }
  })
  if (JSON.stringify(pageBoxes(editor)) === before) {
    editor.bailToMark(markId)
    return null
  }
  const frame = scope ? (editor.getShape(sid(scope)) as WfNodeShape | undefined) : undefined
  return { markId, scope, label: frame ? `khung “${frame.props.title}”` : 'cả sơ đồ' }
}

export function rejectTidy(editor: Editor, p: TidyPreview) {
  editor.bailToMark(p.markId)
}

/** Phạm vi sắp xếp theo lựa chọn hiện tại: khung đang chọn, khung chứa ô đang chọn, hoặc cả trang. */
export function tidyScopeForSelection(editor: Editor): string | null {
  const sel = editor.getSelectedShapes().filter((s) => s.type === WF_NODE)
  if (sel.length !== 1) return null
  const s = sel[0] as WfNodeShape
  if (s.props.container) return graphId(s.id)
  const p = editor.getShape(s.parentId as TLShapeId)
  return p?.type === WF_NODE ? graphId(p.id) : null
}
