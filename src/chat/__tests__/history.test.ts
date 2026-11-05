import { describe, expect, it } from 'vitest'
import { deriveTitle, groupHistory, groupOf, historyStatus, rebuildMessages, toHistoryItem, type HistoryItem } from '../history'
import { buildTimeline, formatElapsed, hintIndex, splitReply, totalElapsedMs } from '../activity'
import { newAssistant } from '../chatState'
import type { ChatAssistantMessage } from '../chatTypes'

const NOW = new Date(2026, 9, 20, 15, 0, 0).getTime() // 20 Oct 2026 15:00 local
const at = (daysAgo: number, hour = 10) => new Date(2026, 9, 20 - daysAgo, hour, 0, 0).getTime()
const item = (id: string, createdAt: number): HistoryItem => ({ jobId: id, title: id, status: 'complete', createdAt, updatedAt: createdAt, pinned: false })

describe('history grouping', () => {
  it('splits into Today / Yesterday / Previous 7 days / Older, newest first, skipping empty groups', () => {
    const g = groupHistory([item('old', at(30)), item('y', at(1, 23)), item('t2', at(0, 9)), item('w', at(6)), item('t1', at(0, 14))], NOW)
    expect(g.map((x) => x.id)).toEqual(['today', 'yesterday', 'week', 'older'])
    expect(g[0]!.items.map((i) => i.jobId)).toEqual(['t1', 't2'])
    expect(groupHistory([], NOW)).toEqual([])
    expect(groupHistory([item('t', at(0))], NOW).map((x) => x.id)).toEqual(['today'])
  })
  it('puts exactly 7 days ago in the week group and 8 in older', () => {
    expect(groupOf(at(7, 0), NOW)).toBe('week')
    expect(groupOf(at(8, 23), NOW)).toBe('older')
  })
})

describe('titles and status', () => {
  it('collapses whitespace and truncates with an ellipsis', () => {
    expect(deriveTitle('  make   a\nreel ')).toBe('make a reel')
    const t = deriveTitle('x'.repeat(100))
    expect(t).toHaveLength(60)
    expect(t.endsWith('…')).toBe(true)
    expect(deriveTitle(null)).toBe('')
  })
  it('maps job states to a dot and a wire job to a row', () => {
    expect(['queued', 'rendering', 'complete', 'failed', 'cancelled'].map(historyStatus)).toEqual([
      'running', 'running', 'complete', 'failed', 'failed',
    ])
    const row = toHistoryItem({ id: 'j', state: 'failed', title: null, turns: [{ turn: 1, prompt: ' hello  there ', state: 'failed' }], createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:05:00Z' })
    expect(row).toMatchObject({ jobId: 'j', title: 'hello there', status: 'failed' })
    expect(row.updatedAt - row.createdAt).toBe(300_000)
  })
})

describe('rebuildMessages', () => {
  it('turns recorded turns into messages and gives only the newest finished turn a video', () => {
    const m = rebuildMessages({
      id: 'j', state: 'complete', turn: 2, previewUrl: 'https://x/v.mp4', downloadUrl: 'https://x/d.mp4', reply: 'Bigger captions.',
      turns: [
        { turn: 1, prompt: 'reel', state: 'complete', reply: 'Your video is ready.', durationSec: 60 },
        { turn: 2, prompt: 'bigger captions', state: 'complete', reply: 'Bigger captions.', durationSec: 30 },
      ],
    })
    expect(m.map((x) => x.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect((m[1] as ChatAssistantMessage).result).toBeNull()
    expect((m[3] as ChatAssistantMessage).result?.videoUrl).toBe('https://x/v.mp4')
    expect((m[3] as ChatAssistantMessage).durationSec).toBe(30)
  })
  it('adds the running first turn using the title as its prompt', () => {
    const m = rebuildMessages({ id: 'j', state: 'planning', turn: 1, title: 'my reel', progress: 0.3, turns: [] })
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ role: 'user', text: 'my reel' })
    expect(m[1]).toMatchObject({ role: 'assistant', status: 'running', stage: 'planning', progress: 0.3 })
  })
})

describe('stage timeline', () => {
  const msg = (over: Partial<ChatAssistantMessage>): ChatAssistantMessage => ({ ...newAssistant('a', 'j', 1), ...over })
  const T0 = 1_000_000
  it('marks earlier steps done with real elapsed, the current one active, later ones pending', () => {
    const steps = buildTimeline(
      msg({ status: 'running', stage: 'planning', timings: [{ state: 'analyzing', stage: 'understanding', at: T0 }, { state: 'planning', stage: 'director', at: T0 + 90_000 }] }),
      T0 + 100_000,
    )
    expect(steps.map((s) => [s.id, s.status])).toEqual([['analyzing', 'done'], ['planning', 'active'], ['assembling', 'pending'], ['rendering', 'pending']])
    expect(steps[0]!.elapsedMs).toBe(90_000)
    expect(steps[1]!.elapsedMs).toBe(10_000)
    expect(steps[2]!.elapsedMs).toBeNull()
  })
  it('has no elapsed when the backend sent no timings, and skips analyzing on a follow-up', () => {
    const steps = buildTimeline(msg({ status: 'running', stage: 'rendering', turn: 2 }), T0)
    expect(steps.map((s) => s.id)).toEqual(['planning', 'assembling', 'rendering'])
    expect(steps.map((s) => s.status)).toEqual(['done', 'done', 'active'])
    expect(steps.every((s) => s.elapsedMs === null)).toBe(true)
  })
  it('closes the last step at the finish time and marks a failure on the step reached', () => {
    const timings = [{ state: 'analyzing', stage: null, at: T0 }, { state: 'planning', stage: null, at: T0 + 5000 }]
    const done = buildTimeline(msg({ status: 'complete', stage: null, timings, finishedAt: T0 + 20_000 }), 0)
    expect(done.map((s) => s.status)).toEqual(['done', 'done', 'done', 'done'])
    expect(done[1]!.elapsedMs).toBe(15_000)
    const failed = buildTimeline(msg({ status: 'failed', stage: null, timings, finishedAt: T0 + 9000 }), 0)
    expect(failed.map((s) => s.status)).toEqual(['done', 'failed', 'pending', 'pending'])
    expect(failed[1]!.elapsedMs).toBe(4000)
  })
  it('measures the total from the server duration first, else start to finish or now', () => {
    expect(totalElapsedMs(msg({ durationSec: 1056.2 }), 0)).toBe(1_056_200)
    expect(totalElapsedMs(msg({ status: 'running', startedAt: T0 }), T0 + 7000)).toBe(7000)
    expect(totalElapsedMs(msg({ status: 'complete', startedAt: T0, finishedAt: T0 + 9000 }), T0 + 99_999)).toBe(9000)
    expect(totalElapsedMs(msg({}), 5)).toBeNull()
  })
  it('formats elapsed and rotates generic hints', () => {
    expect(formatElapsed(1_056_000)).toBe('17m 36s')
    expect(formatElapsed(42_000)).toBe('42s')
    expect(formatElapsed(3_720_000)).toBe('1h 02m')
    expect([0, 4500, 9000, 13_500].map(hintIndex)).toEqual([0, 1, 2, 0])
  })
  it('keeps a list item with quoted names and brackets as one chip', () => {
    const r = splitReply('Done. This draft does not include the zoom-blur transition (a straight cut instead) and 3 animated graphics ("big keyword", "underline sweep", "emoji pop") (only plain text graphics can be drawn in chat).')
    expect(r.notIncluded).toEqual([
      'the zoom-blur transition (a straight cut instead)',
      '3 animated graphics ("big keyword", "underline sweep", "emoji pop") (only plain text graphics can be drawn in chat)',
    ])
  })
  it('splits "does not include" items out of the reply', () => {
    expect(splitReply('Your video is ready. This draft does not include music, sound effects and some graphics.')).toEqual({
      text: 'Your video is ready.', notIncluded: ['music', 'sound effects', 'some graphics'],
    })
    expect(splitReply('Done.')).toEqual({ text: 'Done.', notIncluded: [] })
    expect(splitReply(null).text).toBe('')
  })
})
