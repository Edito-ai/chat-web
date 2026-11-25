import type { CreateTicketInput, TicketCategory, TicketSeverity } from '../types'

export type FeedbackKind = 'bug' | 'feature' | 'call'

export interface FeedbackForm {
  kind: FeedbackKind
  category: TicketCategory
  severity: TicketSeverity
  subject: string
  message: string
  /** `datetime-local` value ("2026-12-01T15:30"), call requests only. */
  preferredAt: string
  timezone: string
  /** How to reach the person (phone / WhatsApp / meeting link), call requests only. */
  contact: string
  attachDetails: boolean
  /** Extra facts about where the person was (a stuck job's id and stage). */
  context?: Record<string, unknown>
}

/** What the browser can tell us without asking. Shown to the person next to the checkbox, sent only when it stays ticked. */
export function browserDetails(): Record<string, string | number> {
  if (typeof window === 'undefined') return {}
  return {
    page: window.location.pathname,
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    sentAt: new Date().toISOString(),
  }
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Turns the form into the `POST /support/tickets` body. A call request is a feature-request ticket whose `diagnostics.meeting` the admin panel renders as a meeting. */
export function buildTicket(f: FeedbackForm, details: Record<string, string | number> = browserDetails()): CreateTicketInput {
  const diagnostics: Record<string, unknown> = { source: 'chat-web', kind: f.kind }
  if (f.attachDetails) diagnostics.browser = details
  if (f.context) diagnostics.context = f.context
  if (f.kind === 'call') {
    diagnostics.meeting = {
      preferredAt: f.preferredAt,
      timezone: f.timezone,
      contact: f.contact.trim() || null,
    }
  }
  return {
    category: f.kind === 'bug' ? f.category : 'feature_request',
    severity: f.kind === 'bug' ? f.severity : 'normal',
    subject: `${f.kind === 'call' ? '[Call] ' : f.kind === 'feature' ? '[Idea] ' : ''}${f.subject.trim()}`.slice(0, 200),
    message: f.message.trim(),
    diagnostics,
  }
}

/** A call must be booked for a time that is still ahead (at least `minMinutes` from now). */
export function isFutureSlot(value: string, now = Date.now(), minMinutes = 30): boolean {
  const t = new Date(value).getTime()
  return Number.isFinite(t) && t >= now + minMinutes * 60_000
}
