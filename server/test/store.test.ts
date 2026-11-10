import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProjectStore } from '../src/store'

const dirs = () => {
  const root = mkdtempSync(join(tmpdir(), 'lc-store-'))
  const examples = join(root, 'examples')
  mkdirSync(join(examples, 'vi-du'), { recursive: true })
  writeFileSync(join(examples, 'vi-du', 'canvas.json'), JSON.stringify({ title: 'ví dụ' }))
  return { projects: join(root, 'projects'), examples }
}

describe('ProjectStore examples', () => {
  it('opens a new project from the example with the same name', async () => {
    const d = dirs()
    const store = new ProjectStore(d.projects, d.examples)
    expect(await store.loadCanvas('vi-du')).toEqual({ title: 'ví dụ' })
    expect(await store.loadCanvas('khac')).toBeNull()
  })

  it('saves edits to the project and leaves the example untouched', async () => {
    const d = dirs()
    const store = new ProjectStore(d.projects, d.examples)
    await store.saveCanvas('vi-du', { title: 'đã sửa' })
    expect(await store.loadCanvas('vi-du')).toEqual({ title: 'đã sửa' })
    expect(JSON.parse(readFileSync(join(d.examples, 'vi-du', 'canvas.json'), 'utf8'))).toEqual({ title: 'ví dụ' })
  })

  it('works without an examples dir', async () => {
    const d = dirs()
    expect(await new ProjectStore(d.projects).loadCanvas('vi-du')).toBeNull()
  })
})
