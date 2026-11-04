import { useCallback, useEffect, useRef, useState } from 'react'
import { pushAside, type Box, type Graph } from '@lc/shared'
import {
  ArrowBindingUtil,
  ArrowShapeKindStyle,
  Tldraw,
  useValue,
  type BindingOnShapeDeleteOptions,
  type Editor,
  type TLArrowBinding,
  type TLShapeId,
} from 'tldraw'
import { api, type ChatMsg } from './api'
import { createAutosaver, type SaveStatus } from './autosave'
import { graphId, WF_NODE } from './canvas/storeToGraph'
import { WfNodeShapeUtil } from './canvas/WfNodeShape'
import { currentGraph, useProposal } from './proposal/useProposal'
import { ChatPanel } from './ui/ChatPanel'
import { ProposalBar } from './ui/ProposalBar'
import { HoverCard } from './ui/HoverCard'
import { Toolbar } from './ui/Toolbar'

const shapeUtils = [WfNodeShapeUtil]

/** Xóa ô thì xóa luôn mũi tên nối vào nó, không để mũi tên lơ lửng. */
class WfArrowBindingUtil extends ArrowBindingUtil {
  override onBeforeDeleteToShape({ binding, shape }: BindingOnShapeDeleteOptions<TLArrowBinding>) {
    if (shape.type === WF_NODE && this.editor.getShape(binding.fromId)) this.editor.deleteShapes([binding.fromId])
  }
}
const bindingUtils = [WfArrowBindingUtil]

function Overlay() {
  return (
    <>
      <Toolbar />
      <HoverCard />
    </>
  )
}
// Bảng style mặc định của tldraw che góc phải canvas mà workflow không cần.
const components = { InFrontOfTheCanvas: Overlay, StylePanel: null }

/** Quy ước riêng của canvas workflow. */
function setupWorkflowCanvas(editor: Editor) {
  // Mũi tên người dùng vẽ cũng là mũi tên gấp khúc bám vào cạnh ô, như mũi tên AI tạo.
  editor.setStyleForNextShapes(ArrowShapeKindStyle, 'elbow')
  // Khung (ở cấp trang) to ra thì đẩy các ô bên phải / bên dưới ra, không để khung đè lên chúng.
  editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
    if (next.type !== WF_NODE || next.parentId !== editor.getCurrentPageId() || !(next.props as any).container) return
    const a = prev.props as any
    const b = next.props as any
    if (b.w <= a.w && b.h <= a.h) return
    const boxes: Record<string, Box> = {}
    for (const s of editor.getCurrentPageShapes()) {
      if (s.parentId !== editor.getCurrentPageId() || s.type === 'arrow') continue
      const bb = editor.getShapePageBounds(s.id)
      if (bb) boxes[s.id] = { x: bb.x, y: bb.y, w: bb.w, h: bb.h }
    }
    boxes[next.id] = { x: next.x, y: next.y, w: b.w, h: b.h }
    const shift = pushAside(boxes, next.id, { x: prev.x, y: prev.y, w: a.w, h: a.h })
    const updates = Object.entries(shift).map(([id, d]) => {
      const s = editor.getShape(id as TLShapeId)!
      return { id: s.id, type: s.type, x: s.x + d.dx, y: s.y + d.dy }
    })
    if (updates.length) editor.updateShapes(updates as any)
  })
}
const project = new URLSearchParams(location.search).get('p') ?? 'demo'

/** Snapshot cũ có thể còn ghost (lưu khi đang chờ duyệt): xóa đi khi mở lại. */
function stripGhosts(editor: Editor) {
  editor.run(
    () => {
      const shapes = editor.getCurrentPageShapes()
      editor.deleteShapes(shapes.filter((s) => s.meta.ghost).map((s) => s.id))
      for (const s of shapes)
        if (s.meta.pendingOp) editor.updateShape({ id: s.id, type: s.type, meta: { pendingOp: null } } as any)
    },
    { history: 'ignore' },
  )
}

export function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('pending')
  const prevGraph = useRef<Graph | undefined>(undefined)
  const { proposal, propose, accept, reject } = useProposal(editor)

  // Tải project, rồi tự lưu (debounce 800ms, thử lại mỗi 5s khi lỗi, lưu ngay khi đóng tab).
  useEffect(() => {
    if (!editor) return
    let stop: (() => void) | undefined
    let alive = true
    const saver = createAutosaver({
      save: (doc: unknown) => api.saveCanvas(project, doc),
      delayMs: 800,
      retryMs: 5000,
      onStatus: setSaveStatus,
    })
    const flush = () => saver.flush()
    ;(async () => {
      const [{ snapshot }, { messages }] = await Promise.all([api.loadCanvas(project), api.loadChat(project)])
      if (!alive) return
      if (snapshot) editor.loadSnapshot({ document: snapshot as any })
      stripGhosts(editor)
      setMessages(messages)
      setSaveStatus('saved')
      stop = editor.store.listen(() => saver.schedule(() => editor.getSnapshot().document), { scope: 'document' })
      window.addEventListener('pagehide', flush)
    })().catch((e) => {
      // Không tải được thì khóa canvas: lưu lúc này sẽ ghi đè dữ liệu thật bằng canvas trống.
      editor.updateInstanceState({ isReadonly: true })
      setSaveStatus('error')
      setMessages([{ role: 'error', text: `Không tải được project (${e.message}). Canvas đang khóa, tải lại trang để thử lại.` }])
    })
    return () => {
      alive = false
      stop?.()
      saver.flush()
      saver.dispose()
      window.removeEventListener('pagehide', flush)
    }
  }, [editor])

  const selection = useValue(
    'selection',
    () =>
      editor
        ? editor
            .getSelectedShapes()
            .filter((s) => s.type === WF_NODE && !s.meta.ghost)
            .map((s) => ({ id: graphId(s.id), title: (s.props as any).title as string }))
        : [],
    [editor],
  )

  const send = useCallback(
    async (text: string) => {
      if (!editor) return
      reject()
      setMessages((m) => [...m, { role: 'user', text }])
      setBusy(true)
      const graph = currentGraph(editor)
      try {
        const r = await api.ask(project, { graph, prevGraph: prevGraph.current, selection: selection.map((s) => s.id), message: text })
        prevGraph.current = graph
        const bad = (await propose(r.reply, r.ops)) + r.dropped.length
        setMessages((m) => [
          ...m,
          { role: 'ai', text: r.reply },
          ...(bad ? [{ role: 'error' as const, text: `Bỏ ${bad} đề xuất không hợp lệ.` }] : []),
        ])
      } catch (e) {
        setMessages((m) => [...m, { role: 'error', text: (e as Error).message }])
      } finally {
        setBusy(false)
      }
    },
    [editor, propose, reject, selection],
  )

  const onAccept = (keys?: string[]) => {
    const skipped = accept(keys)
    if (skipped.length)
      setMessages((m) => [...m, { role: 'error', text: `Bỏ qua vì node không còn: ${skipped.join('; ')}` }])
  }

  return (
    <div className="lc-app">
      <div className="lc-canvas">
        <Tldraw
          shapeUtils={shapeUtils}
          bindingUtils={bindingUtils}
          components={components}
          onMount={(e) => {
            ;(window as any).editor = e
            setupWorkflowCanvas(e)
            setEditor(e)
          }}
        />
        {proposal && <ProposalBar key={proposal.id} proposal={proposal} onAccept={onAccept} onReject={reject} />}
      </div>
      <ChatPanel messages={messages} selection={selection} busy={busy} onSend={send} saveStatus={saveStatus} />
    </div>
  )
}
