// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthScreen, RESEND_SECONDS } from '../AuthScreen'
import { useAuth } from '../authStore'
import { loadPendingCode, savePendingCode } from '../pendingCode'
import { translate } from '@/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let calls: { url: string; body: any }[] = []
let verifyAnswer: () => Response

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function mount(initialMode: 'login' | 'signup' = 'login') {
  await act(async () => {
    root = createRoot(host)
    root.render(<AuthScreen initialMode={initialMode} />)
  })
}

const title = () => host.querySelector('[data-testid="auth-title"]')!.textContent
const field = (name: string) => host.querySelector<HTMLInputElement>(`input[name="${name}"]`)
const type = async (name: string, value: string) => {
  const el = field(name)!
  // React tracks the value itself: set it through the native setter so onChange fires
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  await act(async () => void el.dispatchEvent(new Event('input', { bubbles: true })))
}
const click = async (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const submit = async () => act(async () => void host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
const flush = () => act(async () => void (await Promise.resolve()))

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  calls = []
  host = document.createElement('div')
  document.body.appendChild(host)
  useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, loading: false, error: null, pendingSignup: null, celebration: null })
  verifyAnswer = () => json(200, { user: { id: 'u', email: 'new@user.com', name: 'N' }, accessToken: 'a', refreshToken: 'r' })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body as string) : undefined })
    if (url.endsWith('/auth/otp/request')) return json(200, { message: 'ok' })
    if (url.endsWith('/auth/otp/verify')) return verifyAnswer()
    return json(404, { error: 'nope' })
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the sign-in screen has no password', () => {
  it('asks for an email only, and offers the code as the way in', async () => {
    await mount('login')
    expect(title()).toBe(translate('en', 'auth.title.login'))
    expect(field('email')).not.toBeNull()
    expect(host.querySelector('input[type="password"]')).toBeNull()
    expect(field('name')).toBeNull()
    expect((host.querySelector('[data-testid="auth-submit"]') as HTMLButtonElement).disabled).toBe(true) // no email yet
    expect(host.textContent).toContain(translate('en', 'auth.sendCode'))
  })

  it('the Google button is not shown while no client id is set (the email code is always there)', async () => {
    await mount('signup')
    expect(title()).toBe(translate('en', 'auth.title.signup'))
    expect(host.querySelector('[data-testid="auth-google"]')).toBeNull()
  })

  it('a bad address cannot be sent; a good one asks for the code (allowing a first-time sign-up) and moves to the code step', async () => {
    await mount()
    await type('email', 'not-an-email')
    expect((host.querySelector('[data-testid="auth-submit"]') as HTMLButtonElement).disabled).toBe(true)
    await type('email', 'new@user.com')
    await submit()
    expect(calls.find((c) => c.url.endsWith('/auth/otp/request'))!.body).toEqual({ email: 'new@user.com', allowSignup: true })
    expect(title()).toBe(translate('en', 'auth.title.code'))
    expect(host.textContent).toContain('new@user.com')
    expect(loadPendingCode()).toBe('new@user.com')
  })
})

describe('the emailed-code step', () => {
  it('signs in by itself as soon as the sixth digit is typed', async () => {
    savePendingCode('new@user.com')
    await mount()
    await type('code', '12345')
    expect(calls.some((c) => c.url.endsWith('/auth/otp/verify'))).toBe(false)
    await type('code', '123456')
    await flush()
    expect(calls.find((c) => c.url.endsWith('/auth/otp/verify'))!.body).toEqual({ email: 'new@user.com', code: '123456', allowSignup: true })
    expect(useAuth.getState().status).toBe('authenticated')
    expect(loadPendingCode()).toBeNull()
  })

  it('keeps only digits, and a wrong code clears the box and shows why', async () => {
    verifyAnswer = () => json(401, { error: 'Invalid or expired code' })
    savePendingCode('new@user.com')
    await mount()
    await type('code', '12ab34')
    expect(field('code')!.value).toBe('1234')
    await type('code', '000000')
    await flush()
    expect(host.textContent).toContain('Invalid or expired code')
    expect(field('code')!.value).toBe('')
    expect(useAuth.getState().status).toBe('unauthenticated')
  })

  it('a code for an address nobody has hands over to the onboarding screen instead of signing in', async () => {
    verifyAnswer = () => json(200, { needsSignup: true, signupToken: 'a.b.c', email: 'new@user.com', name: null, via: 'email' })
    savePendingCode('new@user.com')
    await mount()
    await type('code', '123456')
    await flush()
    expect(useAuth.getState()).toMatchObject({ status: 'unauthenticated', pendingSignup: { signupToken: 'a.b.c', email: 'new@user.com' } })
    expect(loadPendingCode()).toBeNull() // the code was used up: do not bring the code step back
  })

  it('"send a new code" waits out the countdown and then works', async () => {
    await mount()
    await type('email', 'new@user.com')
    await submit()
    const resend = () => host.querySelector('[data-testid="auth-resend"]') as HTMLButtonElement
    expect(resend().disabled).toBe(true)
    expect(resend().textContent).toContain(String(RESEND_SECONDS))
    for (let i = 0; i < RESEND_SECONDS; i++) await act(async () => void (await vi.advanceTimersByTimeAsync(1000)))
    expect(resend().disabled).toBe(false)
    await click(resend())
    await flush()
    expect(calls.filter((c) => c.url.endsWith('/auth/otp/request'))).toHaveLength(2)
    expect(host.textContent).toContain(translate('en', 'auth.resent'))
  })

  it('after a reload (a fresh mount) it comes back to the code step, not an empty form', async () => {
    await mount('signup')
    await type('email', 'new@user.com')
    await submit()
    expect(loadPendingCode()).toBe('new@user.com')
    await act(async () => root.unmount())
    await mount('login')
    expect(title()).toBe(translate('en', 'auth.title.code'))
    expect(host.textContent).toContain('new@user.com')
    expect(field('code')).not.toBeNull()
  })

  it('"Back" leaves the step on purpose and it does not come back on the next visit', async () => {
    savePendingCode('new@user.com')
    await mount('login')
    const back = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(translate('en', 'auth.back')))!
    await click(back)
    expect(title()).toBe(translate('en', 'auth.title.login'))
    expect(loadPendingCode()).toBeNull()
    await act(async () => root.unmount())
    await mount('login')
    expect(title()).toBe(translate('en', 'auth.title.login'))
  })

  it('with nothing pending, /login opens the first step; a stale step (older than the limit) is ignored', async () => {
    await mount('login')
    expect(title()).toBe(translate('en', 'auth.title.login'))
    await act(async () => root.unmount())
    savePendingCode('new@user.com', Date.now() - 31 * 60 * 1000)
    await mount('login')
    expect(title()).toBe(translate('en', 'auth.title.login'))
  })
})
