import { serve } from '@hono/node-server'
import { createApp } from './app'
import { config } from './config'
import { askAi } from './orchestrator'
import { ProjectStore } from './store'

const app = createApp({ store: new ProjectStore(config.projectsDir), ask: (i) => askAi(i) })

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Living Canvas server: http://localhost:${info.port} (model ${config.model})`)
})
