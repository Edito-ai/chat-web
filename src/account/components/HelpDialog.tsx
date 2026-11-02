'use client'

import clsx from 'clsx'
import { Search } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { useT, type MessageKey } from '@/i18n'
import { Button, InlineError } from '@/components/ui'
import { Dialog } from '@/components/Dialog'
import { accountApi } from '../accountApi'
import { useAccount } from '../accountStore'
import { TICKET_CATEGORIES, TICKET_SEVERITIES, type TicketCategory, type TicketSeverity } from '../types'

const FAQ = ['export', 'ai', 'billing', 'data'] as const
const FIELD = 'w-full rounded-lg bg-black/30 px-2.5 text-body text-ink-0 outline-none ring-1 ring-line placeholder:text-ink-4 focus:ring-line-strong'

function Faq() {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const entries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return FAQ.map((id) => ({ id, q: t(`acct.faq.${id}.q` as MessageKey), a: t(`acct.faq.${id}.a` as MessageKey) })).filter(
      (f) => !needle || f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, t('acct.faq.export.q')])
  return (
    <div className="space-y-3">
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

function ContactForm() {
  const { t } = useT()
  const ids = { cat: useId(), sev: useId(), sub: useId(), msg: useId() }
  const [category, setCategory] = useState<TicketCategory>('bug')
  const [severity, setSeverity] = useState<TicketSeverity>('normal')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ref, setRef] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (sending || !subject.trim() || !message.trim()) return
    setSending(true)
    setError(null)
    try {
      const ticket = await accountApi().createTicket({ category, severity, subject: subject.trim(), message: message.trim() })
      setRef(ticket.reference)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  if (ref !== null) {
    return (
      <div className="space-y-3">
        <p role="status" data-testid="help-sent" className="text-label text-ink-1">{t('acct.contact.sent', { ref })}</p>
        <Button
          onClick={() => {
            setRef(null)
            setSubject('')
            setMessage('')
          }}
        >
          {t('acct.contact.another')}
        </Button>
      </div>
    )
  }
  return (
    <form onSubmit={submit} data-testid="help-form" className="space-y-3">
      <p className="text-label text-ink-3">{t('acct.contact.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={ids.cat} className="text-caption text-ink-3">{t('acct.contact.category')}</label>
          <select id={ids.cat} value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)} className={clsx(FIELD, 'h-9')}>
            {TICKET_CATEGORIES.map((c) => (
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
      <div className="space-y-1">
        <label htmlFor={ids.sub} className="text-caption text-ink-3">{t('acct.contact.subject')}</label>
        <input id={ids.sub} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className={clsx(FIELD, 'h-9')} />
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.msg} className="text-caption text-ink-3">{t('acct.contact.message')}</label>
        <textarea id={ids.msg} value={message} maxLength={10000} rows={5} onChange={(e) => setMessage(e.target.value)} className={clsx(FIELD, 'py-2')} />
      </div>
      {error ? <InlineError message={t('acct.contact.failed', { reason: error })} /> : null}
      <Button type="submit" variant="primary" className="h-10 w-full" disabled={sending || !subject.trim() || !message.trim()} data-testid="help-submit">
        {sending ? t('acct.contact.sending') : t('acct.contact.submit')}
      </Button>
    </form>
  )
}

/** Help & support: a short FAQ and a contact form posting to the same support-ticket route the editor uses. */
export function HelpDialog() {
  const { t } = useT()
  const close = useAccount((s) => s.closeDialog)
  const [tab, setTab] = useState<'faq' | 'contact'>('faq')
  const tabs = [
    { id: 'faq', label: t('acct.help.tabFaq') },
    { id: 'contact', label: t('acct.help.tabContact') },
  ] as const
  return (
    <Dialog title={t('acct.help.title')} onClose={close} testId="dialog-help">
      <div role="tablist" className="mb-4 flex gap-1 rounded-lg bg-black/30 p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`help-tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls="help-panel"
            tabIndex={tab === x.id ? 0 : -1}
            onClick={() => setTab(x.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const next = tab === 'faq' ? 'contact' : 'faq'
                setTab(next)
                requestAnimationFrame(() => document.getElementById(`help-tab-${next}`)?.focus())
              }
            }}
            className={clsx('min-h-[32px] flex-1 rounded-md px-3 text-label font-medium transition-colors', tab === x.id ? 'bg-white/[0.1] text-ink-0' : 'text-ink-3 hover:text-ink-0')}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="help-panel" aria-labelledby={`help-tab-${tab}`}>
        {tab === 'faq' ? <Faq /> : <ContactForm />}
      </div>
    </Dialog>
  )
}
