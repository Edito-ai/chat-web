import { describe, expect, it } from 'vitest'
import { activeAt, autoLines, captionLines } from '../captionTiming'
import { toCaptions } from '../clips'

const words = (text: string, step = 0.5) => text.split(' ').map((t, i) => ({ t, s: i * step, e: i * step + step - 0.05 }))

describe('caption timing (same rules as the burn-in)', () => {
  it('uses the plan lines: a line starts 0.05 s early and ends 0.25 s after its last word or at the next line', () => {
    const w = words('wait what this phone costs only nine')
    const lines = captionLines(w, { lines: [[0, 1], [2, 4], [5, 6]], emphasis: [], sfx: [] })
    expect(lines[0]).toEqual({ a: 0, b: 1, start: 0, end: 1 }) // next line starts at 1.0 before 0.95 + 0.25
    expect(lines[1]!.start).toBeCloseTo(0.95)
    expect(lines[2]!.end).toBeCloseTo(3.7) // last word ends at 3.45, + 0.25
  })

  it('lights the word being said, the first one from the moment the line shows', () => {
    const w = words('this is the best moment')
    const lines = captionLines(w, { lines: [[0, 4]], emphasis: [], sfx: [] })
    expect(activeAt(lines, w, 0.2)).toEqual({ line: 0, word: 0 })
    expect(activeAt(lines, w, 1.1)).toEqual({ line: 0, word: 2 })
    expect(activeAt(lines, w, 9)).toBeNull()
  })

  it('without a plan makes lines of up to four words and breaks on a pause', () => {
    const w = [...words('one two three four five'), { t: 'later', s: 5, e: 5.4 }]
    expect(autoLines(w)).toEqual([[0, 3], [4, 4], [5, 5]])
  })

  it('reads the server answer and drops broken lines', () => {
    const c = toCaptions({ version: 2, words: [{ t: 'a', s: 0, e: 0.4 }, { t: 'b', s: 0.5, e: 0.9 }, { bad: 1 }],
                           plan: { lines: [[0, 1], [1, 9], [2, 1]], emphasis: [1, 7], sfx: [{ at: 0.1, sound: 'pop' }] } })
    expect(c).toEqual({ version: 2, words: [{ t: 'a', s: 0, e: 0.4 }, { t: 'b', s: 0.5, e: 0.9 }],
                        plan: { lines: [[0, 1]], emphasis: [1], sfx: [{ at: 0.1, sound: 'pop' }] } })
  })
})
