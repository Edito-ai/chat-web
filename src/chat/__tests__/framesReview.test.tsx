import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toFramesReview, toSnapshot } from '../chatApi'
import { applySnapshot, newAssistant } from '../chatState'
import { FramesReview } from '../FramesReview'
import type { ChatAssistantMessage } from '../chatTypes'

const frames = [
  { n: 1, t: 1.5, template: 'talk', imageUrl: 'http://x/files/j/review/01.jpg' },
  { n: 2, t: 65, template: 'broll', imageUrl: 'http://x/files/j/review/02.jpg' },
]
const open = { open: true, secondsLeft: 540, seconds: 600, round: 1, frames }

describe('toFramesReview', () => {
  it('reads the frames, the round and the countdown', () => {
    const fr = toFramesReview(open, 1000)
    expect(fr).toMatchObject({ open: true, secondsLeft: 540, seconds: 600, round: 1, receivedAt: 1000 })
    expect(fr?.frames.map((f) => f.n)).toEqual([1, 2])
  })

  it('is null when closed, absent, or without a drawable frame', () => {
    expect(toFramesReview(null)).toBeNull()
    expect(toFramesReview({ ...open, open: false })).toBeNull()
    expect(toFramesReview({ ...open, frames: [{ n: 1 }] })).toBeNull()
  })

  it('only comes through for a running job, and leaves the message when the job finishes', () => {
    expect(toSnapshot({ id: 'j', state: 'planning', framesReview: open }).framesReview?.frames).toHaveLength(2)
    expect(toSnapshot({ id: 'j', state: 'complete', framesReview: open }).framesReview).toBeNull()
    let msgs = applySnapshot([newAssistant('a', 'j', 1)], toSnapshot({ id: 'j', state: 'planning', framesReview: open }))
    expect((msgs[0] as ChatAssistantMessage).framesReview?.round).toBe(1)
    msgs = applySnapshot(msgs, toSnapshot({ id: 'j', state: 'rendering' }))
    expect((msgs[0] as ChatAssistantMessage).framesReview).toBeNull()
  })
})

describe('FramesReview', () => {
  it('shows numbered frames with their time and a render button', () => {
    const msg = { ...newAssistant('a', 'j', 1), framesReview: toFramesReview(open, Date.now()) } as ChatAssistantMessage
    const html = renderToStaticMarkup(createElement(FramesReview, { msg }))
    expect(html).toContain('data-testid="chat-frame-1"')
    expect(html).toContain('data-testid="chat-frame-2"')
    expect(html).toContain('1:05')
    expect(html).toContain('data-testid="chat-frames-render"')
  })

  it('renders nothing without frames', () => {
    expect(renderToStaticMarkup(createElement(FramesReview, { msg: newAssistant('a', 'j', 1) }))).toBe('')
  })
})
