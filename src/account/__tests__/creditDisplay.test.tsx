// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanBadge } from '../components/PlanBadge'
import { TokenMeter } from '../components/TokenMeter'
import { useAccount } from '../accountStore'
import { setAccountApi, accountApi } from '../accountApi'
import { translate } from '@/i18n'
import type { TokenUsage } from '../types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CREDIT: TokenUsage = {
  usedTokens: 38_000, limitTokens: 750_000, percentageUsed: 5.07, periodStart: '2026-11-16T18:20:00Z', periodEnd: '2026-12-16T18:20:00Z',
  isWeekly: false, isExceeded: false, isCredit: true,
}
let host: HTMLDivElement
let root: Root
const T = (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate('en', k, p)

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useAccount.getState().reset()
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('the starter credit in the chat', () => {
  it('the usage meter says "Starter credit" with a gift icon (not "This month"), and the real tokens', async () => {
    await act(async () => root.render(createElement(TokenMeter, { usage: CREDIT })))
    const meter = host.querySelector('[data-testid="usage-tokens"]')!
    expect(meter.textContent).toContain(T('acct.usage.credit.badge'))
    expect(meter.textContent).not.toContain(T('acct.usage.monthly'))
    expect(meter.textContent).toContain('38K')
    expect(meter.textContent).toContain('750K')
    expect(meter.querySelector('svg')).not.toBeNull()
  })

  it('a used-up credit says so, and a normal plan keeps its own wording', async () => {
    await act(async () => root.render(createElement(TokenMeter, { usage: { ...CREDIT, usedTokens: 750_000, percentageUsed: 100, isExceeded: true } })))
    expect(host.textContent).toContain(T('acct.usage.exceededCredit'))
    await act(async () => root.render(createElement(TokenMeter, { usage: { ...CREDIT, isCredit: false } })))
    expect(host.textContent).toContain(T('acct.usage.monthly'))
    expect(host.textContent).not.toContain(T('acct.usage.credit.badge'))
  })

  it('the profile badge shows the credit left, for a free account and for the "beta" plan the server reports for a grant', async () => {
    useAccount.setState({ status: 'loaded', entitlement: null, tokenUsage: CREDIT })
    await act(async () => root.render(createElement(PlanBadge, { onUpgrade: vi.fn() })))
    const badge = () => host.querySelector('[data-testid="plan-badge"]')!
    expect(badge().getAttribute('data-plan')).toBe('credit')
    expect(badge().textContent).toContain(T('acct.plan.credit'))
    expect(badge().textContent).toContain(T('acct.plan.creditLeft', { left: '712K' }))

    useAccount.setState({ entitlement: { kind: 'monthly', tier: 'beta', isTrial: false, expiresAt: null } })
    await act(async () => void 0)
    expect(badge().getAttribute('data-plan')).toBe('credit')
  })

  it('a paid plan, and a used-up credit, are not shown as a credit', async () => {
    useAccount.setState({ status: 'loaded', entitlement: { kind: 'monthly', tier: 'creator', isTrial: false, expiresAt: null }, tokenUsage: { ...CREDIT, isCredit: false } })
    await act(async () => root.render(createElement(PlanBadge, { onUpgrade: vi.fn() })))
    expect(host.querySelector('[data-testid="plan-badge"]')!.getAttribute('data-plan')).toBe('monthly')
    useAccount.setState({ entitlement: null, tokenUsage: { ...CREDIT, isExceeded: true, usedTokens: 750_000 } })
    await act(async () => void 0)
    expect(host.querySelector('[data-testid="plan-badge"]')!.getAttribute('data-plan')).toBe('free')
  })

  it('refreshing the account reads the token allowance too (so the credit appears right after onboarding)', async () => {
    const api = { ...accountApi(), entitlement: vi.fn(async () => null), tokenUsage: vi.fn(async () => CREDIT) }
    setAccountApi(api as never)
    await useAccount.getState().refresh()
    await act(async () => void (await Promise.resolve()))
    expect(api.tokenUsage).toHaveBeenCalledTimes(1)
    expect(useAccount.getState().tokenUsage).toEqual(CREDIT)
    useAccount.getState().reset()
    expect(useAccount.getState().tokenUsage).toBeNull()
  })
})
