'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react'
import { useT } from '@/i18n'
import { useAuth } from '@/auth/authStore'
import { InlineError } from '@/components/ui'
import { Dialog } from '@/components/Dialog'
import { accountApi } from '../accountApi'
import { useAccount } from '../accountStore'
import { getDeviceFingerprint } from '../lib/deviceId'
import { formatDate } from '../lib/planView'
import { pendingOrderId, rememberPendingOrder } from '../services/weeklyPass'
import { useAsync } from '../useAsync'
import { useCheckout } from '../useCheckout'
import type { BillingTier } from '../types'
import { CancelPanel } from './CancelPanel'
import { PlansSection } from './PlansSection'
import { SubscriptionCard } from './SubscriptionCard'
import { WeeklyPassCard } from './WeeklyPassCard'

/**
 * Plan & billing: the current subscription, the two monthly plans, the Weekly Pass with its real price, and a
 * confirmed cancel. Every money action is a button press; checkout opens in a new tab and nothing is called on load
 * except reads (and a reconcile of a Weekly Pass order this browser started earlier).
 */
export function BillingDialog() {
  const { t, locale } = useT()
  const close = useAccount((s) => s.closeDialog)
  const focus = useAccount((s) => s.billingFocus)
  const refreshPlan = useAccount((s) => s.refresh)
  const email = useAuth((s) => s.user?.email ?? null)
  const sub = useAsync(() => accountApi().subscription())
  const pricing = useAsync(() => accountApi().weeklyPricing())
  const pass = useAsync(async () => {
    const orderId = pendingOrderId()
    if (orderId) {
      try {
        const synced = await accountApi().weeklySync(orderId)
        if (synced.status !== 'pending') rememberPendingOrder(null)
        void refreshPlan()
      } catch {
        // the webhook is the primary path; fall through to the plain status read
      }
    }
    return accountApi().weeklyStatus()
  })
  const checkout = useCheckout({ unsafe: t('acct.bill.unsafeUrl') })
  const plansRef = useRef<HTMLElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<unknown>(null)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    if (focus === 'plans' && !sub.loading) plansRef.current?.scrollIntoView({ block: 'start' })
  }, [focus, sub.loading])

  const subscription = sub.data?.subscription ?? null
  const neverSubscribed = sub.data !== undefined && subscription === null
  const cancellable = subscription !== null && ['active', 'trialing', 'past_due'].includes(subscription.status) && !cancelled && !subscription.cancelAtPeriodEnd
  const refreshAll = () => {
    sub.reload()
    pass.reload()
    void refreshPlan()
  }

  const subscribe = (tier: BillingTier) => void checkout.run(tier, () => accountApi().checkout(tier))
  const trial = () =>
    void checkout.run('trial', async () => {
      const { fingerprint, platform } = await getDeviceFingerprint()
      return accountApi().trial(fingerprint, platform)
    })
  const buyWeekly = () =>
    void checkout.run('weekly', async () => {
      const order = await accountApi().weeklyOrder()
      rememberPendingOrder(order.orderId)
      return order.checkoutUrl
    })

  const doCancel = async () => {
    setCancelling(true)
    setCancelError(null)
    try {
      await accountApi().cancel()
      setCancelled(true)
      setConfirming(false)
      sub.reload()
      void refreshPlan()
    } catch (e) {
      setCancelError(e)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Dialog
      title={t('acct.bill.title')}
      onClose={close}
      testId="dialog-billing"
      headerExtra={
        <button
          type="button"
          onClick={refreshAll}
          aria-label={t('acct.bill.refresh')}
          title={t('acct.bill.refresh')}
          data-testid="bill-refresh"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink-0"
        >
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden className={sub.loading ? 'animate-spin' : undefined} />
        </button>
      }
    >
      <div className="space-y-4">
        {sub.error ? <InlineError message={t('acct.bill.loadError')} onRetry={sub.reload} /> : null}
        {cancelled ? <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-label text-success">{t('acct.bill.cancelled')}</p> : null}

        {subscription ? (
          <SubscriptionCard sub={subscription} />
        ) : sub.data ? (
          <p data-testid="bill-none" className="text-label text-ink-3">{t('acct.bill.none')}</p>
        ) : null}

        {cancellable && !confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            data-testid="bill-cancel"
            className="min-h-[32px] text-label text-danger underline decoration-dotted underline-offset-2 hover:opacity-80"
          >
            {t('acct.bill.cancel')}
          </button>
        ) : null}
        {confirming && subscription ? (
          <CancelPanel
            endDate={formatDate(subscription.currentPeriodEnd, locale)}
            busy={cancelling}
            error={cancelError}
            onKeep={() => {
              setConfirming(false)
              setCancelError(null)
            }}
            onConfirm={() => void doCancel()}
          />
        ) : null}

        <PlansSection ref={plansRef} sub={subscription} neverSubscribed={neverSubscribed} busy={checkout.busy} onSubscribe={subscribe} onTrial={trial} />
        <WeeklyPassCard
          pricing={pricing.data}
          pricingError={pricing.error}
          onRetry={pricing.reload}
          pass={pass.data}
          busy={checkout.busy === 'weekly'}
          disabled={checkout.busy !== null}
          onBuy={buyWeekly}
        />

        {checkout.error ? <InlineError error={checkout.error} /> : null}
        {checkout.url ? (
          <div role="status" data-testid="bill-opened" className="space-y-1 rounded-lg bg-white/[0.04] px-3 py-2 text-label text-ink-2">
            <p>{t('acct.bill.opened')}</p>
            <a href={checkout.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[28px] items-center gap-1 text-accent underline underline-offset-2">
              {t('acct.bill.openAgain')} <ExternalLink size={12} aria-hidden />
            </a>
          </div>
        ) : null}

        {email ? <p className="text-caption text-ink-3">{t('acct.bill.billedTo', { email })}</p> : null}
        <p className="flex items-center gap-1.5 text-caption text-ink-4">
          <ShieldCheck size={12} strokeWidth={1.75} aria-hidden /> {t('acct.bill.secure')}
        </p>
      </div>
    </Dialog>
  )
}
