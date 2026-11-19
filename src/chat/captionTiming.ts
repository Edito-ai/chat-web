import type { CaptionPlan, ClipWord } from './clips'

/** One caption line: words a..b (inclusive), shown from `start` to `end` (seconds on the clip). */
export interface CaptionLine {
  a: number
  b: number
  start: number
  end: number
}

/** Without a plan from the server: lines of up to 4 words, a new line after a pause. */
export function autoLines(words: ClipWord[]): [number, number][] {
  const out: [number, number][] = []
  let a = 0
  for (let i = 0; i < words.length; i++) {
    const last = i === words.length - 1
    const full = i - a + 1 >= 4
    const pause = !last && words[i + 1]!.s - words[i]!.e > 0.6
    if (last || full || pause) {
      out.push([a, i])
      a = i + 1
    }
  }
  return out
}

/**
 * The caption lines with their times, the same rules as the burn-in (`make_ass` in backend2/b2/clips/studio.py): a line
 * starts 0.05 s before its first word and ends 0.25 s after its last one, or when the next line starts, or at the clip end.
 */
export function captionLines(words: ClipWord[], plan: CaptionPlan | null, duration = Infinity): CaptionLine[] {
  if (!words.length) return []
  const spans = plan?.lines.length ? plan.lines : autoLines(words)
  return spans.map(([a, b], li) => {
    let end = words[b]!.e + 0.25
    const next = spans[li + 1]
    if (next) end = Math.min(end, words[next[0]]!.s)
    return { a, b, start: Math.max(0, words[a]!.s - 0.05), end: Math.min(end, duration) }
  })
}

/** Which line is on screen at `t`, and which of its words is being said (the last one started, like the burn-in). */
export function activeAt(lines: CaptionLine[], words: ClipWord[], t: number): { line: number; word: number } | null {
  const line = lines.findIndex((l) => t >= l.start && t < l.end)
  if (line < 0) return null
  const { a, b } = lines[line]!
  let word = a
  for (let i = a; i <= b; i++) if (words[i]!.s <= t) word = i
  return { line, word }
}
