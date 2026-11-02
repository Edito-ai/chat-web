/** Copied from the editor (Frontend support/lib/markdown.ts): a tiny safe Markdown parser, data tree only, no HTML strings. */
/**
 * A deliberately small Markdown parser for the backend's legal documents (headings, paragraphs,
 * bullet/numbered lists, blockquotes, tables, rules, and **bold** / *italic* / `code` / links).
 * It produces a plain data tree; `components/MarkdownView.tsx` renders it as React elements —
 * there is no HTML string anywhere, so document text can never inject markup.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'rule' }

/** Only these link schemes are ever rendered as links; anything else stays literal text. */
export function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href.trim())
}

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let rest = src
  while (rest.length > 0) {
    const m = INLINE_RE.exec(rest)
    if (!m) {
      out.push({ type: 'text', text: rest })
      break
    }
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) })
    const tok = m[0]
    if (tok.startsWith('**')) out.push({ type: 'strong', children: parseInline(tok.slice(2, -2)) })
    else if (tok.startsWith('`')) out.push({ type: 'code', text: tok.slice(1, -1) })
    else if (tok.startsWith('[')) {
      const close = tok.indexOf('](')
      const label = tok.slice(1, close)
      const href = tok.slice(close + 2, -1)
      out.push(isSafeHref(href) ? { type: 'link', href, children: parseInline(label) } : { type: 'text', text: tok })
    } else out.push({ type: 'em', children: parseInline(tok.slice(1, -1)) })
    rest = rest.slice(m.index + tok.length)
  }
  return out
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      i++
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2]!.trim()),
      })
      i++
      continue
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (/^>/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>/.test(lines[i]!)) buf.push(lines[i++]!.replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', children: parseInline(buf.join(' ').trim()) })
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]!)) {
      const header = splitRow(line).map(parseInline)
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i]!.trim() !== '' && lines[i]!.includes('|')) {
        rows.push(splitRow(lines[i++]!).map(parseInline))
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }
    const bullet = /^\s*[-*+]\s+/
    const numbered = /^\s*\d+[.)]\s+/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const re = ordered ? numbered : bullet
      const items: Inline[][] = []
      while (i < lines.length && re.test(lines[i]!)) {
        let text = lines[i++]!.replace(re, '')
        // Indented continuation lines belong to the same item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !bullet.test(lines[i]!) && !numbered.test(lines[i]!)) {
          text += ' ' + lines[i++]!.trim()
        }
        items.push(parseInline(text))
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^(#{1,6}\s|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i]!) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]!)
    ) {
      buf.push(lines[i++]!.trim())
    }
    if (buf.length === 0) {
      buf.push(line.trim())
      i++
    }
    blocks.push({ type: 'paragraph', children: parseInline(buf.join(' ')) })
  }
  return blocks
}
