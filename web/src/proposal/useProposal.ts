import type { Box, Op } from '@lc/shared'
import { useCallback, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import { proposalToPartials } from '../canvas/applyProposal'
import { acceptProposal, mountProposal, rejectProposal, type MountedProposal } from '../canvas/proposalEditor'
import { graphId, storeToGraph, WF_NODE } from '../canvas/storeToGraph'

export function currentGraph(editor: Editor) {
  return storeToGraph(editor.store.allRecords() as any)
}

export function nodeBoxes(editor: Editor): Record<string, Box> {
  const out: Record<string, Box> = {}
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== WF_NODE || s.meta.ghost) continue
    const b = editor.getShapePageBounds(s.id as TLShapeId)
    if (b) out[graphId(s.id)] = { x: b.x, y: b.y, w: b.w, h: b.h }
  }
  return out
}

let seq = 0

/** Chỉ có một proposal đang chờ tại một thời điểm. */
export function useProposal(editor: Editor | null) {
  const [proposal, setProposal] = useState<MountedProposal | null>(null)

  const reject = useCallback(() => {
    if (editor && proposal) rejectProposal(editor, proposal)
    setProposal(null)
  }, [editor, proposal])

  /** Dựng ghost từ ops. Trả về số op bị bỏ vì không hợp lệ trên canvas hiện tại. */
  const propose = useCallback(
    async (reply: string, ops: Op[]): Promise<number> => {
      if (!editor) return 0
      if (proposal) rejectProposal(editor, proposal)
      const id = `p${Date.now().toString(36)}${++seq}`
      const r = await proposalToPartials(currentGraph(editor), nodeBoxes(editor), ops, id)
      const p: MountedProposal = { id, reply, items: r.items, create: r.create, bindings: r.bindings }
      mountProposal(editor, p)
      setProposal(p.items.length ? p : null)
      return r.errors.length
    },
    [editor, proposal],
  )

  const accept = useCallback(
    (keys?: string[]): string[] => {
      if (!editor || !proposal) return []
      const skipped = acceptProposal(editor, proposal, keys)
      setProposal(null)
      return skipped
    },
    [editor, proposal],
  )

  return { proposal, propose, accept, reject }
}
