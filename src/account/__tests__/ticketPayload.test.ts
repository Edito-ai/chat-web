import { describe, expect, it } from 'vitest'
import { buildTicket, isFutureSlot, type FeedbackForm } from '../lib/ticketPayload'

const base: FeedbackForm = {
  kind: 'bug',
  category: 'export',
  severity: 'high',
  subject: ' Export stuck ',
  message: ' It never finishes ',
  preferredAt: '',
  timezone: 'Asia/Kolkata',
  contact: '',
  attachDetails: true,
}
const details = { page: '/', userAgent: 'UA' }

describe('buildTicket', () => {
  it('keeps the chosen category and severity for a bug and attaches browser details', () => {
    const t = buildTicket(base, details)
    expect(t).toMatchObject({ category: 'export', severity: 'high', subject: 'Export stuck', message: 'It never finishes' })
    expect(t.diagnostics).toEqual({ source: 'chat-web', kind: 'bug', browser: details })
  })

  it('omits browser details when the person unticks them', () => {
    expect(buildTicket({ ...base, attachDetails: false }, details).diagnostics).toEqual({ source: 'chat-web', kind: 'bug' })
  })

  it('files a feature idea as a normal feature_request', () => {
    const t = buildTicket({ ...base, kind: 'feature', category: 'bug', severity: 'urgent' }, details)
    expect(t).toMatchObject({ category: 'feature_request', severity: 'normal', subject: '[Idea] Export stuck' })
  })

  it('stores a call request as a feature_request with the meeting slot', () => {
    const t = buildTicket({ ...base, kind: 'call', preferredAt: '2026-12-01T15:30', contact: ' +91 98 ' }, details)
    expect(t.category).toBe('feature_request')
    expect(t.subject).toBe('[Call] Export stuck')
    expect(t.diagnostics?.meeting).toEqual({ preferredAt: '2026-12-01T15:30', timezone: 'Asia/Kolkata', contact: '+91 98' })
  })

  it('never exceeds the 200 character subject limit', () => {
    expect(buildTicket({ ...base, kind: 'call', subject: 'x'.repeat(250) }, details).subject.length).toBe(200)
  })
})

describe('isFutureSlot', () => {
  const now = new Date('2026-12-01T10:00').getTime()
  it('needs a slot at least 30 minutes ahead', () => {
    expect(isFutureSlot('2026-12-01T10:10', now)).toBe(false)
    expect(isFutureSlot('2026-12-01T10:30', now)).toBe(true)
    expect(isFutureSlot('', now)).toBe(false)
  })
})
