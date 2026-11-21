import { apiClient } from '@/lib/apiClient'
import { debugCountryHeaders } from './weeklyPass'
import type {
  BillingTier,
  CardVerifyOrder,
  CardVerifyPayment,
  CardVerifyResult,
  CardVerifyStatus,
  Entitlement,
  FreeCreditStatus,
  SubscriptionInfo,
  SubscriptionUsage,
  TokenUsage,
} from '../types'

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

/** Never throws on shape: anything unexpected reads as "not on offer" (so the button stays hidden). */
export function parseCardVerifyStatus(raw: unknown): CardVerifyStatus {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    enabled: r.enabled === true,
    eligible: r.eligible === true,
    claimed: r.claimed === true,
    tokens: typeof r.tokens === 'number' ? r.tokens : 0,
    amountInr: typeof r.amountInr === 'number' ? r.amountInr : 1,
  }
}

/** `GET /billing/card-verify/status`: shown only to people in India; the server decides, not the browser. */
export async function fetchCardVerifyStatus(): Promise<CardVerifyStatus> {
  return parseCardVerifyStatus(await apiClient.get('/billing/card-verify/status', { headers: debugCountryHeaders() }))
}

/** `POST /billing/card-verify/order`: a Rs.1 Razorpay order for the checkout modal (refunded after the credit is given). */
export async function createCardVerifyOrder(): Promise<CardVerifyOrder> {
  const res = await apiClient.post('/billing/card-verify/order', undefined, { headers: debugCountryHeaders() })
  return { orderId: String(res?.orderId ?? ''), keyId: String(res?.keyId ?? ''), amount: Number(res?.amount ?? 0), currency: String(res?.currency ?? 'INR') }
}

/** `POST /billing/card-verify/confirm`: the server re-reads the payment from Razorpay and gives the tokens once. */
export async function confirmCardVerify(payment: CardVerifyPayment): Promise<CardVerifyResult> {
  const res = await apiClient.post('/billing/card-verify/confirm', payment)
  return { status: String(res?.status ?? 'invalid'), tokens: Number(res?.tokens ?? 0) }
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
