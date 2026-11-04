import { resolve } from 'node:path'

export const config = {
  piBin: process.env.LC_PI_BIN ?? 'pi',
  model: process.env.LC_MODEL ?? 'fai/Alibaba:DeepSeek-V4.1-Flash',
  timeoutMs: Number(process.env.LC_TIMEOUT_MS ?? 120_000),
  maxRepairs: 2,
  projectsDir: process.env.LC_PROJECTS_DIR ?? resolve(import.meta.dirname, '../../projects'),
  port: Number(process.env.LC_PORT ?? 8787),
}
