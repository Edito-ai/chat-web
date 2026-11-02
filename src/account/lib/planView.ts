import type { Entitlement } from '../types'

/** What the profile badge says about the plan. Pure; strings are looked up by the component. */
export type PlanKind = 'free' | 'weekly' | 'monthly' | 'trial'

export interface PlanView {
  kind: PlanKind
  tier: string | null
  expiresAt: string | null
}

/** `null` (no active subscription or pass) is the free plan. A trial wins over "monthly" so it is never mislabelled. */
export function planView(e: Entitlement | null): PlanView {
  if (!e) return { kind: 'free', tier: null, expiresAt: null }
  if (e.kind === 'weekly') return { kind: 'weekly', tier: 'weekly', expiresAt: e.expiresAt }
  return { kind: e.isTrial ? 'trial' : 'monthly', tier: e.tier, expiresAt: e.expiresAt }
}

export function tierLabel(tier: string): string {
  const known: Record<string, string> = { creator: 'Creator', studio: 'Studio', weekly: 'Weekly Pass' }
  return known[tier] ?? (tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : tier)
}

export interface TimeLeft {
  days: number
  hours: number
  minutes: number
}

/** Time until `iso`, or null once past or unparsable. */
export function timeLeft(iso: string, now: number): TimeLeft | null {
  const ms = new Date(iso).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return null
  const total = Math.floor(ms / 60_000)
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 }
}

/** Short date in the UI language; empty string for a missing or invalid value. */
export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}
