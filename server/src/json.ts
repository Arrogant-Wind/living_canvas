/** Tách object JSON đầu tiên đọc được trong câu trả lời của model. */
export function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1])
  for (const chunk of [...fenced, text]) {
    for (let start = chunk.indexOf('{'); start !== -1; start = chunk.indexOf('{', start + 1)) {
      const end = matchingBrace(chunk, start)
      if (end === -1) continue
      try {
        return JSON.parse(chunk.slice(start, end + 1))
      } catch {
        /* thử vị trí '{' tiếp theo */
      }
    }
  }
  throw new Error('Không tìm thấy JSON trong câu trả lời')
}

function matchingBrace(s: string, start: number): number {
  let depth = 0
  let inStr = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}
