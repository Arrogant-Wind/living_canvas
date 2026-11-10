import { mkdirSync, writeFileSync } from 'node:fs'
import { askAi, type Llm } from '../src/orchestrator'
import { runPi } from '../src/pi'
import { config } from '../src/config'
import { cases } from './cases'

/** Chạy mỗi case `LC_EVAL_RUNS` lần (mặc định 1) với model thật. */
const runs = Number(process.env.LC_EVAL_RUNS ?? 1)
const only = process.argv.slice(2)
const results: unknown[] = []
let pass = 0
let total = 0

for (const c of cases.filter((c) => !only.length || only.includes(c.id))) {
  for (let i = 0; i < runs; i++) {
    let calls = 0
    const llm: Llm = (s, p) => (calls++, runPi({ system: s, prompt: p }))
    const t0 = Date.now()
    let reason: string | null
    let reply = ''
    try {
      const r = await askAi({ graph: c.graph, refs: c.refs, history: [], message: c.message }, llm)
      reason = c.check(r)
      reply = r.reply
    } catch (e) {
      reason = `lỗi: ${(e as Error).message}`
    }
    const ms = Date.now() - t0
    total++
    if (!reason) pass++
    console.log(`${reason ? 'FAIL' : 'PASS'} ${c.id}#${i + 1}  ${(ms / 1000).toFixed(1)}s  repairs=${calls - 1}${reason ? `  — ${reason}` : ''}`)
    results.push({ id: c.id, run: i + 1, pass: !reason, reason, ms, repairs: calls - 1, reply })
  }
}

console.log(`\n${pass}/${total} đạt (model ${config.model})`)
const dir = new URL('./results/', import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL(`${new Date().toISOString().replace(/[:.]/g, '-')}.json`, dir), JSON.stringify({ model: config.model, pass, total, results }, null, 2))
