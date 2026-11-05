import { describe, expect, it } from 'vitest'
import { toActivity, toSnapshot } from '../chatApi'
import { applySnapshot, newAssistant } from '../chatState'
import { buildTranscript } from '../buildTranscript'
import { rebuildMessages } from '../history'
import type { ActivityEvent, ChatAssistantMessage } from '../chatTypes'

const T0 = 1_000_000
const ev = (id: string, kind: ActivityEvent['kind'], over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id, kind, title: id, detail: null, state: 'done', at: T0, endedAt: T0 + 1000, ...over,
})
const msg = (over: Partial<ChatAssistantMessage>): ChatAssistantMessage => ({ ...newAssistant('a', 'j', 1), status: 'running', ...over })

describe('buildTranscript', () => {
  it('falls back to the four-step timeline when the backend sent no activity', () => {
    const t = buildTranscript(msg({ stage: 'planning' }), T0)
    expect(t.source).toBe('timeline')
    expect(t.steps.map((s) => s.id)).toEqual(['analyzing', 'planning', 'assembling', 'rendering'])
    expect(t.blocks).toEqual([])
  })

  it('keeps order and folds consecutive tools into one block', () => {
    const t = buildTranscript(
      msg({
        activity: [
          ev('thought:review', 'thought'),
          ev('say:reading', 'say'),
          ev('tool:a', 'tool', { at: T0, endedAt: T0 + 4000 }),
          ev('tool:b', 'tool', { at: T0 + 4000, endedAt: T0 + 9000 }),
          ev('say:plan', 'say'),
          ev('tool:c', 'tool', { state: 'running', endedAt: null, at: T0 + 10_000 }),
        ],
      }),
      T0 + 12_500,
    )
    expect(t.source).toBe('activity')
    expect(t.blocks.map((b) => b.type)).toEqual(['thought', 'say', 'tools', 'say', 'tools'])
    expect(t.toolCount).toBe(3)
    const first = t.blocks[2]
    expect(first?.type === 'tools' && first.tools.map((x) => x.elapsedMs)).toEqual([4000, 5000])
    expect(t.live).toMatchObject({ id: 'tool:c', elapsedMs: 2500 })
  })

  it('shows a tool left running on a finished turn as done, failed or stopped, with no live line', () => {
    const running = ev('tool:r', 'tool', { state: 'running', endedAt: null })
    const status = (s: ChatAssistantMessage['status']) => {
      const t = buildTranscript(msg({ status: s, activity: [running], finishedAt: T0 + 3000 }), T0 + 99_000)
      const b = t.blocks[0]
      return { live: t.live, tool: b?.type === 'tools' ? b.tools[0] : null }
    }
    expect(status('complete').tool).toMatchObject({ status: 'done', elapsedMs: 3000 })
    expect(status('failed').tool?.status).toBe('failed')
    expect(status('cancelled').tool?.status).toBe('stopped')
    expect(status('failed').live).toBeNull()
  })

  it('uses the server duration for the total', () => {
    expect(buildTranscript(msg({ status: 'complete', durationSec: 12, activity: [ev('tool:a', 'tool')] }), 0).totalMs).toBe(12_000)
  })
})

describe('activity wire', () => {
  const wire = { id: 'tool:x', kind: 'tool', title: 'X', state: 'running', at: new Date(T0).toISOString() }
  it('parses events and drops malformed or unknown ones', () => {
    const out = toActivity([
      wire,
      { ...wire, id: 'bad-kind', kind: 'banner' },
      { ...wire, id: 'bad-state', state: 'paused' },
      { ...wire, id: 'bad-at', at: 'nope' },
    ])
    expect(out).toEqual([{ id: 'tool:x', kind: 'tool', title: 'X', detail: null, state: 'running', at: T0, endedAt: null }])
    expect(toActivity(undefined)).toEqual([])
  })

  it('rides on the snapshot and an older job gives []', () => {
    expect(toSnapshot({ id: 'j', state: 'planning', activity: [wire] }).activity).toHaveLength(1)
    expect(toSnapshot({ id: 'j', state: 'planning' }).activity).toEqual([])
  })

  it('applySnapshot keeps the last transcript when a poll carries none, and replaces it when it does', () => {
    const a = newAssistant('a', 'j', 1)
    const first = toSnapshot({ id: 'j', state: 'planning', turn: 1, activity: [wire] })
    const m1 = applySnapshot([a], first)[0] as ChatAssistantMessage
    expect(m1.activity).toHaveLength(1)
    const m2 = applySnapshot([m1], toSnapshot({ id: 'j', state: 'planning', turn: 1 }))[0] as ChatAssistantMessage
    expect(m2.activity).toHaveLength(1)
    const m3 = applySnapshot([m2], toSnapshot({ id: 'j', state: 'planning', turn: 1, activity: [wire, { ...wire, id: 'tool:y' }] }))[0] as ChatAssistantMessage
    expect(m3.activity).toHaveLength(2)
  })

  it('a reloaded running job rebuilds its transcript', () => {
    const m = rebuildMessages({ id: 'j', state: 'planning', turn: 1, title: 'reel', turns: [], activity: [wire] })
    const a = m[m.length - 1] as ChatAssistantMessage
    expect(a.activity?.[0]?.id).toBe('tool:x')
  })
})
