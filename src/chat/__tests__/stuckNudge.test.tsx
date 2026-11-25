// @vitest-environment jsdom
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STUCK_AFTER_MS, progressSignature, useStuckNudge } from '../useStuckNudge'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let out: { show: boolean; dismiss: () => void }
function Probe({ active, sig }: { active: boolean; sig: string }) {
  out = useStuckNudge(active, sig)
  return null
}
const root = createRoot(document.createElement('div'))
const render = (active: boolean, sig: string) => act(() => root.render(createElement(Probe, { active, sig })))
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useStuckNudge', () => {
  it('shows only after 5 minutes in the same state', () => {
    render(true, 'a')
    wait(STUCK_AFTER_MS - 1000)
    expect(out.show).toBe(false)
    wait(1000)
    expect(out.show).toBe(true)
  })

  it('starts over when the stage changes and hides the nudge', () => {
    render(true, 'a')
    wait(STUCK_AFTER_MS)
    expect(out.show).toBe(true)
    render(true, 'b')
    expect(out.show).toBe(false)
    wait(STUCK_AFTER_MS - 1000)
    expect(out.show).toBe(false)
  })

  it('stays quiet after "all good" for that state, and never shows when idle', () => {
    render(true, 'a')
    wait(STUCK_AFTER_MS)
    act(() => out.dismiss())
    expect(out.show).toBe(false)
    render(false, 'a')
    wait(STUCK_AFTER_MS * 2)
    expect(out.show).toBe(false)
  })

  it('signature changes with stage and percent', () => {
    const m = { jobId: 'j', turn: 1, status: 'running', stage: 'rendering', progress: 0.404 }
    expect(progressSignature(m)).not.toBe(progressSignature({ ...m, progress: 0.42 }))
    expect(progressSignature(m)).toBe(progressSignature({ ...m, progress: 0.4041 }))
  })
})
