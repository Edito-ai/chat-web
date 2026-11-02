import { describe, expect, it } from 'vitest'
import { activeAssistant, applySnapshot, capMessages, finishLocally, knownStage, lastCompleted, newAssistant } from '../chatState'
import type { ChatJobSnapshot, ChatMessage } from '../chatTypes'

const snap = (over: Partial<ChatJobSnapshot> = {}): ChatJobSnapshot => ({
  jobId: 'j1', status: 'running', stage: 'planning', progress: 0.4, message: null, result: null, error: null,
  turn: 1, reply: null, videoIds: [], canFollowUp: false, ...over,
})
const result = { videoUrl: 'https://x/v.mp4', downloadUrl: null, fileName: null }
const start = (): ChatMessage[] => [newAssistant('a1', 'j1')]

describe('applySnapshot', () => {
  it('moves a message through running to complete with the result', () => {
    let m = applySnapshot(start(), snap())
    expect(m[0]).toMatchObject({ status: 'running', stage: 'planning', progress: 0.4 })
    m = applySnapshot(m, snap({ status: 'complete', result, progress: null }))
    expect(m[0]).toMatchObject({ status: 'complete', progress: 1, result })
  })

  it('never lets progress move backwards or a finished message reopen', () => {
    let m = applySnapshot(start(), snap({ progress: 0.7 }))
    m = applySnapshot(m, snap({ progress: 0.2 }))
    expect((m[0] as { progress: number }).progress).toBe(0.7)
    m = applySnapshot(m, snap({ status: 'complete', result }))
    m = applySnapshot(m, snap({ status: 'running' }))
    expect(m[0]).toMatchObject({ status: 'complete' })
  })

  it('treats complete without a video as a failure', () => {
    const m = applySnapshot(start(), snap({ status: 'complete', result: null }))
    expect(m[0]).toMatchObject({ status: 'failed', result: null })
  })

  it('only updates the message of the matching turn', () => {
    const m = applySnapshot([newAssistant('a1', 'j1', 2)], snap({ turn: 1, status: 'complete', result }))
    expect(m[0]).toMatchObject({ status: 'queued' })
  })

  it('records the server error on failure and ignores other jobs', () => {
    const m = applySnapshot(start(), snap({ status: 'failed', error: 'no speech' }))
    expect(m[0]).toMatchObject({ status: 'failed', error: 'no speech' })
    expect(applySnapshot(start(), snap({ jobId: 'other', status: 'complete', result }))[0]).toMatchObject({ status: 'queued' })
  })
})

describe('selectors and helpers', () => {
  it('finds the active and the last completed assistant message', () => {
    const done = applySnapshot(start(), snap({ status: 'complete', result }))
    const next = [...done, newAssistant('a2', 'j2')]
    expect(activeAssistant(next)?.jobId).toBe('j2')
    expect(lastCompleted(next)?.jobId).toBe('j1')
    expect(activeAssistant(done)).toBeNull()
  })

  it('finishLocally only touches unfinished jobs', () => {
    const done = applySnapshot(start(), snap({ status: 'complete', result }))
    expect(finishLocally(done, 'j1', 'cancelled')[0]).toMatchObject({ status: 'complete' })
    expect(finishLocally(start(), 'j1', 'cancelled')[0]).toMatchObject({ status: 'cancelled' })
  })

  it('caps the transcript to the newest messages and maps stages', () => {
    const many = Array.from({ length: 5 }, (_, i) => newAssistant(`a${i}`, `j${i}`))
    expect(capMessages(many, 3).map((m) => m.id)).toEqual(['a2', 'a3', 'a4'])
    expect(knownStage('rendering')).toBe('rendering')
    expect(knownStage('mystery')).toBeNull()
    expect(knownStage(null)).toBeNull()
  })
})
