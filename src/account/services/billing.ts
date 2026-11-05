import { apiClient } from '@/lib/apiClient'
import type { BillingTier, Entitlement, FreeCreditStatus, SubscriptionInfo, SubscriptionUsage, TokenUsage } from '../types'

/** `GET /billing/entitlement`; `null` is the free state (no subscription, no active Weekly Pass). */
export async function fetchEntitlement(): Promise<Entitlement | null> {
  const res = await apiClient.get('/billing/entitlement')
  return (res?.entitlement as Entitlement | null | undefined) ?? null
}

/** `GET /billing/subscription`: the subscription (or null) plus footage hours and prompts used. */
export async function fetchSubscription(): Promise<SubscriptionUsage> {
  const res = await apiClient.get('/billing/subscription')
  return {
    subscription: res?.subscription ?? null,
    footageHoursUsed: Number(res?.footageHoursUsed ?? 0),
    footageHoursCap: typeof res?.footageHoursCap === 'number' ? res.footageHoursCap : null,
    promptCountToday: Number(res?.promptCountToday ?? 0),
    promptSoftCapPerDay: typeof res?.promptSoftCapPerDay === 'number' ? res.promptSoftCapPerDay : null,
  }
}

/** `GET /billing/token-usage`; `tokenUsage: null` means no active plan, not a 0/0 bar. */
export async function fetchTokenUsage(): Promise<TokenUsage | null> {
  const res = await apiClient.get('/billing/token-usage')
  return (res?.tokenUsage as TokenUsage | null | undefined) ?? null
}

/** Never throws on shape: anything unexpected reads as "nothing on offer". */
export function parseFreeCredit(raw: unknown): FreeCreditStatus {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    enabled: r.enabled === true,
    claimed: r.claimed === true,
    tokens: typeof r.tokens === 'number' ? r.tokens : 0,
    usd: typeof r.usd === 'number' ? r.usd : 0,
    phoneMasked: typeof r.phoneMasked === 'string' ? r.phoneMasked : null,
  }
}

export async function fetchFreeCredit(): Promise<FreeCreditStatus> {
  return parseFreeCredit(await apiClient.get('/billing/free-credit'))
}

/** `POST /billing/free-credit/claim {phone}`: needs a verified email; 400 bad number, 409 number already used. */
export async function claimFreeCredit(phone: string): Promise<FreeCreditStatus> {
  return parseFreeCredit(await apiClient.post('/billing/free-credit/claim', { phone }))
}

/** `POST /billing/checkout-session {tier}`: returns the hosted checkout URL. Real money; only call on a user click. */
export async function createCheckoutSession(tier: BillingTier): Promise<string> {
  const res = await apiClient.post('/billing/checkout-session', { tier })
  return String(res?.url ?? '')
}

/** `POST /billing/trial/checkout-session`: 30-day Creator trial; the device id is an abuse signal only. */
export async function startFreeTrial(deviceFingerprint: string, devicePlatform: 'web' | 'electron'): Promise<string> {
  const res = await apiClient.post('/billing/trial/checkout-session', { deviceFingerprint, devicePlatform })
  return String(res?.url ?? '')
}

/** `POST /billing/subscription/cancel`: the backend cancels with the payment provider right away. */
export async function cancelSubscription(): Promise<SubscriptionInfo> {
  const res = await apiClient.post('/billing/subscription/cancel')
  return res.subscription as SubscriptionInfo
}
