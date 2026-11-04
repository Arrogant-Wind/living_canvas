import { z } from 'zod'

export const NodeKindSchema = z.enum(['agent', 'llm', 'code', 'human', 'unknown'])
export type NodeKind = z.infer<typeof NodeKindSchema>

export const GraphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  kind: NodeKindSchema.optional(),
  parentId: z.string().optional(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  status: z.enum(['draft', 'locked']),
})
export type GraphNode = z.infer<typeof GraphNodeSchema>

export const EdgeTypeSchema = z.enum(['flow', 'data'])
export type EdgeType = z.infer<typeof EdgeTypeSchema>

export const GraphEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  type: EdgeTypeSchema,
})
export type GraphEdge = z.infer<typeof GraphEdgeSchema>

export const GraphNoteSchema = z.object({
  id: z.string(),
  text: z.string(),
  author: z.enum(['user', 'ai']),
  targetIds: z.array(z.string()),
  kind: z.enum(['note', 'comment', 'review']),
})
export type GraphNote = z.infer<typeof GraphNoteSchema>

export const GraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  notes: z.array(GraphNoteSchema),
})
export type Graph = z.infer<typeof GraphSchema>

const strList = z.array(z.string())

export const OpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_node'),
    tempId: z.string(),
    title: z.string(),
    kind: NodeKindSchema.optional(),
    parent: z.string().optional(),
    after: z.string().optional(),
    inputs: strList.optional(),
    outputs: strList.optional(),
    description: z.string().optional(),
  }),
  z.object({
    op: z.literal('update_node'),
    id: z.string(),
    title: z.string().optional(),
    kind: NodeKindSchema.optional(),
    inputs: strList.optional(),
    outputs: strList.optional(),
    description: z.string().optional(),
  }),
  z.object({ op: z.literal('delete_node'), id: z.string() }),
  z.object({ op: z.literal('set_parent'), id: z.string(), parent: z.string().nullable() }),
  z.object({
    op: z.literal('add_edge'),
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
    type: EdgeTypeSchema.optional(),
  }),
  z.object({ op: z.literal('update_edge'), id: z.string(), label: z.string().optional() }),
  z.object({ op: z.literal('delete_edge'), id: z.string() }),
  z.object({
    op: z.literal('add_note'),
    targets: strList,
    text: z.string(),
    kind: z.enum(['review', 'note']),
  }),
])
export type Op = z.infer<typeof OpSchema>

export const AiReplySchema = z.object({
  reply: z.string(),
  ops: z.array(OpSchema).default([]),
})
export type AiReply = z.infer<typeof AiReplySchema>
