'use client'

import clsx from 'clsx'
import { Bug, CalendarClock, Lightbulb, Search } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { useT, type MessageKey } from '@/i18n'
import { userMessage } from '@/lib/friendlyError'
import { Button, InlineError } from '@/components/ui'
import { Dialog } from '@/components/Dialog'
import { accountApi } from '../accountApi'
import { useAccount, type HelpTab } from '../accountStore'
import type { HelpPrefill } from '../helpStore'
import { browserTimezone, buildTicket, isFutureSlot, type FeedbackKind } from '../lib/ticketPayload'
import { TICKET_SEVERITIES, type TicketCategory, type TicketSeverity } from '../types'

const FAQ = ['export', 'ai', 'billing', 'data'] as const
const BUG_CATEGORIES: TicketCategory[] = ['bug', 'ai_quality', 'export', 'performance', 'billing', 'account', 'other']
const FIELD = 'w-full rounded-lg bg-black/30 px-2.5 text-body text-ink-0 outline-none ring-1 ring-line placeholder:text-ink-4 focus:ring-line-strong'

function Faq({ onPick }: { onPick: (tab: HelpTab) => void }) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const entries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return FAQ.map((id) => ({ id, q: t(`acct.faq.${id}.q` as MessageKey), a: t(`acct.faq.${id}.a` as MessageKey) })).filter(
      (f) => !needle || f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, t('acct.faq.export.q')])
  const actions = [
    { id: 'bug', Icon: Bug, title: t('acct.help.tabBug'), sub: t('acct.help.cardBug') },
    { id: 'feature', Icon: Lightbulb, title: t('acct.help.tabFeature'), sub: t('acct.help.cardFeature') },
    { id: 'call', Icon: CalendarClock, title: t('acct.help.tabCall'), sub: t('acct.help.cardCall') },
  ] as const
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {actions.map(({ id, Icon, title, sub }) => (
          <button
            key={id}
            type="button"
            data-testid={`help-card-${id}`}
            onClick={() => onPick(id)}
            className="flex flex-col items-start gap-1.5 rounded-xl border border-line-strong bg-white/[0.04] p-3 text-left transition-colors hover:border-accent-line hover:bg-white/[0.09]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.1] text-ink-0"><Icon size={16} aria-hidden /></span>
            <span className="text-body font-semibold text-ink-0">{title}</span>
            <span className="text-caption leading-snug text-ink-3">{sub}</span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 rounded-lg bg-black/30 px-2.5 ring-1 ring-line focus-within:ring-line-strong">
        <Search size={13} aria-hidden className="text-ink-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('acct.faq.search')}
          aria-label={t('acct.faq.search')}
          className="h-9 w-full bg-transparent text-body text-ink-0 outline-none placeholder:text-ink-4"
        />
      </label>
      {entries.length === 0 ? (
        <p className="text-label text-ink-3">{t('acct.faq.empty')}</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((f) => (
            <details key={f.id} className="rounded-lg border border-line bg-black/20 px-3 py-2">
              <summary className="min-h-[24px] cursor-pointer text-label font-medium text-ink-0">{f.q}</summary>
              <p className="mt-2 text-label leading-relaxed text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}

/** One form for the three ways to reach us; `kind` decides the fields and the wording. All become support tickets. */
function FeedbackForm({ kind, prefill }: { kind: FeedbackKind; prefill?: HelpPrefill }) {
  const { t } = useT()
  const ids = { cat: useId(), sev: useId(), sub: useId(), msg: useId(), when: useId(), contact: useId() }
  const [category, setCategory] = useState<TicketCategory>('bug')
  const [severity, setSeverity] = useState<TicketSeverity>('normal')
  const [subject, setSubject] = useState(prefill?.subject ?? '')
  const [message, setMessage] = useState(prefill?.message ?? '')
  const [preferredAt, setPreferredAt] = useState('')
  const [contact, setContact] = useState('')
  const [attachDetails, setAttachDetails] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ref, setRef] = useState<string | null>(null)
  const timezone = useMemo(browserTimezone, [])
  const slotOk = kind !== 'call' || isFutureSlot(preferredAt)
  const canSend = !sending && !!subject.trim() && !!message.trim() && slotOk

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      const ticket = await accountApi().createTicket(
        buildTicket({ kind, category, severity, subject, message, preferredAt, timezone, contact, attachDetails, context: prefill?.context }),
      )
      setRef(ticket.reference)
    } catch (err) {
      setError(userMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (ref !== null) {
    return (
      <div className="space-y-3">
        <p role="status" data-testid="help-sent" className="text-label text-ink-1">
          {t(kind === 'call' ? 'acct.call.sent' : 'acct.contact.sent', { ref })}
        </p>
        <Button
          onClick={() => {
            setRef(null)
            setSubject('')
            setMessage('')
            setPreferredAt('')
          }}
        >
          {t('acct.contact.another')}
        </Button>
      </div>
    )
  }
  return (
    <form onSubmit={submit} data-testid="help-form" className="space-y-3">
      <p className="text-label text-ink-3">{t(`acct.${kind}.intro` as MessageKey)}</p>
      {kind === 'bug' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={ids.cat} className="text-caption text-ink-3">{t('acct.contact.category')}</label>
            <select id={ids.cat} value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)} className={clsx(FIELD, 'h-9')}>
              {BUG_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`acct.category.${c}` as MessageKey)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={ids.sev} className="text-caption text-ink-3">{t('acct.contact.severity')}</label>
            <select id={ids.sev} value={severity} onChange={(e) => setSeverity(e.target.value as TicketSeverity)} className={clsx(FIELD, 'h-9')}>
              {TICKET_SEVERITIES.map((s) => (
                <option key={s} value={s}>{t(`acct.severity.${s}` as MessageKey)}</option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
      <div className="space-y-1">
        <label htmlFor={ids.sub} className="text-caption text-ink-3">{t(`acct.${kind}.subject` as MessageKey)}</label>
        <input id={ids.sub} value={subject} maxLength={180} onChange={(e) => setSubject(e.target.value)} className={clsx(FIELD, 'h-9')} />
      </div>
      {kind === 'call' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={ids.when} className="text-caption text-ink-3">{t('acct.call.when', { tz: timezone })}</label>
            <input
              id={ids.when}
              type="datetime-local"
              value={preferredAt}
              onChange={(e) => setPreferredAt(e.target.value)}
              className={clsx(FIELD, 'h-9')}
              aria-invalid={preferredAt !== '' && !slotOk}
            />
            {preferredAt !== '' && !slotOk ? <p className="text-caption text-danger">{t('acct.call.past')}</p> : null}
          </div>
          <div className="space-y-1">
            <label htmlFor={ids.contact} className="text-caption text-ink-3">{t('acct.call.contact')}</label>
            <input id={ids.contact} value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} className={clsx(FIELD, 'h-9')} />
          </div>
        </div>
      ) : null}
      <div className="space-y-1">
        <label htmlFor={ids.msg} className="text-caption text-ink-3">{t(`acct.${kind}.message` as MessageKey)}</label>
        <textarea id={ids.msg} value={message} maxLength={10000} rows={5} onChange={(e) => setMessage(e.target.value)} className={clsx(FIELD, 'py-2')} />
      </div>
      {kind === 'bug' ? (
        <label className="flex items-start gap-2 text-caption text-ink-3">
          <input type="checkbox" checked={attachDetails} onChange={(e) => setAttachDetails(e.target.checked)} className="mt-0.5" />
          <span>{t('acct.bug.details')}</span>
        </label>
      ) : null}
      {error ? <InlineError message={t('acct.contact.failed', { reason: error })} /> : null}
      <Button type="submit" variant="primary" className="h-10 w-full" disabled={!canSend} data-testid="help-submit">
        {sending ? t('acct.contact.sending') : t(`acct.${kind}.submit` as MessageKey)}
      </Button>
    </form>
  )
}

/** Help & support: FAQ, report a bug, suggest a feature, book a call. Everything lands in the admin panel's Support inbox as a ticket. */
export function HelpDialog({ initialTab, prefill, onClose, returnFocusTo }: { initialTab?: HelpTab; prefill?: HelpPrefill; onClose?: () => void; returnFocusTo?: string } = {}) {
  const { t } = useT()
  const storeClose = useAccount((s) => s.closeDialog)
  const storeTab = useAccount((s) => s.helpTab)
  const close = onClose ?? storeClose
  const [tab, setTab] = useState<HelpTab>(initialTab ?? storeTab)
  const tabs = [
    { id: 'faq', label: t('acct.help.tabFaq'), Icon: Search },
    { id: 'bug', label: t('acct.help.tabBug'), Icon: Bug },
    { id: 'feature', label: t('acct.help.tabFeature'), Icon: Lightbulb },
    { id: 'call', label: t('acct.help.tabCall'), Icon: CalendarClock },
  ] as const
  const move = (dir: 1 | -1) => {
    const i = tabs.findIndex((x) => x.id === tab)
    const next = tabs[(i + dir + tabs.length) % tabs.length]!.id
    setTab(next)
    requestAnimationFrame(() => document.getElementById(`help-tab-${next}`)?.focus())
  }
  return (
    <Dialog title={t('acct.help.title')} onClose={close} testId="dialog-help" returnFocusTo={returnFocusTo}>
      <p className="mb-3 text-label text-ink-3">{t('acct.help.sub')}</p>
      <div role="tablist" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-black/40 p-1 sm:grid-cols-4">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`help-tab-${id}`}
            data-testid={`help-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="help-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(1)
              else if (e.key === 'ArrowLeft') move(-1)
            }}
            className={clsx('flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2 text-label font-medium transition-colors', tab === id ? 'bg-white text-black shadow-sm' : 'text-ink-3 hover:bg-white/[0.06] hover:text-ink-0')}
          >
            <Icon size={14} aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="help-panel" aria-labelledby={`help-tab-${tab}`}>
        {tab === 'faq' ? <Faq onPick={setTab} /> : <FeedbackForm key={tab} kind={tab} prefill={prefill} />}
      </div>
    </Dialog>
  )
}
