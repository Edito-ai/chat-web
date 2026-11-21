// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '@/i18n'
import { ApiError } from '@/lib/apiClient'
import { setAccountApi } from '../accountApi'
import { useAccount } from '../accountStore'
import { UsageDialog } from '../components/UsageDialog'
import { CheckoutDismissed, openCardCheckout } from '../lib/razorpayCheckout'
import { parseCardVerifyStatus } from '../services/billing'
import type { CardVerifyOrder, CardVerifyPayment, CardVerifyStatus } from '../types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ORDER: CardVerifyOrder = { orderId: 'order_1', keyId: 'rzp_test_x', amount: 100, currency: 'INR' }
const PAID: CardVerifyPayment = { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' }
const OFFER: CardVerifyStatus = { enabled: true, eligible: true, claimed: false, tokens: 1_000_000, amountInr: 1 }
const T = (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate('en', k, p)

let host: HTMLDivElement
let root: Root

function stubApi(over: Record<string, unknown> = {}) {
  const api = {
    tokenUsage: vi.fn(async () => null),
    subscription: vi.fn(async () => ({ subscription: null, footageHoursUsed: 0, footageHoursCap: null, promptCountToday: 0, promptSoftCapPerDay: null })),
    freeCredit: vi.fn(async () => ({ enabled: false, claimed: false, tokens: 0, usd: 0, phoneMasked: null })),
    entitlement: vi.fn(async () => null),
    cardVerifyStatus: vi.fn(async () => OFFER),
    cardVerifyOrder: vi.fn(async () => ORDER),
    openCardCheckout: vi.fn(async () => PAID),
    cardVerifyConfirm: vi.fn(async () => ({ status: 'granted', tokens: 1_000_000 })),
    ...over,
  }
  setAccountApi(api as never)
  return api
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  setAccountApi(null)
  useAccount.getState().reset()
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  delete (window as { Razorpay?: unknown }).Razorpay
})

const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`)
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))

describe('the status from the server', () => {
  it('anything unexpected reads as "not on offer", so the button stays hidden', () => {
    expect(parseCardVerifyStatus(undefined)).toEqual({ enabled: false, eligible: false, claimed: false, tokens: 0, amountInr: 1 })
    expect(parseCardVerifyStatus({ enabled: 'yes', eligible: 1 }).eligible).toBe(false)
    expect(parseCardVerifyStatus({ enabled: true, eligible: true, claimed: false, tokens: 1_000_000, amountInr: 1 })).toEqual(OFFER)
  })
})

describe('the claim flow in the store', () => {
  it('order -> checkout -> confirm, then the status and the allowance are read again', async () => {
    const api = stubApi()
    await useAccount.getState().loadCardVerify()
    await useAccount.getState().claimWithCard('a@b.co')
    expect(api.cardVerifyOrder).toHaveBeenCalledTimes(1)
    expect(api.openCardCheckout).toHaveBeenCalledWith({ order: ORDER, email: 'a@b.co' })
    expect(api.cardVerifyConfirm).toHaveBeenCalledWith(PAID)
    expect(useAccount.getState().cardClaim).toEqual({ phase: 'done', result: 'granted', error: null })
    await flush()
    expect(api.cardVerifyStatus).toHaveBeenCalledTimes(2) // loaded once, then again after the claim
    expect(api.tokenUsage).toHaveBeenCalled()
  })

  it('closing the checkout is not an error and nothing is confirmed', async () => {
    const api = stubApi({ openCardCheckout: vi.fn(async () => Promise.reject(new CheckoutDismissed())) })
    await useAccount.getState().claimWithCard()
    expect(useAccount.getState().cardClaim).toEqual({ phase: 'idle', result: null, error: null })
    expect(api.cardVerifyConfirm).not.toHaveBeenCalled()
  })

  it('a failure becomes a sentence for the person, never a status code', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    stubApi({ cardVerifyOrder: vi.fn(async () => Promise.reject(new ApiError(500, '500 Internal server error'))) })
    await useAccount.getState().claimWithCard()
    const { cardClaim } = useAccount.getState()
    expect(cardClaim.phase).toBe('error')
    expect(cardClaim.error).not.toMatch(/500|Internal/)
    vi.unstubAllEnvs()
  })

  it('a second press while one is running does nothing', async () => {
    let release: (p: CardVerifyPayment) => void = () => undefined
    const api = stubApi({ openCardCheckout: vi.fn(() => new Promise<CardVerifyPayment>((r) => (release = r))) })
    const first = useAccount.getState().claimWithCard()
    await flush()
    expect(useAccount.getState().cardClaim.phase).toBe('opening')
    await useAccount.getState().claimWithCard()
    expect(api.cardVerifyOrder).toHaveBeenCalledTimes(1)
    release(PAID)
    await first
    expect(useAccount.getState().cardClaim.result).toBe('granted')
  })

  it('a status that cannot be read leaves no button instead of an error', async () => {
    stubApi({ cardVerifyStatus: vi.fn(async () => Promise.reject(new Error('down'))) })
    await useAccount.getState().loadCardVerify()
    expect(useAccount.getState()).toMatchObject({ cardVerify: null, cardVerifyLoad: 'error' })
  })

  it('the status is asked once per session unless forced, and reset clears it', async () => {
    const api = stubApi()
    await useAccount.getState().loadCardVerify()
    await useAccount.getState().loadCardVerify()
    expect(api.cardVerifyStatus).toHaveBeenCalledTimes(1)
    await useAccount.getState().loadCardVerify(true)
    expect(api.cardVerifyStatus).toHaveBeenCalledTimes(2)
    useAccount.getState().reset()
    expect(useAccount.getState()).toMatchObject({ cardVerify: null, cardVerifyLoad: 'idle' })
  })
})

describe('the Usage dialog', () => {
  async function open() {
    await act(async () => root.render(createElement(UsageDialog)))
    await flush()
  }

  it('shows the card section with a claim button to an Indian account that has not claimed', async () => {
    stubApi()
    await open()
    expect(q('usage-card')).not.toBeNull()
    expect(q('usage-card')!.textContent).toContain(T('acct.card.title'))
    expect(q('usage-card-claim')).not.toBeNull()
  })

  it.each([
    ['outside India', { ...OFFER, eligible: false }],
    ['switched off', { ...OFFER, enabled: false }],
  ])('shows nothing when %s', async (_n, status) => {
    stubApi({ cardVerifyStatus: vi.fn(async () => status) })
    await open()
    expect(q('usage-card')).toBeNull()
    expect(q('usage-card-claim')).toBeNull()
  })

  it('an account that already claimed sees the note and no button', async () => {
    stubApi({ cardVerifyStatus: vi.fn(async () => ({ ...OFFER, claimed: true })) })
    await open()
    expect(q('usage-card-claimed')).not.toBeNull()
    expect(q('usage-card-claim')).toBeNull()
  })

  it('pressing the button runs the flow and then says the tokens were added', async () => {
    const api = stubApi()
    await open()
    await act(async () => (q('usage-card-claim') as HTMLButtonElement).click())
    await flush()
    expect(api.cardVerifyConfirm).toHaveBeenCalledTimes(1)
    expect(q('usage-card-result')!.textContent).toContain('tokens were added')
    expect(q('usage-card-claim')).toBeNull() // no second claim from the same screen
  })

  it('a refused card says why and keeps the money story clear', async () => {
    stubApi({ cardVerifyConfirm: vi.fn(async () => ({ status: 'card_in_use', tokens: 0 })) })
    await open()
    await act(async () => (q('usage-card-claim') as HTMLButtonElement).click())
    await flush()
    expect(q('usage-card-result')!.textContent).toBe(T('acct.card.card_in_use', { amount: '', inr: 1 }).replace('  ', ' '))
  })
})

describe('the Razorpay checkout', () => {
  it('opens the modal with the server order, card and UPI only, and resolves with the signed payment', async () => {
    let options: Record<string, any> = {}
    const open = vi.fn()
    ;(window as unknown as { Razorpay: unknown }).Razorpay = function (this: unknown, o: Record<string, unknown>) {
      options = o
      return { open }
    }
    const pending = openCardCheckout({ order: ORDER, email: 'a@b.co' })
    await flush()
    expect(open).toHaveBeenCalledTimes(1)
    expect(options).toMatchObject({ key: 'rzp_test_x', order_id: 'order_1', amount: 100, currency: 'INR', prefill: { email: 'a@b.co' } })
    expect(options.method).toMatchObject({ card: true, upi: true, netbanking: false, wallet: false })
    options.handler({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' })
    await expect(pending).resolves.toEqual(PAID)
  })

  it('closing the window rejects with CheckoutDismissed', async () => {
    let options: Record<string, any> = {}
    ;(window as unknown as { Razorpay: unknown }).Razorpay = function (this: unknown, o: Record<string, unknown>) {
      options = o
      return { open: vi.fn() }
    }
    const pending = openCardCheckout({ order: ORDER })
    await flush()
    options.modal.ondismiss()
    await expect(pending).rejects.toBeInstanceOf(CheckoutDismissed)
  })
})
