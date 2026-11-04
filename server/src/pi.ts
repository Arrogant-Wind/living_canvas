import { spawn } from 'node:child_process'
import { config } from './config'

export class PiError extends Error {
  constructor(
    public kind: 'not_found' | 'timeout' | 'exit' | 'no_answer',
    message: string,
  ) {
    super(message)
  }
}

export type Spawner = (
  bin: string,
  args: string[],
  opts: { timeoutMs: number },
) => Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; notFound: boolean }>

/** Text của sự kiện `message_end` cuối cùng có role assistant (bỏ phần thinking). */
export function parsePiJsonl(raw: string): string {
  let answer: string | undefined
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let ev: any
    try {
      ev = JSON.parse(line)
    } catch {
      continue
    }
    if (ev.type === 'message_end' && ev.message?.role === 'assistant') {
      const content = ev.message.content
      answer = Array.isArray(content)
        ? content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('')
        : String(content ?? '')
    }
  }
  if (answer === undefined || !answer.trim()) throw new PiError('no_answer', 'Pi không trả về câu trả lời')
  return answer
}

export const nodeSpawner: Spawner = (bin, args, { timeoutMs }) =>
  new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr: String(e), timedOut, notFound: e.code === 'ENOENT' })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut, notFound: false })
    })
  })

export async function runPi(args: { system: string; prompt: string }, spawner: Spawner = nodeSpawner): Promise<string> {
  const argv = [
    '-p',
    '--mode', 'json',
    '--no-tools',
    '--no-session',
    '--no-context-files',
    '--no-extensions',
    '--no-skills',
    '--model', config.model,
    '--system-prompt', args.system,
    args.prompt,
  ]
  const r = await spawner(config.piBin, argv, { timeoutMs: config.timeoutMs })
  if (r.notFound) throw new PiError('not_found', `Không tìm thấy lệnh "${config.piBin}"`)
  if (r.timedOut) throw new PiError('timeout', `Pi không trả lời sau ${config.timeoutMs / 1000}s`)
  if (r.code !== 0) throw new PiError('exit', `Pi thoát với mã ${r.code}: ${r.stderr.slice(-500)}`)
  return parsePiJsonl(r.stdout)
}
