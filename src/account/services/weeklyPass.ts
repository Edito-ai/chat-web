import { apiClient } from '@/lib/apiClient'
import type { WeeklyPass, WeeklyPassOrder, WeeklyPassPricing } from '../types'

/**
 * Local dev only: a backend on 127.0.0.1 cannot geolocate the caller, so it prices in USD, which the sandbox
 * merchant may not have enabled. The editor sends the same header; the backend ignores it in production.
 */
export function debugCountryHeaders(env: string | undefined = process.env.NODE_ENV): Record<string, string> | undefined {
  return env === 'development' ? { 'X-Debug-Country': 'IN' } : undefined
}

/** `GET /billing/weekly-pass/pricing`: the real, region-resolved price to show before buying. */
export function fetchWeeklyPassPricing(): Promise<WeeklyPassPricing> {
  return apiClient.get('/billing/weekly-pass/pricing', { headers: debugCountryHeaders() })
}

/** `POST /billing/weekly-pass/order`: starts a real order and returns the hosted checkout URL. Real money. */
export function createWeeklyPassOrder(): Promise<WeeklyPassOrder> {
  return apiClient.post('/billing/weekly-pass/order', undefined, { headers: debugCountryHeaders() })
}

/** `GET /billing/weekly-pass`: the most recent pass on the account, any status, or null. */
export async function fetchWeeklyPass(): Promise<WeeklyPass | null> {
  const res = await apiClient.get('/billing/weekly-pass')
  return (res?.weeklyPass as WeeklyPass | null | undefined) ?? null
}

/** `POST /billing/weekly-pass/{id}/sync`: asks the provider for the real outcome (does not charge). */
export function syncWeeklyPassOrder(orderId: string): Promise<WeeklyPass> {
  return apiClient.post(`/billing/weekly-pass/${encodeURIComponent(orderId)}/sync`)
}

const PENDING_KEY = 'edito.chat-web.pendingWeeklyPassOrder'

/** Remembers the order id so the next visit can reconcile it (the webhook usually wins; this is the fallback). */
export function rememberPendingOrder(orderId: string | null): void {
  try {
    if (orderId) localStorage.setItem(PENDING_KEY, orderId)
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    // storage blocked: the webhook still settles the pass
  }
}

export function pendingOrderId(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}
