'use client'

import clsx from 'clsx'
import { AlertCircle } from 'lucide-react'
import { useT } from '@/i18n'
import { formatDate } from '../lib/planView'
import { barPercent, formatTokens, meterTone } from '../lib/usage'
import type { TokenUsage } from '../types'

/** The real token ledger as a meter: used / limit, percentage, the period it covers, and the exceeded state. */
export function TokenMeter({ usage }: { usage: TokenUsage }) {
  const { t, locale } = useT()
  const pct = Math.round(usage.percentageUsed)
  const tone = meterTone(usage.percentageUsed, usage.isExceeded)
  const label = t('acct.usage.tokens')
  return (
    <section aria-label={label} data-testid="usage-tokens" data-tone={tone} className="rounded-xl border border-line bg-black/20 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-label font-medium text-ink-1">{label}</h3>
        <span className="text-caption text-ink-3">{usage.isWeekly ? t('acct.usage.weekly') : t('acct.usage.monthly')}</span>
      </div>
      <p className="mt-2 font-mono text-heading tabular-nums text-ink-0">
        {t('acct.usage.of', { used: formatTokens(usage.usedTokens), limit: formatTokens(usage.limitTokens) })}
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, pct)}
        aria-valuetext={t('acct.usage.pct', { pct })}
        className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]"
      >
        <div
          className={clsx('h-full rounded-full transition-[width]', tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warning' : 'bg-ink-0')}
          style={{ width: `${barPercent(usage.usedTokens, usage.percentageUsed)}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 text-caption text-ink-3">
        <span>{t('acct.usage.pct', { pct })}</span>
        <span>{t('acct.usage.period', { start: formatDate(usage.periodStart, locale), end: formatDate(usage.periodEnd, locale) })}</span>
      </div>
      {usage.isExceeded ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-label text-danger">
          <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
          {usage.isWeekly ? t('acct.usage.exceededWeekly') : t('acct.usage.exceeded')}
        </p>
      ) : null}
    </section>
  )
}
