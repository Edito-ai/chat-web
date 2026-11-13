import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toLookChoice, toSnapshot } from '../chatApi'
import { applySnapshot, newAssistant } from '../chatState'
import { LookChoice } from '../LookChoice'
import type { ChatAssistantMessage, ChatJobSnapshot } from '../chatTypes'

const opts = [
  { id: 'depth', label: 'Behind you', desc: 'd', best: true, imageUrl: 'http://x/depth.jpg' },
  { id: 'bar', label: 'Bar', desc: 'b', best: false, imageUrl: 'http://x/bar.jpg' },
  { id: 'mix', label: 'Mixed', desc: 'm', best: false, imageUrl: 'http://x/mix.jpg' },
]
const open = { open: true, secondsLeft: 42, seconds: 60, options: opts }

describe('toLookChoice', () => {
  it('reads the offered styles and when the countdown was true', () => {
    const lc = toLookChoice(open, 1000)
    expect(lc).toMatchObject({ open: true, secondsLeft: 42, seconds: 60, receivedAt: 1000 })
    expect(lc?.options.map((o) => o.id)).toEqual(['depth', 'bar', 'mix'])
    expect(lc?.options[0]?.best).toBe(true)
  })

  it('is null when closed or absent; malformed templates are dropped; an empty stock still opens the link box', () => {
    expect(toLookChoice(null)).toBeNull()
    expect(toLookChoice({ ...open, open: false })).toBeNull()
    expect(toLookChoice({ ...open, options: [opts[0]!, { id: 'x' }] })?.options.map((o) => o.id)).toEqual(['depth'])
    expect(toLookChoice({ ...open, options: [] })?.options).toEqual([])
  })

  it('only comes through for a running job', () => {
    expect(toSnapshot({ id: 'j', state: 'planning', lookChoice: open }).lookChoice?.options).toHaveLength(3)
    expect(toSnapshot({ id: 'j', state: 'complete', lookChoice: open }).lookChoice).toBeNull()
  })
})

describe('applySnapshot and the look choice', () => {
  const snap = (over: Partial<ChatJobSnapshot>): ChatJobSnapshot => ({
    jobId: 'j1', status: 'running', stage: 'planning', progress: 0.3, message: null, result: null, error: null,
    turn: 1, reply: null, videoIds: [], canFollowUp: false, ...over,
  })

  it('shows the styles while they are on offer and drops them when the next poll has none', () => {
    const lc = toLookChoice(open, 1000)
    let m = applySnapshot([newAssistant('a1', 'j1')], snap({ lookChoice: lc }))
    expect((m[0] as ChatAssistantMessage).lookChoice?.options).toHaveLength(3)
    m = applySnapshot(m, snap({ lookChoice: null }))
    expect((m[0] as ChatAssistantMessage).lookChoice).toBeNull()
  })
})

describe('LookChoice card', () => {
  const msg = (over: Partial<ChatAssistantMessage> = {}): ChatAssistantMessage => ({
    ...(newAssistant('a1', 'j1') as ChatAssistantMessage), status: 'running', lookChoice: toLookChoice(open, Date.now()), ...over,
  })
  const html = (m: ChatAssistantMessage) => renderToStaticMarkup(createElement(LookChoice, { msg: m }))

  it('shows every style as a still of the video, tags only the best one, and counts down', () => {
    const out = html(msg())
    for (const o of opts) {
      expect(out).toContain(`data-testid="chat-look-${o.id}"`)
      expect(out).toContain(o.imageUrl)
    }
    expect(out.match(/>Best</g)).toHaveLength(1)
    expect(out).toMatch(/The best one is picked in \d+s/)
  })

  it('always offers a link box, an upload and a skip under the templates, also when the stock is empty', () => {
    for (const m of [msg(), msg({ lookChoice: toLookChoice({ ...open, options: [] }, Date.now()) })]) {
      const out = html(m)
      for (const id of ['chat-look-link', 'chat-look-link-use', 'chat-look-upload', 'chat-look-skip']) expect(out).toContain(`data-testid="${id}"`)
    }
    const empty = html(msg({ lookChoice: toLookChoice({ ...open, options: [] }, Date.now()) }))
    expect(empty).not.toContain('>Best<')
    expect(empty).toMatch(/Carrying on without a template in \d+s/)
  })

  it('renders nothing when no styles are on offer', () => {
    expect(html(msg({ lookChoice: null }))).toBe('')
    expect(html(msg({ lookChoice: { ...toLookChoice(open)!, open: false } }))).toBe('')
  })
})
