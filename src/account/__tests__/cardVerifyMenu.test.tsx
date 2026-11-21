// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/auth/authStore'
import { ProfileMenu } from '@/chat/ProfileMenu'
import { setAccountApi } from '../accountApi'
import { useAccount } from '../accountStore'
import type { CardVerifyStatus } from '../types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const OFFER: CardVerifyStatus = { enabled: true, eligible: true, claimed: false, tokens: 1_000_000, amountInr: 1 }
let host: HTMLDivElement
let root: Root

const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))

function stub(status: CardVerifyStatus) {
  const api = {
    entitlement: vi.fn(async () => null),
    tokenUsage: vi.fn(async () => null),
    subscription: vi.fn(async () => ({ subscription: null, footageHoursUsed: 0, footageHoursCap: null, promptCountToday: 0, promptSoftCapPerDay: null })),
    freeCredit: vi.fn(async () => ({ enabled: false, claimed: false, tokens: 0, usd: 0, phoneMasked: null })),
    cardVerifyStatus: vi.fn(async () => status),
    cardVerifyOrder: vi.fn(async () => ({ orderId: 'o', keyId: 'k', amount: 100, currency: 'INR' })),
    openCardCheckout: vi.fn(async () => ({ razorpayOrderId: 'o', razorpayPaymentId: 'p', razorpaySignature: 's' })),
    cardVerifyConfirm: vi.fn(async () => ({ status: 'granted', tokens: 1_000_000 })),
  }
  setAccountApi(api as never)
  return api
}

async function openMenu() {
  await act(async () => root.render(createElement(ProfileMenu, { user: { name: 'Asha', email: 'asha@b.co' }, onSignOut: vi.fn() })))
  await act(async () => q('chat-profile-button')!.click())
  await flush()
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  setAccountApi(null)
  useAccount.getState().reset()
  useAuth.setState({ status: 'authenticated' })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  useAuth.setState({ status: 'unauthenticated' })
})

describe('"Claim with card" in the profile menu', () => {
  it('shows for an Indian account that has not claimed, right above "Take the tour"', async () => {
    stub(OFFER)
    await openMenu()
    const card = q('chat-menu-card-claim')
    const tour = q('chat-menu-tour')
    expect(card).not.toBeNull()
    expect(card!.compareDocumentPosition(tour!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card!.nextElementSibling).toBe(tour)
  })

  it.each([
    ['outside India', { ...OFFER, eligible: false }],
    ['already claimed', { ...OFFER, claimed: true }],
    ['switched off', { ...OFFER, enabled: false }],
  ])('is not there when %s', async (_n, status) => {
    stub(status)
    await openMenu()
    expect(q('chat-menu-card-claim')).toBeNull()
    expect(q('chat-menu-tour')).not.toBeNull()
  })

  it('pressing it opens Usage and starts the claim with the account email', async () => {
    const api = stub(OFFER)
    await openMenu()
    await act(async () => q('chat-menu-card-claim')!.click())
    await flush()
    expect(useAccount.getState().dialog).toBe('usage')
    expect(api.openCardCheckout).toHaveBeenCalledWith({ order: { orderId: 'o', keyId: 'k', amount: 100, currency: 'INR' }, email: 'asha@b.co' })
    expect(useAccount.getState().cardClaim.result).toBe('granted')
  })
})
