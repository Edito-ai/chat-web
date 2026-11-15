// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Onboarding } from '../Onboarding'
import { useAuth } from '../authStore'
import { checkPhone, EMPTY_FORM, parseFollowers, stepProblem, toPayload, toggle, type OnboardingForm } from '../onboardingForm'
import { translate } from '@/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('onboarding form logic', () => {
  it('checks the phone number: Indian mobiles are 10 digits starting 6-9, others are 6-14 digits', () => {
    expect(checkPhone('+91', '98123 45670')).toEqual({ ok: true, phone: '+919812345670' })
    expect(checkPhone('+91', '098123-45670')).toEqual({ ok: true, phone: '+919812345670' }) // a leading 0 is dropped
    expect(checkPhone('+91', '')).toEqual({ ok: false, problem: 'empty' })
    expect(checkPhone('+91', '98123')).toEqual({ ok: false, problem: 'short' })
    expect(checkPhone('+91', '1234567890')).toEqual({ ok: false, problem: 'indian' })
    expect(checkPhone('+91', '98123456701')).toEqual({ ok: false, problem: 'indian' })
    expect(checkPhone('+91', '98x23')).toEqual({ ok: false, problem: 'chars' })
    expect(checkPhone('+44', '7911 123456')).toEqual({ ok: true, phone: '+447911123456' })
    expect(checkPhone('+44', '123')).toEqual({ ok: false, problem: 'short' })
    expect(checkPhone('+1', '1'.repeat(15))).toEqual({ ok: false, problem: 'long' })
  })

  it('reads follower counts the way people write them', () => {
    expect(parseFollowers('')).toBeNull()
    expect(parseFollowers('12000')).toBe(12000)
    expect(parseFollowers('12k')).toBe(12000)
    expect(parseFollowers('1.5M')).toBe(1_500_000)
    expect(parseFollowers('12,500')).toBe(12500)
    expect(parseFollowers('1.5 lakh')).toBe(150000)
    expect(parseFollowers('2 cr')).toBe(20_000_000)
    expect(parseFollowers('lots')).toBe('invalid')
    expect(parseFollowers('-5')).toBe('invalid')
    expect(parseFollowers('99999999999')).toBe('invalid')
  })

  it('only the name and the phone are required; a bad follower count is caught on its own step', () => {
    expect(stepProblem(1, EMPTY_FORM)).toBe('name')
    expect(stepProblem(1, { ...EMPTY_FORM, name: 'A' })).toBe('empty')
    expect(stepProblem(1, { ...EMPTY_FORM, name: 'A', phone: '9812345670' })).toBeNull()
    expect(stepProblem(2, EMPTY_FORM)).toBeNull()
    expect(stepProblem(3, { ...EMPTY_FORM, followers: 'many' })).toBe('followers')
    expect(stepProblem(3, EMPTY_FORM)).toBeNull()
  })

  it('builds the request: what was answered is sent, what was left empty is left out', () => {
    const f: OnboardingForm = {
      ...EMPTY_FORM, name: ' Asha ', phone: '98123 45670', contentTypes: ['Podcasts'], contentOther: ' ASMR ', role: 'Freelancer',
      source: 'Instagram', platforms: ['YouTube'], handle: ' @asha ', followers: '5.4k',
    }
    expect(toPayload(f)).toEqual({
      name: 'Asha', phone: '+919812345670', contentTypes: ['Podcasts', 'ASMR'], professionTypes: ['Freelancer'], referralSources: ['Instagram'],
      socialPlatforms: ['YouTube'], socialHandle: '@asha', followersCount: 5400,
    })
    expect(toPayload({ ...EMPTY_FORM, name: 'A', phone: '9812345670' })).toEqual({ name: 'A', phone: '+919812345670' })
    expect(() => toPayload({ ...EMPTY_FORM, name: 'A', phone: '1' })).toThrow()
  })

  it('chips toggle on and off, in the order picked, up to a limit', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggle(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggle(['1', '2'], '3', 2)).toEqual(['1', '2'])
  })
})

let host: HTMLDivElement
let root: Root
let calls: { url: string; method: string; body: any }[] = []
let answer: (url: string) => Response

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const input = (name: string) => host.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)
const type = async (name: string, value: string) => {
  const el = input(name)!
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  await act(async () => void el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })))
}
const press = async (el: Element | null) => {
  expect(el).not.toBeNull()
  await act(async () => void (el as HTMLElement).click())
}
const chip = (text: string) => [...host.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent?.trim() === text) ?? null
const next = () => act(async () => void host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
const flush = () => act(async () => void (await Promise.resolve()))
const NEW = { signupToken: 'a'.repeat(10) + '.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3000 })) + '.sig', email: 'new@user.com', name: 'Asha K', via: 'google' as const }

beforeEach(() => {
  localStorage.clear()
  calls = []
  host = document.createElement('div')
  document.body.appendChild(host)
  answer = () => json(404, { error: 'nope' })
  useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, loading: false, error: null, pendingSignup: NEW, celebration: null })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : undefined })
    if (url.endsWith('/legal')) return json(200, [{ slug: 'terms', version: '2' }, { slug: 'privacy', version: '3' }])
    return answer(url)
  })
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const mount = async () => {
  await act(async () => root.render(<Onboarding />))
  await flush()
}

describe('the onboarding screen of a new person', () => {
  it('shows the $1 banner and step 1 with the confirmed email (read only) and the name Google knows', async () => {
    await mount()
    expect($('onboarding-banner')!.textContent).toContain(translate('en', 'onb.banner.title'))
    expect($('onboarding-title')!.textContent).toBe(translate('en', 'onb.step1.title'))
    expect(input('email')!.value).toBe('new@user.com')
    expect((input('email') as HTMLInputElement).readOnly).toBe(true)
    expect(input('name')!.value).toBe('Asha K')
    expect(host.textContent).toContain(translate('en', 'onb.progress', { n: 1 }))
  })

  it('will not leave step 1 without the phone number, and says why', async () => {
    await mount()
    await next()
    expect($('onboarding-problem')!.textContent).toBe(translate('en', 'onb.err.phoneEmpty'))
    await type('phone', '12345')
    await next()
    expect($('onboarding-problem')!.textContent).toBe(translate('en', 'onb.err.phoneShort'))
    await type('phone', '9812345670')
    expect($('onboarding-problem')).toBeNull() // typing clears the message
    await next()
    expect($('onboarding-title')!.textContent).toBe(translate('en', 'onb.step2.title'))
  })

  it('walks the three steps (back works), and a new person must agree to the terms before finishing', async () => {
    await mount()
    await type('phone', '9812345670')
    await next()
    await press(chip('Podcasts'))
    await press(chip('Freelancer'))
    await press(chip('Instagram'))
    expect(chip('Podcasts')!.getAttribute('aria-pressed')).toBe('true')
    await press(chip('Freelancer')) // a second tap on the same role un-picks it
    expect(chip('Freelancer')!.getAttribute('aria-pressed')).toBe('false')
    await press(chip('Founder'))
    await next()
    expect($('onboarding-title')!.textContent).toBe(translate('en', 'onb.step3.title'))
    await press($('onboarding-back'))
    expect($('onboarding-title')!.textContent).toBe(translate('en', 'onb.step2.title'))
    expect(chip('Podcasts')!.getAttribute('aria-pressed')).toBe('true') // the answers stayed
    await next()
    expect(($('onboarding-next') as HTMLButtonElement).disabled).toBe(true) // terms not ticked yet
    expect(host.textContent).toContain(translate('en', 'onb.finish'))
  })

  it('finishing sends everything with the proof token and the consent, then shows the party popup with the credit', async () => {
    answer = (url) =>
      url.endsWith('/auth/signup/complete')
        ? json(201, { user: { id: 'u', email: 'new@user.com', name: 'Asha K', needsOnboarding: false }, accessToken: 'a', refreshToken: 'r', credit: { status: 'granted', usd: 1, tokens: 750000 } })
        : json(404, {})
    await mount()
    await type('phone', '98123 45670')
    await next()
    await press(chip('Reels / Shorts'))
    await press(chip('Solo creator'))
    await next()
    await press(chip('YouTube'))
    await type('handle', '@asha')
    await type('followers', '12k')
    await press(host.querySelector('input[name="agree"]'))
    await next()
    await flush()
    const call = calls.find((c) => c.url.endsWith('/auth/signup/complete'))!
    expect(call.body).toEqual({
      signupToken: NEW.signupToken, name: 'Asha K', phone: '+919812345670', contentTypes: ['Reels / Shorts'], professionTypes: ['Solo creator'],
      socialPlatforms: ['YouTube'], socialHandle: '@asha', followersCount: 12000, legalConsent: { termsVersion: '2', privacyVersion: '3' },
    })
    expect(useAuth.getState().status).toBe('authenticated')
    expect($('onboarding-done')!.textContent).toContain(translate('en', 'onb.done.title.granted', { usd: 1 }))
    expect($('confetti')).not.toBeNull()
    await press($('onboarding-start'))
    expect(useAuth.getState().celebration).toBeNull()
  })

  it('when the number is refused it returns to step 1 with the server\'s reason', async () => {
    answer = () => json(400, { error: 'Enter a valid Indian mobile number.' })
    await mount()
    await type('phone', '9812345670')
    await next()
    await next()
    await press(host.querySelector('input[name="agree"]'))
    await next()
    await flush()
    expect($('onboarding-title')!.textContent).toBe(translate('en', 'onb.step1.title'))
    expect(host.textContent).toContain('Enter a valid Indian mobile number.')
    expect(useAuth.getState().status).toBe('unauthenticated')
  })

  it('"use a different email" leaves the onboarding; a proof that is about to run out is dropped', async () => {
    await mount()
    await press([...host.querySelectorAll('button')].find((b) => b.textContent === translate('en', 'onb.otherEmail'))!)
    expect(useAuth.getState().pendingSignup).toBeNull()
    await act(async () => root.unmount())
    root = createRoot(host)
    useAuth.setState({ pendingSignup: { ...NEW, signupToken: 'x.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 5 })) + '.y' } })
    await mount()
    expect(useAuth.getState().pendingSignup).toBeNull()
  })
})

describe('the onboarding screen of an account that already exists', () => {
  beforeEach(() => {
    useAuth.setState({
      status: 'authenticated', pendingSignup: null, accessToken: 'tok', refreshToken: 'r',
      user: { id: 'u', email: 'old@user.com', name: 'Old Timer', needsOnboarding: true },
    })
  })

  it('is prefilled, has no terms box, and saves with PATCH /auth/onboarding', async () => {
    answer = (url) =>
      url.endsWith('/auth/onboarding')
        ? json(200, { user: { id: 'u', email: 'old@user.com', name: 'Old Timer', phone: '••••••5670', needsOnboarding: false }, credit: { status: 'phone_in_use', usd: 0, tokens: 0 } })
        : json(404, {})
    await mount()
    expect(input('name')!.value).toBe('Old Timer')
    expect(input('email')!.value).toBe('old@user.com')
    expect($('onboarding-banner')).not.toBeNull()
    await type('phone', '9812345670')
    await next()
    await next()
    expect(input('agree')).toBeNull()
    expect(host.textContent).not.toContain(translate('en', 'onb.otherEmail'))
    await next()
    await flush()
    const call = calls.find((c) => c.url.endsWith('/auth/onboarding'))!
    expect(call.method).toBe('PATCH')
    expect(call.body).toEqual({ name: 'Old Timer', phone: '+919812345670' })
    expect(useAuth.getState().user).toMatchObject({ needsOnboarding: false, phone: '••••••5670' })
    expect($('onboarding-done')!.textContent).toContain(translate('en', 'onb.done.phoneUsed'))
    expect($('onboarding-done')!.textContent).not.toContain('$1 credit is unlocked')
  })
})
