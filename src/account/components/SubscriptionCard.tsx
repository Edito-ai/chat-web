'use client'

import { AlertCircle } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { formatDate, tierLabel } from '../lib/planView'
import { KNOWN_STATUSES } from '../lib/plans'
import type { SubscriptionInfo } from '../types'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-label text-ink-3">{label}</dt>
      <dd className="text-right text-label font-medium text-ink-0">{value}</dd>
    </div>
  )
}

/** The current subscription: tier, status, renewal or end date, trial end, cancelled note, last payment error as-is. */
export function SubscriptionCard({ sub }: { sub: SubscriptionInfo }) {
  const { t, locale } = useT()
  const status = (KNOWN_STATUSES as readonly string[]).includes(sub.status) ? t(`acct.bill.status.${sub.status}` as MessageKey) : sub.status
  const end = formatDate(sub.currentPeriodEnd, locale)
  const trialEnd = formatDate(sub.trialEnd, locale)
  const live = sub.status === 'active' || sub.status === 'trialing'
  return (
    <section data-testid="bill-current" aria-label={t('acct.bill.current')} className="rounded-xl border border-line bg-black/20 p-4">
      <h3 className="text-label font-medium text-ink-1">{t('acct.bill.current')}</h3>
      <dl className="mt-1 divide-y divide-line">
        <Row label={t('acct.bill.tier')} value={tierLabel(sub.tier)} />
        <Row label={t('acct.bill.status')} value={status} />
        {trialEnd && sub.isTrial ? <Row label={t('acct.bill.trialEnd')} value={trialEnd} /> : null}
        {end ? <Row label={live && !sub.cancelAtPeriodEnd ? t('acct.bill.renews') : t('acct.bill.ends')} value={end} /> : null}
      </dl>
      {sub.cancelAtPeriodEnd ? (
        <p data-testid="bill-cancel-note" className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-label text-warning">
          {end ? t('acct.bill.cancelNote', { date: end }) : t('acct.bill.cancelNoteNoDate')}
        </p>
      ) : null}
      {sub.lastPaymentError ? (
        <div role="alert" data-testid="bill-payment-error" className="mt-2 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-label text-danger">
          <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{t('acct.bill.payErr')}</p>
            <p className="break-words">{sub.lastPaymentError}</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
