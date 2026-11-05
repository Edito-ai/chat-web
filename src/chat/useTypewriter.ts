import { useEffect, useState } from 'react'

/** How the placeholder moves, in ms. Plain numbers: nothing measured behind them, only what reads as typing. */
export const TYPE_MS = 42
export const HOLD_MS = 1700
export const ERASE_MS = 18
export const GAP_MS = 350

export interface TypewriterState {
  /** Which hint is on screen. */
  index: number
  /** How many of its characters are showing. */
  shown: number
  phase: 'typing' | 'holding' | 'erasing'
}

export const START: TypewriterState = { index: 0, shown: 0, phase: 'typing' }

/** The next state and how long to wait before taking it. Pure: the hook only schedules it. */
export function step(state: TypewriterState, hints: readonly string[]): { state: TypewriterState; wait: number } {
  const hint = hints[state.index % hints.length] ?? ''
  if (state.phase === 'typing') {
    if (state.shown < hint.length) return { state: { ...state, shown: state.shown + 1 }, wait: TYPE_MS }
    return { state: { ...state, phase: 'holding' }, wait: HOLD_MS }
  }
  if (state.phase === 'holding') return { state: { ...state, phase: 'erasing' }, wait: ERASE_MS }
  if (state.shown > 0) return { state: { ...state, shown: state.shown - 1 }, wait: ERASE_MS }
  return { state: { index: (state.index + 1) % hints.length, shown: 0, phase: 'typing' }, wait: GAP_MS }
}

export function frameText(state: TypewriterState, hints: readonly string[]): string {
  return (hints[state.index % hints.length] ?? '').slice(0, state.shown)
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The text of an animated placeholder: example prompts typed out one after another, to invite the person to write one.
 * Returns '' while it is off or has nothing to type (the caller then shows its normal placeholder). With reduced motion
 * it does not animate: the first hint stays, whole.
 */
export function useTypewriter(hints: readonly string[], enabled: boolean): string {
  const [state, setState] = useState<TypewriterState>(START)
  const key = hints.join('\u0001')
  const active = enabled && hints.length > 0

  useEffect(() => {
    setState(START)
    if (!active || prefersReducedMotion()) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let current = START
    const tick = () => {
      const next = step(current, hints)
      current = next.state
      setState(current)
      timer = setTimeout(tick, next.wait)
    }
    timer = setTimeout(tick, 600)
    return () => clearTimeout(timer)
    // `hints` is compared by content through `key`, so a new array with the same words does not restart the animation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key])

  if (!active) return ''
  if (prefersReducedMotion()) return hints[0] ?? ''
  return frameText(state, hints)
}
