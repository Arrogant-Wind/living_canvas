import { elkTidy, overlaps, type Box } from '@lc/shared'
import type { Editor, TLShapeId } from 'tldraw'
import { graphId, WF_NODE } from './storeToGraph'
import { frameContentTop, frameTitleWidth, type WfNodeShape } from './WfNodeShape'
import { currentGraph } from '../proposal/useProposal'

const sid = (id: string) => `shape:${id}` as TLShapeId
const FRAME_ASPECT = 2.5

function viewportAspect(editor: Editor) {
  const v = editor.getViewportScreenBounds()
  // Tab chạy nền có thể báo khung nhìn 1×1: khi đó dùng tỉ lệ màn hình phổ biến.
  return v.w >= 200 && v.h >= 200 ? v.w / v.h : 16 / 9
}

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

/** Box nhãn của từng mũi tên giữa hai ô (theo edge id), đo từ hình học tldraw đang hiển thị. */
export function labelBoxes(editor: Editor): Record<string, Box> {
  const out: Record<string, Box> = {}
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== 'arrow' || s.meta.ghost) continue
    const geo = editor.getShapeGeometry(s.id) as any
    const label = (geo.children ?? []).find((c: any) => c.isLabel)
    if (!label) continue
    const b = label.getBounds()
    const t = editor.getShapePageTransform(s.id)
    const p0 = t.applyToPoint({ x: b.x, y: b.y })
    const p1 = t.applyToPoint({ x: b.x + b.w, y: b.y + b.h })
    out[graphId(s.id)] = { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y) }
  }
  return out
}

/** Box của note ở cấp trang. */
export function noteBoxes(editor: Editor): Record<string, Box> {
  const out: Record<string, Box> = {}
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== 'note' || s.meta.ghost || s.parentId !== editor.getCurrentPageId()) continue
    const b = editor.getShapePageBounds(s.id)
    if (b) out[graphId(s.id)] = { x: b.x, y: b.y, w: b.w, h: b.h }
  }
  return out
}

/** Chiều rộng nhãn khi viết trên một dòng (cỡ chữ nhãn mũi tên size "s"), tối đa 260px. */
export const MAX_LABEL_W = 260
export function labelWidths(editor: Editor): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of currentGraph(editor).edges) {
    if (!e.label) continue
    const m = editor.textMeasure.measureText(e.label, {
      fontFamily: 'var(--tl-font-sans)',
      fontSize: 18,
      lineHeight: 1.35,
      fontWeight: 'normal',
      fontStyle: 'normal',
      maxWidth: null,
      padding: '0px',
    })
    out[e.id] = Math.min(MAX_LABEL_W, Math.ceil(m.w) + 16)
  }
  return out
}

export interface TidyPreview {
  markId: string
  scope: string | null
  label: string
}

/** Cờ cho handler "đẩy ô bên cạnh" biết đang áp bố cục ELK (ELK đã chừa chỗ, không đẩy nữa). */
export let isApplyingLayout = false

/** Áp box (tọa độ trang) do ELK tính: vị trí trước (theo cha mới), kích thước khung sau. */
function applyLayout(editor: Editor, target: Record<string, Box>) {
  const pageOf = (id: TLShapeId): { x: number; y: number } => {
    const g = graphId(id)
    return target[g] ?? editor.getShapePageBounds(id)!
  }
  for (const [id, b] of Object.entries(target)) {
    const s = editor.getShape(sid(id))
    if (!s) continue
    const p = s.parentId === editor.getCurrentPageId() ? { x: 0, y: 0 } : pageOf(s.parentId as TLShapeId)
    editor.updateShape({ id: s.id, type: s.type, x: b.x - p.x, y: b.y - p.y } as any)
  }
  for (const [id, b] of Object.entries(target)) {
    const s = editor.getShape(sid(id))
    if (s?.type === WF_NODE && (s.props as any).container) editor.updateShape({ id: s.id, type: WF_NODE, props: { w: b.w, h: b.h } } as any)
  }
}

/** Ô thành viên (theo `band`) chứa ô `id`, hoặc chính nó. */
function memberOf(editor: Editor, id: TLShapeId, band: Record<string, number>): string | null {
  for (let s = editor.getShape(id); s; s = editor.getShape(s.parentId as TLShapeId)) {
    if (graphId(s.id) in band) return graphId(s.id)
    if (s.parentId === editor.getCurrentPageId()) break
  }
  return null
}

/**
 * Mũi tên nối sang hàng khác (sau khi xuống dòng) bám vào cạnh trên của ô đích, để nó đi thẳng
 * xuống thay vì vòng vào cạnh bên và chạy trùng với mũi tên đi ra từ cạnh đó. Mũi tên trong
 * cùng hàng trả về điểm bám giữa như mặc định.
 */
function setRowChangeAnchors(editor: Editor, band: Record<string, number>) {
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== 'arrow') continue
    const bs = editor.getBindingsFromShape(s.id, 'arrow')
    const start = bs.find((b) => (b.props as any).terminal === 'start')
    const end = bs.find((b) => (b.props as any).terminal === 'end')
    if (!start || !end) continue
    const a = memberOf(editor, start.toId, band)
    const b = memberOf(editor, end.toId, band)
    if (!a || !b || a === b) continue
    const crossRow = band[a] >= 0 && band[b] >= 0 && band[a] !== band[b]
    const p = end.props as any
    const want = crossRow
      ? { normalizedAnchor: { x: 0.5, y: band[b] > band[a] ? 0 : 1 }, isPrecise: true }
      : { normalizedAnchor: { x: 0.5, y: 0.5 }, isPrecise: false }
    if (p.isPrecise === want.isPrecise && p.normalizedAnchor.x === want.normalizedAnchor.x && p.normalizedAnchor.y === want.normalizedAnchor.y) continue
    editor.updateBinding({ ...end, props: { ...p, ...want } } as any)
  }
}

/** Các đoạn thẳng của mũi tên đang vẽ (tọa độ trang), làm "vật cản" mỏng cho việc đặt note. */
function arrowSegmentBoxes(editor: Editor): Box[] {
  const out: Box[] = []
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== 'arrow') continue
    const geo = editor.getShapeGeometry(s.id) as any
    const line = geo.children?.find((c: any) => !c.isLabel) ?? geo
    const t = editor.getShapePageTransform(s.id)
    const pts = (line.vertices ?? []).map((v: any) => t.applyToPoint(v))
    for (let i = 1; i < pts.length; i++) {
      const [p, q] = [pts[i - 1], pts[i]]
      out.push({ x: Math.min(p.x, q.x) - 4, y: Math.min(p.y, q.y) - 4, w: Math.abs(q.x - p.x) + 8, h: Math.abs(q.y - p.y) + 8 })
    }
  }
  return out
}

/**
 * Note ghim vào ô: đặt phía trên ô đích, dời sang phải tới khi không đè lên ô, note
 * khác hay nhãn mũi tên. Note không ghim vào ô nào thì để nguyên.
 */
function placePinnedNotes(editor: Editor) {
  const blockers: Box[] = [...Object.values(pageBoxes(editor)), ...Object.values(labelBoxes(editor)), ...arrowSegmentBoxes(editor)]
  const nodes = pageBoxes(editor)
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== 'note' || s.parentId !== editor.getCurrentPageId()) continue
    const t = nodes[(s.meta.targetIds as string[] | undefined)?.[0] ?? '']
    const nb = editor.getShapePageBounds(s.id)
    if (!t || !nb) continue
    // Thử dời sang phải từng 40px; sau mỗi 8 lần chưa được thì nhấc lên cao thêm 60px.
    const base = { x: t.x, y: t.y - nb.h - 40, w: nb.w, h: nb.h }
    let box = base
    for (let i = 0; i < 160 && blockers.some((b) => overlaps(box, b, 12)); i++)
      box = { ...base, x: base.x + ((i + 1) % 8) * 40, y: base.y - Math.floor((i + 1) / 8) * 60 }
    blockers.push(box)
    editor.updateShape({ id: s.id, type: 'note', x: box.x, y: box.y } as any)
  }
}

/**
 * Với mọi khung: bề rộng tối thiểu để tiêu đề nằm trên một dòng, và chiều cao tiêu đề ở bề rộng
 * đó (ô con bắt đầu bên dưới phần này).
 */
function frameHeaders(editor: Editor): { headerH: Record<string, number>; minW: Record<string, number> } {
  const headerH: Record<string, number> = {}
  const minW: Record<string, number> = {}
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== WF_NODE || !(s.props as any).container) continue
    const f = s as WfNodeShape
    const w = frameTitleWidth(editor, f.props.title)
    minW[graphId(s.id)] = w
    headerH[graphId(s.id)] = frameContentTop(editor, { ...f, props: { ...f.props, w } })
  }
  return { headerH, minW }
}

/**
 * Sắp xếp lại `scope` bằng ELK. Tính bố cục trước (bất đồng bộ), rồi áp lên canvas sau một mốc
 * lịch sử, để Hoàn tác = quay về mốc, Giữ = để nguyên (cả lần sắp xếp là một mục undo).
 */
export async function startTidy(editor: Editor, scope: string | null): Promise<TidyPreview | null> {
  const { boxes: target, band } = await elkTidy(currentGraph(editor), pageBoxes(editor), scope, {
    ...frameHeaders(editor),
    gapX: scope ? 80 : 120,
    labelW: labelWidths(editor),
    // Luồng dài thì xuống hàng: cả trang theo tỉ lệ khung nhìn, trong khung thì dẹt hơn một chút.
    aspect: scope ? FRAME_ASPECT : viewportAspect(editor),
  })
  if (!Object.keys(target).length) return null

  const before = layoutSignature(editor)
  const markId = editor.markHistoryStoppingPoint('tidy')
  isApplyingLayout = true
  try {
    editor.run(() => {
      applyLayout(editor, target)
      setRowChangeAnchors(editor, band)
      if (!scope) placePinnedNotes(editor)
    })
  } finally {
    isApplyingLayout = false
  }
  if (layoutSignature(editor) === before) {
    editor.bailToMark(markId)
    return null
  }
  const frame = scope ? (editor.getShape(sid(scope)) as WfNodeShape | undefined) : undefined
  return { markId, scope, label: frame ? `khung “${frame.props.title}”` : 'cả sơ đồ' }
}

/** Vị trí/kích thước mọi shape và điểm bám mũi tên: để biết lần sắp xếp có đổi gì không. */
function layoutSignature(editor: Editor): string {
  const shapes = editor.getCurrentPageShapes().map((s) => [s.id, Math.round(s.x), Math.round(s.y), (s.props as any).w, (s.props as any).h])
  const binds = editor
    .getCurrentPageShapes()
    .filter((s) => s.type === 'arrow')
    .flatMap((s) => editor.getBindingsFromShape(s.id, 'arrow').map((b) => [b.id, JSON.stringify((b.props as any).normalizedAnchor), (b.props as any).isPrecise]))
  return JSON.stringify([shapes, binds])
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
