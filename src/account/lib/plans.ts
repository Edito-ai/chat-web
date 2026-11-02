import type { BillingTier } from '../types'
import type { MessageKey } from '@/i18n'

/**
 * The two monthly tiers. The backend does NOT serve these prices on any route (they live in
 * backend features/billing/tiers.py TIER_CONFIG and are sent to the payment provider at checkout), and the editor's
 * PricingPage hard-codes the same numbers. Keep this in step with TIER_CONFIG; the Weekly Pass price, which the
 * backend does serve, is never hard-coded.
 */
export const TIER_PLANS: readonly { tier: BillingTier; priceUsd: number; blurb: MessageKey; features: readonly MessageKey[] }[] = [
  { tier: 'creator', priceUsd: 50, blurb: 'acct.plan.creator.blurb', features: ['acct.plan.f.ai', 'acct.plan.f.queue', 'acct.plan.f.style'] },
  { tier: 'studio', priceUsd: 100, blurb: 'acct.plan.studio.blurb', features: ['acct.plan.f.everything', 'acct.plan.f.caps', 'acct.plan.f.priority'] },
]

/** Subscription statuses the backend can report; anything else is shown as received. */
export const KNOWN_STATUSES = ['pending', 'active', 'trialing', 'past_due', 'canceled', 'expired', 'failed'] as const

/** A subscription that currently grants access (the editor treats exactly these as "on this tier"). */
export function isLive(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing'
}
