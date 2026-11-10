import type { Graph, Op, OpError } from '@lc/shared'

/** Node đính kèm vào lượt chat. */
export interface ChatRef {
  id: string
  title: string
}
export interface ChatMsg {
  role: 'user' | 'ai' | 'error'
  text: string
  at?: string
  refs?: ChatRef[]
}
export interface AskResult {
  reply: string
  ops: Op[]
  dropped: OpError[]
}

const base = (p: string) => `/api/projects/${encodeURIComponent(p)}`

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Lỗi máy chủ (${res.status})`)
  return body as T
}

export const api = {
  loadCanvas: (p: string) => call<{ snapshot: unknown | null }>(`${base(p)}/canvas`),
  saveCanvas: (p: string, snapshot: unknown) => {
    const body = JSON.stringify({ snapshot })
    return call(`${base(p)}/canvas`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
      // keepalive giúp lần lưu lúc đóng tab vẫn tới server, nhưng trình duyệt giới hạn body 64KB.
      keepalive: body.length < 60_000,
    })
  },
  loadChat: (p: string) => call<{ messages: ChatMsg[] }>(`${base(p)}/chat`),
  ask: (p: string, body: { graph: Graph; prevGraph?: Graph; refs: ChatRef[]; message: string }) =>
    call<AskResult>(`${base(p)}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
}
