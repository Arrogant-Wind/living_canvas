import { serve } from '@hono/node-server'
import { createApp } from './app'
import { config } from './config'
import { askAi } from './orchestrator'
import { ProjectStore } from './store'

const app = createApp({ store: new ProjectStore(config.projectsDir), ask: (i) => askAi(i) })

// Chỉ nghe trên localhost: API đọc/ghi project và gọi model tốn tiền.
serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
  console.log(`Living Canvas server: http://localhost:${info.port} (model ${config.model})`)
})
