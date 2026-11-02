import { describe, expect, it, vi } from 'vitest'
import { isSafeCheckoutUrl, openCheckoutTab } from '../lib/checkout'
import { isSafeHref, parseMarkdown } from '../lib/markdown'
import { formatDate, planView, tierLabel, timeLeft } from '../lib/planView'
import { isLive } from '../lib/plans'
import { barPercent, formatHours, formatMoney, formatTokens, meterTone } from '../lib/usage'
import { en } from '@/i18n/en'
import { hi } from '@/i18n/hi'

describe('planView', () => {
  it('null is Free', () => expect(planView(null).kind).toBe('free'))
  it('weekly', () => expect(planView({ kind: 'weekly', tier: 'weekly', isTrial: false, expiresAt: 'x' }).kind).toBe('weekly'))
  it('a monthly trial is Trial, not Pro monthly', () => {
    expect(planView({ kind: 'monthly', tier: 'creator', isTrial: true, expiresAt: 'x' }).kind).toBe('trial')
    expect(planView({ kind: 'monthly', tier: 'studio', isTrial: false, expiresAt: 'x' }).kind).toBe('monthly')
  })
  it('tier labels fall back to a capitalised id', () => {
    expect(tierLabel('creator')).toBe('Creator')
    expect(tierLabel('team')).toBe('Team')
  })
  it('timeLeft counts down and is null once past', () => {
    const now = Date.parse('2026-11-01T00:00:00Z')
    expect(timeLeft('2026-11-06T03:20:00Z', now)).toEqual({ days: 5, hours: 3, minutes: 20 })
    expect(timeLeft('2026-10-31T00:00:00Z', now)).toBeNull()
    expect(timeLeft('nope', now)).toBeNull()
  })
  it('formatDate is empty for missing or invalid input', () => {
    expect(formatDate(null, 'en')).toBe('')
    expect(formatDate('garbage', 'en')).toBe('')
    expect(formatDate('2026-11-06T00:00:00Z', 'en')).toMatch(/2026/)
  })
  it('only active and trialing grant a plan', () => {
    expect(isLive('active')).toBe(true)
    expect(isLive('trialing')).toBe(true)
    expect(isLive('canceled')).toBe(false)
    expect(isLive('past_due')).toBe(false)
  })
})

describe('usage formatting', () => {
  it('formats tokens', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1500)).toBe('1.5K')
    expect(formatTokens(40_000_000)).toBe('40M')
    expect(formatTokens(1_250_000)).toBe('1.25M')
  })
  it('bar width is clamped and shows a sliver for any spend', () => {
    expect(barPercent(0, 0)).toBe(0)
    expect(barPercent(10, 0.1)).toBe(2)
    expect(barPercent(1, 250)).toBe(100)
    expect(barPercent(1, Number.NaN)).toBe(2)
  })
  it('tone', () => {
    expect(meterTone(10, false)).toBe('ok')
    expect(meterTone(85, false)).toBe('warn')
    expect(meterTone(50, true)).toBe('danger')
    expect(meterTone(100, false)).toBe('danger')
  })
  it('hours and money', () => {
    expect(formatHours(3.26)).toBe('3.3')
    expect(formatMoney(1500, 'INR')).toMatch(/1,500/)
    expect(formatMoney(5, 'not-a-currency')).toBe('5 not-a-currency')
  })
})

describe('checkout opening', () => {
  it('vets urls', () => {
    expect(isSafeCheckoutUrl('https://pay.example/x')).toBe(true)
    expect(isSafeCheckoutUrl('http://localhost:5173/checkout?a=1')).toBe(true)
    expect(isSafeCheckoutUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeCheckoutUrl('not a url')).toBe(false)
    expect(isSafeCheckoutUrl('http://rzp.io/x')).toBe(false)
    expect(isSafeCheckoutUrl('https://pages.razorpay.com/x')).toBe(true)
  })

  it('opens a blank tab first, detaches it, then navigates', () => {
    const win = { opener: {} as unknown, closed: false, close: vi.fn(), location: { href: '' } }
    const open = vi.fn().mockReturnValue(win)
    const tab = openCheckoutTab(open as never)
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(win.opener).toBeNull()
    expect(tab.navigate('https://pay.example/x')).toBe('opened')
    expect(win.location.href).toBe('https://pay.example/x')
  })

  it('closes the tab and refuses an unsafe url', () => {
    const win = { opener: null, closed: false, close: vi.fn(), location: { href: '' } }
    const tab = openCheckoutTab((() => win) as never)
    expect(tab.navigate('javascript:alert(1)')).toBe('unsafe')
    expect(win.close).toHaveBeenCalled()
    expect(win.location.href).toBe('')
  })

  it('reports a blocked popup so the page can offer a link', () => {
    const tab = openCheckoutTab((() => null) as never)
    expect(tab.navigate('https://pay.example/x')).toBe('blocked')
  })
})

describe('markdown', () => {
  it('keeps raw html as literal text and drops unsafe links', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [ok](https://a.b)')
    expect(JSON.stringify(blocks)).toContain('<script>')
    const para = blocks[1] as { children: { type: string }[] }
    expect(para.children.filter((c) => c.type === 'link')).toHaveLength(1)
    expect(isSafeHref('javascript:1')).toBe(false)
  })
})

describe('catalogue parity', () => {
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
  it('hi has exactly the keys of en, none empty, same placeholders', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort())
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(hi[k], k).not.toBe('')
      expect(placeholders(hi[k]), k).toBe(placeholders(en[k]))
    }
  })
})
