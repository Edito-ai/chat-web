import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkingScene, etaMessage, thinkLine, tipAt } from '../WorkingScene'
import { estimateRemainingMs } from '../activity'
import { LiveActivity } from '../ActivityPanel'
import { Presence } from '../Presence'
import { en } from '@/i18n/en'
import { hi } from '@/i18n/hi'
import type { ChatAssistantMessage } from '../chatTypes'

// Mock data only: no network, no backend, no paid API.
const msg = (over: Partial<ChatAssistantMessage> = {}): ChatAssistantMessage => ({
  id: 'm1', role: 'assistant', jobId: 'job-mock', turn: 1, status: 'running', stage: 'planning', progress: 0.5,
  message: null, reply: null, result: null, error: null, ...over,
})

describe('working scene (mock data only)', () => {
  it('rotates the AI line within a step and alternates craft lessons with try-next tips', () => {
    expect(thinkLine('planning', 0)).toBe('chat.think.planning.1')
    expect(thinkLine('planning', 6000)).toBe('chat.think.planning.2')
    expect(thinkLine('planning', 18000)).toBe('chat.think.planning.1')
    expect(tipAt(0)).toEqual({ kind: 'craft', key: 'chat.craft.1' })
    expect(tipAt(11000)).toEqual({ kind: 'try', key: 'chat.try.1' })
    expect(tipAt(22000)).toEqual({ kind: 'craft', key: 'chat.craft.2' })
  })

  it('every line exists in English and Hindi for every step and over a long run', () => {
    const stages = ['queued', 'analyzing', 'planning', 'assembling', 'rendering'] as const
    for (let ms = 0; ms < 900_000; ms += 3000) {
      for (const k of [tipAt(ms).key, ...stages.map((s) => thinkLine(s, ms))]) {
        expect(en[k]).toBeTruthy()
        expect(hi[k]).toBeTruthy()
      }
    }
  })

  it('shows the AI line and a fact, with no video inside the panel', () => {
    const html = renderToStaticMarkup(createElement(WorkingScene, { stage: 'analyzing', elapsedMs: 0 }))
    expect(html).not.toContain('<video')
    expect(html).toContain(en['chat.think.analyzing.1'])
    expect(html).toContain(en['chat.craft.1'])
    expect(html).toContain(en['chat.think.craft'])
  })

  it('chat avatar is the orb: still at rest, bouncing only while the edit runs, and never the B logo', () => {
    const rest = renderToStaticMarkup(createElement(Presence, { active: false }))
    const live = renderToStaticMarkup(createElement(Presence, { active: true }))
    expect(rest).toContain('/mascot/orb.webp')
    expect(rest).toContain('data-orb="still"')
    expect(rest).not.toContain('animate-orb-bounce')
    expect(live).toContain('data-orb="run"')
    expect(live).toContain('animate-orb-bounce')
    expect(rest + live).not.toContain('/brand/mark-tile.webp')
  })

  it('shows the real step position (for example 2/4) in the bubble', () => {
    const html = renderToStaticMarkup(createElement(WorkingScene, { stage: 'planning', elapsedMs: 0, step: { id: 'planning', index: 2, count: 4 } }))
    expect(html).toContain('2/4')
    expect(html).toContain('Planning the edit')
  })

  it('shows inside the live progress panel next to the real steps', () => {
    const html = renderToStaticMarkup(createElement(LiveActivity, { msg: msg() }))
    expect(html).toContain('data-testid="chat-working-scene"')
    expect(html).toContain('data-testid="chat-steps"')
  })

  it('estimates time left from real progress and elapsed time only', () => {
    expect(estimateRemainingMs(0.5, 60_000)).toBe(60_000)
    expect(estimateRemainingMs(0.25, 30_000)).toBe(90_000)
    expect(estimateRemainingMs(null, 60_000)).toBeNull()
    expect(estimateRemainingMs(0.02, 60_000)).toBeNull()
    expect(estimateRemainingMs(0.5, 5_000)).toBeNull()
    expect(estimateRemainingMs(1, 60_000)).toBeNull()
  })

  it('shows the estimate in the bubble header, in whole minutes, and nothing when unknown', () => {
    expect(etaMessage(null)).toBeNull()
    expect(etaMessage(30_000)).toEqual({ key: 'chat.eta.soon' })
    expect(etaMessage(150_000)).toEqual({ key: 'chat.eta.minutes', params: { n: 3 } })
    const withEta = renderToStaticMarkup(createElement(WorkingScene, { stage: 'rendering', elapsedMs: 0, etaMs: 150_000 }))
    expect(withEta).toContain('data-testid="chat-eta"')
    expect(withEta).toContain('About 3 min left')
    const without = renderToStaticMarkup(createElement(WorkingScene, { stage: 'rendering', elapsedMs: 0 }))
    expect(without).not.toContain('chat-eta')
  })

  it('shows the real backend activity inside the card instead of the generic thought', () => {
    const now = Date.now()
    const m = msg({
      stage: 'planning',
      timings: [{ state: 'planning', stage: 'planning', at: now - 5000 }],
      activity: [
        { id: 'thought:plan', kind: 'thought', title: 'Planning the edit', detail: null, state: 'done', at: now - 5000, endedAt: now - 4000 },
        { id: 'say:cuts', kind: 'say', title: 'Cutting the long pauses first.', detail: null, state: 'done', at: now - 3000, endedAt: now - 3000 },
      ],
    } as Partial<ChatAssistantMessage>)
    const html = renderToStaticMarkup(createElement(LiveActivity, { msg: m }))
    expect(html).toContain('data-testid="chat-progress"')
    expect(html).toContain('Cutting the long pauses first.')
    expect(html).toContain('data-testid="chat-steps"')
  })
})
