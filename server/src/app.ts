import { GraphSchema } from '@lc/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AskInput, AskResult } from './orchestrator'
import { PiError } from './pi'
import { PROJECT_NAME, type ProjectStore } from './store'

const AskBody = z.object({
  graph: GraphSchema,
  prevGraph: GraphSchema.optional(),
  selection: z.array(z.string()).default([]),
  message: z.string().min(1),
})

const PI_MESSAGES: Record<PiError['kind'], string> = {
  not_found: 'Không chạy được AI: không tìm thấy lệnh pi trên máy.',
  timeout: 'AI trả lời quá lâu nên đã bị dừng. Thử lại hoặc chọn ít node hơn.',
  exit: 'AI (pi) báo lỗi khi chạy.',
  no_answer: 'AI (pi) không trả về câu trả lời.',
}

export function createApp(deps: { store: ProjectStore; ask: (i: AskInput) => Promise<AskResult> }) {
  const { store, ask } = deps
  const app = new Hono()

  app.use('/api/projects/:name/*', async (c, next) => {
    if (!PROJECT_NAME.test(c.req.param('name'))) return c.json({ error: 'Tên project không hợp lệ' }, 400)
    // Trang web khác gửi được POST "simple" (text/plain) không cần preflight: chỉ nhận JSON.
    if (c.req.method !== 'GET' && !(c.req.header('content-type') ?? '').startsWith('application/json'))
      return c.json({ error: 'Chỉ nhận application/json' }, 415)
    await next()
  })

  app.get('/api/projects/:name/canvas', async (c) => c.json({ snapshot: await store.loadCanvas(c.req.param('name')) }))

  app.put('/api/projects/:name/canvas', async (c) => {
    const body = await c.req.json<{ snapshot: unknown }>()
    await store.saveCanvas(c.req.param('name'), body.snapshot)
    return c.json({ ok: true })
  })

  app.get('/api/projects/:name/chat', async (c) => c.json({ messages: await store.loadChat(c.req.param('name')) }))

  app.post('/api/projects/:name/ask', async (c) => {
    const name = c.req.param('name')
    const parsed = AskBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Dữ liệu gửi lên không hợp lệ', issues: parsed.error.issues }, 400)
    const { graph, prevGraph, selection, message } = parsed.data
    const history = (await store.loadChat(name)).map(({ role, text }) => ({ role, text }))
    await store.appendChat(name, { role: 'user', text: message, at: new Date().toISOString() })
    try {
      const result = await ask({ graph, prevGraph, selection, history, message })
      await store.appendChat(name, { role: 'ai', text: result.reply, at: new Date().toISOString() })
      return c.json(result)
    } catch (e) {
      if (e instanceof PiError) return c.json({ error: `${PI_MESSAGES[e.kind]} (${e.message})` }, 502)
      throw e
    }
  })

  return app
}
