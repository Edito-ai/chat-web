import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Presence } from '../Presence'
import { ERASE_MS, GAP_MS, HOLD_MS, START, TYPE_MS, frameText, step, type TypewriterState } from '../useTypewriter'

const HINTS = ['Hi', 'Yo']

/** Runs the machine until `done` says stop, returning every visible frame. */
function run(until: (s: TypewriterState, n: number) => boolean) {
  let state = START
  const frames: string[] = []
  const waits: number[] = []
  for (let n = 0; n < 200 && !until(state, n); n++) {
    const next = step(state, HINTS)
    state = next.state
    frames.push(frameText(state, HINTS))
    waits.push(next.wait)
  }
  return { frames, waits, state }
}

describe('typewriter placeholder (mock data only)', () => {
  it('types a hint one character at a time, holds it, erases it, then moves to the next hint', () => {
    const { frames } = run((s) => s.index === 1 && s.shown === 1)
    expect(frames.slice(0, 3)).toEqual(['H', 'Hi', 'Hi']) // typed, then held (same text while holding)
    expect(frames).toContain('H') // erased back down
    expect(frames).toContain('')
    expect(frames.at(-1)).toBe('Y') // and the second hint begins
  })

  it('uses the right pace for each phase', () => {
    const { waits } = run((s) => s.index === 1 && s.shown === 1)
    expect(waits[0]).toBe(TYPE_MS)
    expect(waits).toContain(HOLD_MS)
    expect(waits).toContain(ERASE_MS)
    expect(waits).toContain(GAP_MS)
  })

  it('wraps back to the first hint after the last, and never shows a hint that does not exist', () => {
    const { frames } = run((_s, n) => n > 80)
    expect(frames).toContain('Yo')
    expect(frames.filter((f) => f === 'Hi').length).toBeGreaterThan(2) // it came round again
    expect(frames.every((f) => f === '' || 'Hi'.startsWith(f) || 'Yo'.startsWith(f))).toBe(true)
  })

  it('a single hint keeps looping on itself', () => {
    let state = START
    for (let i = 0; i < 60; i++) state = step(state, ['One']).state
    expect(state.index).toBe(0)
  })
})

describe('the orb waits for the person', () => {
  it('floats on the newest reply while idle, sits still on older ones, and bounces only while working', () => {
    const idle = renderToStaticMarkup(createElement(Presence, { idle: true }))
    const old = renderToStaticMarkup(createElement(Presence, {}))
    const working = renderToStaticMarkup(createElement(Presence, { active: true, idle: true }))
    expect(idle).toContain('animate-orb-idle')
    expect(idle).toContain('data-orb="idle"')
    expect(old).toContain('data-orb="still"')
    expect(old).not.toContain('animate-orb')
    expect(working).toContain('animate-orb-bounce')
    expect(working).not.toContain('animate-orb-idle')
  })
})
