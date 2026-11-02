'use client'

import clsx from 'clsx'
import { Crown, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n'
import { useAccount } from '../accountStore'
import { formatDate, planView, tierLabel, timeLeft } from '../lib/planView'

/** The plan pill in the profile menu header: Free, Pro · Weekly, Pro · Monthly, or Trial with its end date. */
export function PlanBadge({ onUpgrade }: { onUpgrade: () => void }) {
  const { t, locale } = useT()
  const entitlement = useAccount((s) => s.entitlement)
  const status = useAccount((s) => s.status)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  if (status === 'idle' || (status === 'loading' && !entitlement)) {
    return <p className="mt-2 text-caption text-ink-4">{t('acct.plan.checking')}</p>
  }
  if (status === 'error' && !entitlement) return null

  const view = planView(entitlement)
  if (view.kind === 'free') {
    return (
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        data-testid="plan-badge"
        data-plan="free"
        onClick={onUpgrade}
        className="mt-2 flex min-h-[32px] w-full items-center justify-between rounded-lg border border-dashed border-line-strong px-2.5 text-caption text-ink-2 transition-colors hover:bg-white/[0.05] hover:text-ink-0"
      >
        <span>{t('acct.plan.free')}</span>
        <span className="font-medium text-accent">{t('acct.plan.upgrade')}</span>
      </button>
    )
  }

  const date = formatDate(view.expiresAt, locale)
  const tier = tierLabel(view.tier ?? '')
  let detail: string | null = null
  if (view.kind === 'weekly') {
    const left = view.expiresAt ? timeLeft(view.expiresAt, now) : null
    detail = !view.expiresAt
      ? null
      : !left
        ? t('acct.plan.expired')
        : left.days > 0
          ? t('acct.plan.left.dh', { d: left.days, h: left.hours })
          : left.hours > 0
            ? t('acct.plan.left.hm', { h: left.hours, m: left.minutes })
            : t('acct.plan.left.m', { m: left.minutes })
  } else if (view.kind === 'trial') {
    detail = date ? t('acct.plan.trialEnds', { tier, date }) : t('acct.plan.tier', { tier })
  } else {
    detail = date ? t('acct.plan.renews', { tier, date }) : t('acct.plan.tier', { tier })
  }
  const Icon = view.kind === 'weekly' ? Zap : Crown
  const label = t(`acct.plan.${view.kind}` as 'acct.plan.weekly')
  return (
    <div
      data-testid="plan-badge"
      data-plan={view.kind}
      aria-label={t('acct.plan.aria')}
      className={clsx('mt-2 rounded-lg border px-2.5 py-1.5', 'border-accent-line bg-accent-soft')}
    >
      <p className="flex items-center gap-1.5 text-caption font-semibold text-ink-0">
        <Icon size={11} strokeWidth={2.25} aria-hidden className="text-accent" />
        {label}
      </p>
      {detail ? <p className="mt-0.5 truncate text-caption text-ink-2">{detail}</p> : null}
    </div>
  )
}
