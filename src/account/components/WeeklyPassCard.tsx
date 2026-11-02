'use client'

import { Loader2, Zap } from 'lucide-react'
import { useT } from '@/i18n'
import { Button, InlineError } from '@/components/ui'
import { formatDate } from '../lib/planView'
import { formatMoney } from '../lib/usage'
import type { WeeklyPass, WeeklyPassPricing } from '../types'

/** The Weekly Pass offer with the backend's real, region-resolved price (never a local number). */
export function WeeklyPassCard({
  pricing,
  pricingError,
  onRetry,
  pass,
  busy,
  disabled,
  onBuy,
}: {
  pricing: WeeklyPassPricing | undefined
  pricingError: unknown
  onRetry: () => void
  pass: WeeklyPass | null | undefined
  busy: boolean
  disabled: boolean
  onBuy: () => void
}) {
  const { t, locale } = useT()
  const passNote =
    pass?.isActive && pass.expiresAt
      ? t('acct.bill.weeklyActive', { date: formatDate(pass.expiresAt, locale) })
      : pass?.status === 'pending'
        ? t('acct.bill.weeklyPending')
        : pass?.status === 'failed'
          ? t('acct.bill.weeklyFailed')
          : null
  return (
    <section data-testid="bill-weekly" aria-labelledby="weekly-h" className="flex flex-col gap-3 rounded-xl border border-line bg-black/20 p-4">
      <h3 id="weekly-h" className="flex items-center gap-2 text-body font-medium text-ink-0">
        <Zap size={15} strokeWidth={1.75} aria-hidden className="text-accent" /> {t('acct.bill.weekly')}
      </h3>
      <p className="text-label text-ink-3">{t('acct.bill.weeklyBlurb')}</p>
      {passNote ? <p className="text-label text-ink-1">{passNote}</p> : null}
      {pricing ? (
        <div>
          <p className="text-heading font-semibold text-ink-0" data-testid="bill-weekly-price">
            {formatMoney(pricing.totalAmount, pricing.currency)}
            <span className="text-label font-normal text-ink-3"> {t('acct.bill.perWeek')}</span>
          </p>
          {pricing.isIndianPricing ? (
            <p className="mt-1 text-caption text-ink-3">
              {t('acct.bill.weeklyBase')} {formatMoney(pricing.baseAmount, pricing.currency)} + {t('acct.bill.weeklyGst')}{' '}
              {formatMoney(pricing.gstAmount, pricing.currency)} = {t('acct.bill.weeklyTotalGst')}
            </p>
          ) : null}
        </div>
      ) : pricingError ? (
        <InlineError error={pricingError} onRetry={onRetry} />
      ) : (
        <Loader2 size={14} className="animate-spin text-ink-3" aria-label={t('common.loading')} />
      )}
      <Button variant="primary" className="h-10 w-full" onClick={onBuy} disabled={busy || disabled || !pricing} data-testid="bill-weekly-buy">
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
        {busy ? t('acct.bill.opening') : t('acct.bill.weeklyBuy')}
      </Button>
    </section>
  )
}
