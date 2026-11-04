import {
  BaseFrameLikeShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  useValue,
  type RecordProps,
  type TLShape,
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
}
export type WfNodeShape = TLShape<typeof WF_NODE>

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
  }

  override getDefaultProps(): WfNodeProps {
    return { w: 200, h: 72, title: 'Bước mới', kind: 'unknown', inputs: '', outputs: '', description: '', container: false }
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

  override component(shape: WfNodeShape) {
    return <WfNode shape={shape} />
  }

  override getIndicatorPath(shape: WfNodeShape) {
    const p = new Path2D()
    p.roundRect(0, 0, shape.props.w, shape.props.h, 8)
    return p
  }
}

function WfNode({ shape }: { shape: WfNodeShape }) {
  const editor = useEditor()
  const editing = useValue('editing', () => editor.getEditingShapeId() === shape.id, [editor, shape.id])
  const p = shape.props
  const ghost = !!shape.meta.ghost
  const pending = !!shape.meta.pendingOp
  const c = ghost ? GHOST : KIND_COLORS[p.kind] ?? KIND_COLORS.unknown
  const io = [p.inputs && `in: ${p.inputs}`, p.outputs && `out: ${p.outputs}`].filter(Boolean).join('  →  ')

  return (
    <HTMLContainer
      style={{
        width: p.w,
        height: p.h,
        background: p.container ? (ghost ? '#faf7ff' : 'rgba(255,255,255,0.6)') : c.fill,
        border: `${pending ? 3 : 1.5}px ${ghost ? 'dashed' : 'solid'} ${pending ? '#ff8f00' : c.stroke}`,
        borderRadius: 8,
        opacity: ghost ? 0.85 : 1,
        padding: '6px 10px',
        boxSizing: 'border-box',
        fontFamily: 'system-ui, sans-serif',
        color: ghost ? '#5a2fd6' : '#1a1a1a',
        pointerEvents: 'all',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: p.container ? 'flex-start' : 'center',
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
          style={{ font: 'inherit', fontWeight: 600, fontSize: 15, width: '100%' }}
        />
      ) : (
        <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.25 }}>
          {p.title}
          {p.kind !== 'unknown' && (
            <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6, color: c.stroke }}>{p.kind}</span>
          )}
        </div>
      )}
      {io && <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>{io}</div>}
    </HTMLContainer>
  )
}
