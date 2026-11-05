import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/apiClient'
import { setAccountApi } from '../accountApi'
import { useAccount } from '../accountStore'
import { claimErrorKind, isSubscriptionRequired, shouldShowCreditBanner, validatePhone } from '../lib/freeCredit'
import type { FreeCreditStatus } from '../types'

const offer: FreeCreditStatus = { enabled: true, claimed: false, tokens: 1_500_000, usd: 2, phoneMasked: null }

describe('validatePhone', () => {
  it('accepts international numbers and trims', () => {
    expect(validatePhone('  +91 98765-43210 ')).toEqual({ ok: true, phone: '+91 98765-43210' })
    expect(validatePhone('9876543210')).toMatchObject({ ok: true })
  })
  it('rejects empty, bad characters, too short and too long', () => {
    expect(validatePhone('   ')).toEqual({ ok: false, problem: 'empty' })
    expect(validatePhone('98765abc10')).toEqual({ ok: false, problem: 'chars' })
    expect(validatePhone('(98) 7654')).toEqual({ ok: false, problem: 'chars' })
    expect(validatePhone('12345')).toEqual({ ok: false, problem: 'short' })
    expect(validatePhone('1 2 3 4 5 6')).toEqual({ ok: false, problem: 'short' })
    expect(validatePhone('+' + '1'.repeat(24))).toEqual({ ok: false, problem: 'long' })
  })
})

describe('claimErrorKind', () => {
  it('maps 400, 409 and unverified accounts', () => {
    expect(claimErrorKind(new ApiError(400, '400 invalid phone')).kind).toBe('invalid')
    expect(claimErrorKind(new ApiError(409, '409 This phone number already received the free credit.')).kind).toBe('used')
    expect(claimErrorKind(new ApiError(403, '403 Verify your email first')).kind).toBe('notVerified')
  })
  it('shows other backend sentences plainly and network trouble in friendly words', () => {
    expect(claimErrorKind(new ApiError(404, '404 Free credit is not available')).message).toBe('Free credit is not available')
    expect(claimErrorKind(new TypeError('Failed to fetch')).message).toMatch(/reach the server/)
  })
})

describe('isSubscriptionRequired', () => {
  it('detects the 402 by reason or message, nothing else', () => {
    expect(isSubscriptionRequired(new ApiError(402, '402 x', { reason: 'subscription_required' }))).toBe(true)
    expect(isSubscriptionRequired(new ApiError(402, '402 An active subscription or Weekly Pass is required to use AI features.'))).toBe(true)
    expect(isSubscriptionRequired(new ApiError(402, '402 x', { reason: 'token_limit_exceeded' }))).toBe(false)
    expect(isSubscriptionRequired(new ApiError(500, 'subscription_required'))).toBe(false)
    expect(isSubscriptionRequired(null)).toBe(false)
  })
})

describe('shouldShowCreditBanner', () => {
  it('shows only for a loaded, enabled, unclaimed, undismissed offer', () => {
    expect(shouldShowCreditBanner(offer, 'loaded', false)).toBe(true)
    expect(shouldShowCreditBanner(offer, 'loading', false)).toBe(false)
    expect(shouldShowCreditBanner(offer, 'error', false)).toBe(false)
    expect(shouldShowCreditBanner(null, 'loaded', false)).toBe(false)
    expect(shouldShowCreditBanner({ ...offer, enabled: false }, 'loaded', false)).toBe(false)
    expect(shouldShowCreditBanner({ ...offer, claimed: true }, 'loaded', false)).toBe(false)
  })
  it('dismissal hides it unless a 402 nudges', () => {
    expect(shouldShowCreditBanner(offer, 'loaded', true)).toBe(false)
    expect(shouldShowCreditBanner(offer, 'loaded', true, true)).toBe(true)
    expect(shouldShowCreditBanner({ ...offer, claimed: true }, 'loaded', true, true)).toBe(false)
  })
})

describe('account store credit', () => {
  beforeEach(() => {
    setAccountApi(null)
    useAccount.getState().reset()
  })
  it('loads the offer; a failed fetch is just "error" with no offer', async () => {
    setAccountApi({ freeCredit: async () => offer })
    await useAccount.getState().loadFreeCredit()
    expect(useAccount.getState()).toMatchObject({ creditLoad: 'loaded', credit: { usd: 2 } })
    setAccountApi({ freeCredit: vi.fn().mockRejectedValue(new Error('down')) })
    useAccount.getState().reset()
    await useAccount.getState().loadFreeCredit()
    expect(useAccount.getState()).toMatchObject({ creditLoad: 'error', credit: null })
  })
  it('claiming stores the new status and refreshes the plan; a failure throws', async () => {
    const entitlement = vi.fn().mockResolvedValue({ kind: 'weekly', tier: 'weekly', isTrial: false, expiresAt: null })
    setAccountApi({ claimFreeCredit: async () => ({ ...offer, claimed: true }), entitlement })
    await useAccount.getState().claimFreeCredit('+91 9876543210')
    expect(useAccount.getState().credit?.claimed).toBe(true)
    expect(entitlement).toHaveBeenCalled()
    setAccountApi({ claimFreeCredit: vi.fn().mockRejectedValue(new ApiError(409, '409 used')) })
    await expect(useAccount.getState().claimFreeCredit('+91 9876543210')).rejects.toThrow('409')
  })
})
