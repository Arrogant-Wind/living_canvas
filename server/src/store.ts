import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Node người dùng đính kèm vào lượt chat. Giữ cả tên để lịch sử vẫn đọc được khi node đã đổi/xóa. */
export interface ChatRef {
  id: string
  title: string
}

export interface ChatMsg {
  role: 'user' | 'ai'
  text: string
  at: string
  refs?: ChatRef[]
}

export const PROJECT_NAME = /^[a-z0-9-]+$/

async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export class ProjectStore {
  /** `examplesDir`: project chưa có thì mở từ ví dụ cùng tên (chỉ đọc, sửa thì lưu vào `dir`). */
  constructor(
    private dir: string,
    private examplesDir?: string,
  ) {}

  private async path(name: string, file: string): Promise<string> {
    if (!PROJECT_NAME.test(name)) throw new Error(`Tên project không hợp lệ: ${name}`)
    const d = join(this.dir, name)
    await mkdir(d, { recursive: true })
    return join(d, file)
  }

  async loadCanvas(name: string): Promise<unknown | null> {
    const own = await readJson(await this.path(name, 'canvas.json'))
    if (own !== null || !this.examplesDir) return own
    return readJson(join(this.examplesDir, name, 'canvas.json'))
  }

  async saveCanvas(name: string, snapshot: unknown): Promise<void> {
    const p = await this.path(name, 'canvas.json')
    await writeFile(`${p}.tmp`, JSON.stringify(snapshot), 'utf8')
    await rename(`${p}.tmp`, p)
  }

  async appendChat(name: string, msg: ChatMsg): Promise<void> {
    await appendFile(await this.path(name, 'chat.jsonl'), JSON.stringify(msg) + '\n', 'utf8')
  }

  async loadChat(name: string): Promise<ChatMsg[]> {
    try {
      const raw = await readFile(await this.path(name, 'chat.jsonl'), 'utf8')
      return raw
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
  }
}
