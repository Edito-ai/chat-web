'use client'

import { Check, Loader2 } from 'lucide-react'
import { forwardRef } from 'react'
import { useT } from '@/i18n'
import { Button } from '@/components/ui'
import { TIER_PLANS, isLive } from '../lib/plans'
import { tierLabel } from '../lib/planView'
import type { BillingTier, SubscriptionInfo } from '../types'

/** Creator / Studio cards. Subscribe calls the checkout route; the free trial is offered on Creator when never subscribed. */
export const PlansSection = forwardRef<
  HTMLElement,
  {
    sub: SubscriptionInfo | null
    neverSubscribed: boolean
    busy: string | null
    onSubscribe: (tier: BillingTier) => void
    onTrial: () => void
  }
>(function PlansSection({ sub, neverSubscribed, busy, onSubscribe, onTrial }, ref) {
  const { t } = useT()
  const activeTier = sub && isLive(sub.status) ? sub.tier : null
  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="plans-h" data-testid="bill-plans" className="space-y-3 outline-none">
      <h3 id="plans-h" className="text-label font-medium text-ink-1">{t('acct.bill.plans')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {TIER_PLANS.map((p) => {
          const current = activeTier === p.tier
          return (
            <div key={p.tier} data-testid={`bill-plan-${p.tier}`} className="flex flex-col gap-3 rounded-xl border border-line bg-black/20 p-4">
              <div>
                <p className="text-body font-medium text-ink-0">{tierLabel(p.tier)}</p>
                <p className="mt-0.5 text-label text-ink-3">{t(p.blurb)}</p>
              </div>
              <p className="text-heading font-semibold text-ink-0">
                ${p.priceUsd}
                <span className="text-label font-normal text-ink-3"> {t('acct.bill.perMonth')}</span>
              </p>
              <ul className="space-y-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-label text-ink-2">
                    <Check size={12} strokeWidth={2} aria-hidden className="shrink-0 text-ink-3" /> {t(f)}
                  </li>
                ))}
              </ul>
              <div className="mt-auto space-y-2">
                {p.tier === 'creator' && neverSubscribed ? (
                  <>
                    <Button variant="primary" className="h-10 w-full" onClick={onTrial} disabled={busy !== null} data-testid="bill-trial">
                      {busy === 'trial' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                      {busy === 'trial' ? t('acct.bill.opening') : t('acct.bill.trial')}
                    </Button>
                    <button
                      type="button"
                      onClick={() => onSubscribe(p.tier)}
                      disabled={busy !== null}
                      data-testid="bill-subscribe-creator"
                      className="min-h-[28px] w-full text-center text-caption text-ink-3 underline decoration-dotted underline-offset-2 hover:text-ink-1 disabled:opacity-50"
                    >
                      {t('acct.bill.noTrial')}
                    </button>
                  </>
                ) : (
                  <Button
                    variant={current ? 'secondary' : 'primary'}
                    className="h-10 w-full"
                    onClick={() => onSubscribe(p.tier)}
                    disabled={current || busy !== null}
                    data-testid={`bill-subscribe-${p.tier}`}
                  >
                    {busy === p.tier ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                    {busy === p.tier ? t('acct.bill.opening') : current ? t('acct.bill.currentBadge') : t('acct.bill.subscribe')}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
})
