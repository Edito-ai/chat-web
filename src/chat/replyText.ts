/**
 * What an assistant reply shows. Two jobs:
 *
 * 1. Never JSON. The backend strips it, but replies already stored by an older version (or a model that answers in JSON
 *    anyway) must also read as words, so the screen applies the same rule: `{"reply": "..."}`, a fenced ```json block, a
 *    list of strings or a nested object become their text.
 * 2. Format it: blank-line separated paragraphs, "- " lines as bullet lists, **bold** as emphasis. Nothing else is
 *    interpreted (no links, no HTML), so a reply can never inject markup.
 */

const TEXT_KEYS = ['reply', 'text', 'answer', 'message', 'response', 'content'] as const

function collect(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(collect)
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(collect)
  return []
}

/** Quoted values out of JSON that was cut off before it closed. */
function quotedValues(raw: string): string {
  const out: string[] = []
  const re = /"[^"\\]*"\s*:\s*"((?:[^"\\]|\\.)*)/g
  for (let m = re.exec(raw); m; m = re.exec(raw)) out.push(m[1]!.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim())
  return out.filter(Boolean).join('\n\n')
}

export function plainReply(text: string | null | undefined): string {
  let t = (text ?? '').trim()
  if (t.startsWith('```')) t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim()
  if (!t || (t[0] !== '{' && t[0] !== '[')) return t
  try {
    const data: unknown = JSON.parse(t)
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const key of TEXT_KEYS) {
        const v = (data as Record<string, unknown>)[key]
        if (typeof v === 'string' && v.trim()) return v.trim()
      }
    }
    return collect(data).join('\n\n')
  } catch {
    return quotedValues(t)
  }
}

export type ReplyBlock = { type: 'p'; text: string } | { type: 'ul'; items: string[] }

const BULLET = /^\s*(?:[-*\u2022])\s+(.*)$/

/** Paragraphs and bullet lists, from plain text. */
export function replyBlocks(text: string | null | undefined): ReplyBlock[] {
  const blocks: ReplyBlock[] = []
  for (const chunk of plainReply(text).split(/\n{2,}/)) {
    const lines = chunk.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim())
    let para: string[] = []
    let items: string[] = []
    const flushPara = () => {
      if (para.length) blocks.push({ type: 'p', text: para.join(' ') })
      para = []
    }
    const flushItems = () => {
      if (items.length) blocks.push({ type: 'ul', items })
      items = []
    }
    for (const line of lines) {
      const b = BULLET.exec(line)
      if (b) {
        flushPara()
        items.push(b[1]!)
      } else {
        flushItems()
        para.push(line.trim())
      }
    }
    flushPara()
    flushItems()
  }
  return blocks
}

/** Splits a line into plain and **bold** runs. */
export function boldRuns(text: string): { bold: boolean; text: string }[] {
  const runs: { bold: boolean; text: string }[] = []
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (!part) return
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) runs.push({ bold: true, text: part.slice(2, -2) })
    else runs.push({ bold: false, text: part })
  })
  return runs
}
