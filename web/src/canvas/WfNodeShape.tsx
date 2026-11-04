import {
  BaseFrameLikeShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  useValue,
  type Editor,
  type RecordProps,
  type TLShape,
  type TLShapePartial,
} from 'tldraw'
import { WF_NODE } from './storeToGraph'

export const KIND_COLORS: Record<string, { fill: string; stroke: string }> = {
  code: { fill: '#e8f0fe', stroke: '#4a6fa5' },
  llm: { fill: '#e6f4ea', stroke: '#3c8d5a' },
  agent: { fill: '#f3e8fd', stroke: '#8a5cc2' },
  human: { fill: '#fff4e0', stroke: '#d08a1e' },
  unknown: { fill: '#ffffff', stroke: '#444444' },
}
export const GHOST = { fill: '#f3eeff', stroke: '#7c4dff' }

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    [WF_NODE]: WfNodeProps
  }
}

export interface WfNodeProps {
  w: number
  h: number
  title: string
  kind: 'agent' | 'llm' | 'code' | 'human' | 'unknown'
  inputs: string
  outputs: string
  description: string
  container: boolean
  inputSchema?: string
  outputSchema?: string
}
export type WfNodeShape = TLShape<typeof WF_NODE>

/** Kích thước chữ tiêu đề, dùng chung cho hiển thị và đo. */
const TITLE = { fontSize: 15, lineHeight: 1.3, fontWeight: '600', fontFamily: 'system-ui, sans-serif' }
const PAD_X = 12
const PAD_Y = 10
export const MIN_H = 56
/** Khoảng trống quanh các ô con bên trong khung. */
const FRAME_PAD = 20

/** Chiều cao phần tiêu đề (đã xuống dòng theo bề rộng ô). */
export function titleHeight(editor: Editor, title: string, w: number): number {
  const m = editor.textMeasure.measureText(title || ' ', {
    ...TITLE,
    fontStyle: 'normal',
    maxWidth: Math.max(40, w - PAD_X * 2 - 44), // chừa chỗ cho nhãn kind
    padding: '0px',
  })
  return Math.ceil(m.h)
}

export class WfNodeShapeUtil extends BaseFrameLikeShapeUtil<WfNodeShape> {
  static override type = WF_NODE
  static override props: RecordProps<WfNodeShape> = {
    w: T.number,
    h: T.number,
    title: T.string,
    kind: T.literalEnum('agent', 'llm', 'code', 'human', 'unknown'),
    inputs: T.string,
    outputs: T.string,
    description: T.string,
    container: T.boolean,
    inputSchema: T.string.optional(),
    outputSchema: T.string.optional(),
  }

  override getDefaultProps(): WfNodeProps {
    return { w: 200, h: MIN_H, title: 'Bước mới', kind: 'unknown', inputs: '', outputs: '', description: '', container: false }
  }

  override isFrameLike(shape: WfNodeShape) {
    return shape.props.container
  }
  override providesBackgroundForChildren() {
    return false
  }
  override canReceiveNewChildrenOfType(shape: WfNodeShape, type: string) {
    return shape.props.container && type === WF_NODE && !shape.isLocked
  }
  override shouldClipChild() {
    return false
  }
  override canEdit() {
    return true
  }
  override canBind() {
    return true
  }

  /** Ô thường: cao vừa đủ cho tiêu đề. Khung: không nhỏ hơn phần chứa các ô con. */
  private fit(shape: WfNodeShape): WfNodeShape {
    const head = titleHeight(this.editor, shape.props.title, shape.props.w) + PAD_Y * 2
    let { w, h } = shape.props
    if (!shape.props.container) h = Math.max(MIN_H, head)
    else {
      h = Math.max(h, head + FRAME_PAD)
      for (const id of this.editor.getSortedChildIdsForParent(shape.id)) {
        const c = this.editor.getShape(id)
        if (!c || c.type !== WF_NODE) continue
        const cp = c.props as WfNodeProps
        w = Math.max(w, c.x + cp.w + FRAME_PAD)
        h = Math.max(h, c.y + cp.h + FRAME_PAD)
      }
    }
    return w === shape.props.w && h === shape.props.h ? shape : { ...shape, props: { ...shape.props, w, h } }
  }

  override onBeforeCreate(next: WfNodeShape) {
    return this.fit(next)
  }
  override onBeforeUpdate(_prev: WfNodeShape, next: WfNodeShape) {
    return this.fit(next)
  }

  /** Ô con di chuyển hoặc to ra thì khung nới theo, không để ô con tràn ra ngoài viền. */
  override onChildrenChange(shape: WfNodeShape): TLShapePartial[] | void {
    if (!shape.props.container) return
    const fitted = this.fit(shape)
    if (fitted !== shape) return [{ id: shape.id, type: WF_NODE, props: { w: fitted.props.w, h: fitted.props.h } }]
  }

  override component(shape: WfNodeShape) {
    return <WfNode shape={shape} />
  }

  override getIndicatorPath(shape: WfNodeShape) {
    const p = new Path2D()
    p.roundRect(0, 0, shape.props.w, shape.props.h, 8)
    return p
  }
}

/** Bề rộng để tiêu đề khung nằm trên một dòng (kèm nhãn kind), tối đa 520px. */
export function frameTitleWidth(editor: Editor, title: string): number {
  const m = editor.textMeasure.measureText(title || ' ', { ...TITLE, fontStyle: 'normal', maxWidth: null, padding: '0px' })
  return Math.min(520, Math.ceil(m.w) + PAD_X * 2 + 52)
}

/** Vị trí đầu tiên cho ô con trong khung: ngay dưới tiêu đề của khung. */
export function frameContentTop(editor: Editor, frame: WfNodeShape) {
  return titleHeight(editor, frame.props.title, frame.props.w) + PAD_Y * 2
}

function WfNode({ shape }: { shape: WfNodeShape }) {
  const editor = useEditor()
  const editing = useValue('editing', () => editor.getEditingShapeId() === shape.id, [editor, shape.id])
  const p = shape.props
  const ghost = !!shape.meta.ghost
  const pending = !!shape.meta.pendingOp
  const c = ghost ? GHOST : KIND_COLORS[p.kind] ?? KIND_COLORS.unknown

  return (
    <HTMLContainer
      style={{
        width: p.w,
        height: p.h,
        background: p.container ? (ghost ? '#faf7ff' : 'rgba(255,255,255,0.55)') : c.fill,
        border: `${pending ? 3 : 1.5}px ${ghost ? 'dashed' : 'solid'} ${pending ? '#ff8f00' : c.stroke}`,
        borderRadius: 8,
        opacity: ghost ? 0.85 : 1,
        padding: `${PAD_Y}px ${PAD_X}px`,
        boxSizing: 'border-box',
        color: ghost ? '#5a2fd6' : '#1a1a1a',
        pointerEvents: 'all',
        display: 'flex',
        alignItems: p.container ? 'flex-start' : 'center',
        gap: 6,
        overflow: 'hidden',
      }}
    >
      {editing ? (
        <input
          autoFocus
          defaultValue={p.title}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') editor.setEditingShape(null)
            e.stopPropagation()
          }}
          onBlur={() => editor.setEditingShape(null)}
          onChange={(e) =>
            editor.updateShape<WfNodeShape>({ id: shape.id, type: WF_NODE, props: { title: e.currentTarget.value } })
          }
          style={{ ...TITLE, width: '100%' }}
        />
      ) : (
        <div style={{ ...TITLE, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{p.title}</div>
      )}
      {p.kind !== 'unknown' && (
        <span style={{ fontSize: 11, color: c.stroke, border: `1px solid ${c.stroke}`, borderRadius: 4, padding: '0 4px', flexShrink: 0 }}>
          {p.kind}
        </span>
      )}
    </HTMLContainer>
  )
}
