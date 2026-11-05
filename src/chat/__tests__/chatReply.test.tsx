import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Bubble } from '../Messages'
import { applySnapshot } from '../chatState'
import { newAssistant } from '../chatState'
import type { ChatAssistantMessage, ChatJobSnapshot } from '../chatTypes'

// Mock data only: no network, no backend.
const reply = (over: Partial<ChatAssistantMessage> = {}): ChatAssistantMessage => ({
  ...newAssistant('a1', 'job-1', 1),
  kind: 'chat', status: 'complete', progress: 1,
  reply: 'I can do that, but I need something to work with.\n\nWhich do you prefer?',
  suggestions: [
    { id: 'upload', label: 'Upload footage', action: 'upload' },
    { id: 'generate', label: 'Make it with motion graphics and B-roll', action: 'send', prompt: 'x' },
  ],
  ...over,
})
const html = (m: ChatAssistantMessage, chips = true) => renderToStaticMarkup(createElement(Bubble, { msg: m, chips, onSuggest: () => undefined }))

describe('chat replies (mock data only)', () => {
  it('shows the words as paragraphs, with no progress card and no video', () => {
    const out = html(reply())
    expect(out).toContain('data-testid="chat-reply"')
    expect(out).toContain('I can do that, but I need something to work with.')
    expect(out).toContain('Which do you prefer?')
    expect(out).not.toContain('chat-progress')
    expect(out).not.toContain('<video')
    expect(out).not.toContain('An earlier version')
  })

  it('offers the quick replies on the newest message only', () => {
    expect(html(reply(), true)).toContain('data-testid="chat-chip-upload"')
    expect(html(reply(), true)).toContain('Make it with motion graphics and B-roll')
    expect(html(reply(), false)).not.toContain('chat-chip-upload')
  })

  it('shows typing dots while the reply is being written, not the edit progress card', () => {
    const out = html(reply({ status: 'running', reply: null, suggestions: [] }))
    expect(out).toContain('data-testid="chat-typing"')
    expect(out).not.toContain('chat-progress')
  })

  it('a reply-only turn that completes without a video is finished, not failed', () => {
    const snap: ChatJobSnapshot = {
      jobId: 'job-1', status: 'complete', stage: null, progress: 1, message: null, result: null, error: null, turn: 1,
      reply: 'Hi!', videoIds: [], canFollowUp: true, kind: 'chat', suggestions: [],
    }
    const [m] = applySnapshot([newAssistant('a1', 'job-1', 1)], snap) as ChatAssistantMessage[]
    expect(m).toMatchObject({ status: 'complete', kind: 'chat', reply: 'Hi!', result: null, error: null })
  })

  it('an edit that completes without a video is still a fault', () => {
    const snap: ChatJobSnapshot = {
      jobId: 'job-1', status: 'complete', stage: null, progress: 1, message: null, result: null, error: null, turn: 1,
      reply: null, videoIds: ['v'], canFollowUp: true, kind: 'initial', suggestions: [],
    }
    const [m] = applySnapshot([newAssistant('a1', 'job-1', 1)], snap) as ChatAssistantMessage[]
    expect(m?.status).toBe('failed')
  })

  it('never shows JSON, even for a reply an older version stored as JSON', () => {
    const stored = `{
  "reply": "Great, I will create a 30-second warm video."
}`
    const out = html(reply({ reply: stored }))
    expect(out).toContain('Great, I will create a 30-second warm video.')
    expect(out).not.toContain('{')
    expect(out).not.toContain('&quot;reply&quot;')
  })

  it('formats bullet lists and bold, and renders nothing else as markup', () => {
    const text = ['Here is the plan:', '', '- an **opening title**', '- warm coffee visuals', '', '<img src=x onerror=1>'].join('\n')
    const out = html(reply({ reply: text }))
    expect(out).toContain('<ul')
    expect(out).toContain('<strong class="font-semibold">opening title</strong>')
    expect(out).toContain('&lt;img src=x onerror=1&gt;')
    expect(out).not.toContain('<img src=x')
  })
})
