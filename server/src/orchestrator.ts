import { AiReplySchema, diffGraphs, diffToText, graphToText, validateOps, type Graph, type Op, type OpError } from '@lc/shared'
import { config } from './config'
import { extractJson } from './json'
import { runPi } from './pi'
import { systemPrompt, type Intent } from './prompts'

export type { Intent }

const INTENTS: Intent[] = ['review', 'expand', 'suggest', 'explain']

export function parseIntent(message: string): { intent: Intent; text: string } {
  const m = message.trim().match(/^\/(\w+)\s*([\s\S]*)$/)
  if (m && (INTENTS as string[]).includes(m[1])) return { intent: m[1] as Intent, text: m[2].trim() }
  return { intent: 'chat', text: message.trim() }
}

export interface AskInput {
  graph: Graph
  prevGraph?: Graph
  selection: string[]
  history: { role: 'user' | 'ai'; text: string }[]
  message: string
}

export interface AskResult {
  reply: string
  ops: Op[]
  dropped: OpError[]
}

export type Llm = (system: string, prompt: string) => Promise<string>

const defaultLlm: Llm = (system, prompt) => runPi({ system, prompt })

export function buildPrompt(input: AskInput, text: string): string {
  const sel = input.selection.length
    ? input.graph.nodes
        .filter((n) => input.selection.includes(n.id))
        .map((n) => `${n.id} | ${n.title}`)
        .join('\n')
    : '(không chọn gì, xét cả sơ đồ)'
  const diff = input.prevGraph
    ? diffToText(diffGraphs(input.prevGraph, input.graph), input.graph, input.prevGraph)
    : '(lượt đầu)'
  const hist = input.history
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'Người dùng' : 'AI'}: ${h.text}`)
    .join('\n')
  return [
    `SƠ ĐỒ\n${graphToText(input.graph)}`,
    `THAY ĐỔI TỪ LƯỢT TRƯỚC\n${diff}`,
    `ĐANG CHỌN\n${sel}`,
    `HỘI THOẠI GẦN ĐÂY\n${hist || '(chưa có)'}`,
    `YÊU CẦU\n${text || '(làm theo nhiệm vụ)'}`,
  ].join('\n\n')
}

export async function askAi(input: AskInput, llm: Llm = defaultLlm): Promise<AskResult> {
  const { intent, text } = parseIntent(input.message)
  const system = systemPrompt(intent)
  const base = buildPrompt(input, text)
  let prompt = base
  let best: AskResult | undefined
  let lastRaw = ''

  for (let attempt = 0; attempt <= config.maxRepairs; attempt++) {
    lastRaw = await llm(system, prompt)
    let problems: string[]
    try {
      const parsed = AiReplySchema.safeParse(extractJson(lastRaw))
      if (!parsed.success) {
        problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      } else {
        const { ok, errors } = validateOps(input.graph, parsed.data.ops)
        best = { reply: parsed.data.reply, ops: ok, dropped: errors }
        if (!errors.length) return best
        problems = errors.map((e) => `ops[${e.index}] (${e.op.op}): ${e.reason}`)
      }
    } catch (e) {
      problems = [(e as Error).message]
    }
    prompt = `${base}\n\nLỖI Ở LẦN TRƯỚC (hãy sửa và trả lại TOÀN BỘ object JSON):\n${problems.map((p) => `- ${p}`).join('\n')}`
  }
  return best ?? { reply: lastRaw, ops: [], dropped: [] }
}
