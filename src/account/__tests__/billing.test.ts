import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
vi.mock('@/lib/apiClient', () => ({
  apiClient: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
  fetchOrExplain: (url: string, init?: RequestInit) => fetch(url, init),
}))

import { cancelSubscription, createCheckoutSession, fetchEntitlement, fetchFreeCredit, fetchSubscription, fetchTokenUsage, parseFreeCredit, startFreeTrial } from '../services/billing'
import { createWeeklyPassOrder, debugCountryHeaders, fetchWeeklyPass, fetchWeeklyPassPricing, syncWeeklyPassOrder } from '../services/weeklyPass'

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('billing reads', () => {
  it('entitlement null is the free state', async () => {
    get.mockResolvedValue({ entitlement: null })
    expect(await fetchEntitlement()).toBeNull()
    expect(get).toHaveBeenCalledWith('/billing/entitlement')
  })

  it('passes a real entitlement through', async () => {
    const e = { kind: 'weekly', tier: 'weekly', isTrial: false, expiresAt: '2026-11-09T00:00:00Z' }
    get.mockResolvedValue({ entitlement: e })
    expect(await fetchEntitlement()).toEqual(e)
  })

  it('token usage null means no plan (not a 0/0 ledger)', async () => {
    get.mockResolvedValue({ tokenUsage: null })
    expect(await fetchTokenUsage()).toBeNull()
    expect(get).toHaveBeenCalledWith('/billing/token-usage')
  })

  it('subscription usage normalises missing caps to null', async () => {
    get.mockResolvedValue({ subscription: null, footageHoursUsed: 1.5, promptCountToday: 4 })
    expect(await fetchSubscription()).toEqual({ subscription: null, footageHoursUsed: 1.5, footageHoursCap: null, promptCountToday: 4, promptSoftCapPerDay: null })
  })

  it('free credit parses defensively', async () => {
    expect(parseFreeCredit(null)).toEqual({ enabled: false, claimed: false, tokens: 0, usd: 0, phoneMasked: null })
    get.mockResolvedValue({ enabled: true, claimed: false, tokens: 1500000, usd: 2, phoneMasked: null })
    expect((await fetchFreeCredit()).tokens).toBe(1500000)
    expect(get).toHaveBeenCalledWith('/billing/free-credit')
  })
})

describe('money calls (mocked, never a real backend)', () => {
  it('checkout posts the tier and returns the url', async () => {
    post.mockResolvedValue({ url: 'https://pay.example/c/1' })
    expect(await createCheckoutSession('studio')).toBe('https://pay.example/c/1')
    expect(post).toHaveBeenCalledWith('/billing/checkout-session', { tier: 'studio' })
  })

  it('trial posts only the device fingerprint and platform', async () => {
    post.mockResolvedValue({ url: 'https://pay.example/t' })
    await startFreeTrial('abc', 'web')
    expect(post).toHaveBeenCalledWith('/billing/trial/checkout-session', { deviceFingerprint: 'abc', devicePlatform: 'web' })
  })

  it('cancel posts to the cancel route and returns the subscription', async () => {
    post.mockResolvedValue({ subscription: { id: 's', status: 'canceled' } })
    expect((await cancelSubscription()).status).toBe('canceled')
    expect(post).toHaveBeenCalledWith('/billing/subscription/cancel')
  })

  it('weekly pass order posts with no body', async () => {
    post.mockResolvedValue({ orderId: 'o1', checkoutUrl: 'https://pay.example/o1', pricing: {} })
    expect((await createWeeklyPassOrder()).orderId).toBe('o1')
    expect(post.mock.calls[0]![0]).toBe('/billing/weekly-pass/order')
    expect(post.mock.calls[0]![1]).toBeUndefined()
  })

  it('weekly pass sync encodes the order id', async () => {
    post.mockResolvedValue({ id: 'x', status: 'active' })
    await syncWeeklyPassOrder('a/b c')
    expect(post).toHaveBeenCalledWith('/billing/weekly-pass/a%2Fb%20c/sync')
  })
})

describe('weekly pass reads', () => {
  it('pricing is whatever the backend says', async () => {
    const p = { currency: 'INR', baseAmount: 1, gstAmount: 0.18, totalAmount: 1.18, isIndianPricing: true, resolvedCountryCode: 'IN' }
    get.mockResolvedValue(p)
    expect(await fetchWeeklyPassPricing()).toEqual(p)
    expect(get.mock.calls[0]![0]).toBe('/billing/weekly-pass/pricing')
  })

  it('status unwraps the latest pass or null', async () => {
    get.mockResolvedValue({ weeklyPass: null })
    expect(await fetchWeeklyPass()).toBeNull()
  })

  it('the simulated-country header is sent in development only', () => {
    expect(debugCountryHeaders('development')).toEqual({ 'X-Debug-Country': 'IN' })
    expect(debugCountryHeaders('production')).toBeUndefined()
    expect(debugCountryHeaders('test')).toBeUndefined()
  })
})
