import { describe, expect, it } from 'vitest'
import { boldRuns, plainReply, replyBlocks } from '../replyText'

describe('plainReply: words, never JSON', () => {
  it.each([
    ['{"reply": "Got it."}', 'Got it.'],
    ['```json\n{"reply": "Fenced."}\n```', 'Fenced.'],
    ['{\n  "reply": "Pretty printed."\n}', 'Pretty printed.'],
    ['["One.", "Two."]', 'One.\n\nTwo.'],
    ['{"data": {"note": "Nested."}}', 'Nested.'],
    ['{"reply": "Cut off and never closed', 'Cut off and never closed'],
    ['Plain words.', 'Plain words.'],
    ['It has {braces} inside.', 'It has {braces} inside.'],
  ])('%s', (raw, expected) => {
    expect(plainReply(raw)).toBe(expected)
  })

  it('nothing in, nothing out', () => {
    expect(plainReply(null)).toBe('')
    expect(plainReply('{"n": 3}')).toBe('')
  })
})

describe('replyBlocks and boldRuns', () => {
  it('splits paragraphs and bullet lists', () => {
    expect(replyBlocks('Intro line.\n\n- one\n- two\n\nOutro.')).toEqual([
      { type: 'p', text: 'Intro line.' },
      { type: 'ul', items: ['one', 'two'] },
      { type: 'p', text: 'Outro.' },
    ])
  })
  it('finds bold runs', () => {
    expect(boldRuns('a **b** c')).toEqual([{ bold: false, text: 'a ' }, { bold: true, text: 'b' }, { bold: false, text: ' c' }])
  })
})
