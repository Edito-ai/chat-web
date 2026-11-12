// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthScreen } from '../AuthScreen'
import { useAuth } from '../authStore'
import { loadPendingCode, savePendingCode } from '../pendingCode'
import { translate } from '@/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

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

beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, loading: false, error: null, verificationEmail: null })
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('/legal')) return json(200, [])
    if (url.endsWith('/auth/signup')) return json(201, { user: { id: 'u', email: 'new@user.com' }, message: 'sent' })
    if (url.endsWith('/auth/otp/verify')) return json(200, { user: { id: 'u', email: 'new@user.com', name: 'N' }, accessToken: 'a', refreshToken: 'r' })
    return json(404, { error: 'nope' })
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('the emailed-code step on a phone', () => {
  it('after signup, a reload (a fresh mount) comes back to the code step, not an empty login form', async () => {
    await mount('signup')
    expect(title()).toBe(translate('en', 'auth.title.signup'))
    await type('name', 'New User')
    await type('email', 'new@user.com')
    await type('password', 'Passw0rd123')
    await submit()
    expect(title()).toBe(translate('en', 'auth.title.code'))
    expect(loadPendingCode()).toBe('new@user.com')

    // the mail app is opened, the browser drops the page, the person comes back: a brand-new mount of /login
    await act(async () => root.unmount())
    await mount('login')
    expect(title()).toBe(translate('en', 'auth.title.code'))
    expect(host.textContent).toContain('new@user.com')
    expect(field('code')).not.toBeNull()
  })

  it('also when they come back through /register', async () => {
    savePendingCode('new@user.com')
    await mount('signup')
    expect(title()).toBe(translate('en', 'auth.title.code'))
  })

  it('a correct code finishes sign-in and forgets the step', async () => {
    savePendingCode('new@user.com')
    await mount('login')
    await type('code', '123456')
    await submit()
    expect(useAuth.getState().status).toBe('authenticated')
    expect(loadPendingCode()).toBeNull()
  })

  it('"Back" leaves the step on purpose and it does not come back on the next visit', async () => {
    savePendingCode('new@user.com')
    await mount('login')
    const back = [...host.querySelectorAll('button')].find((b) => b.textContent === translate('en', 'auth.back'))!
    await click(back)
    expect(title()).toBe(translate('en', 'auth.title.login'))
    expect(loadPendingCode()).toBeNull()
    await act(async () => root.unmount())
    await mount('login')
    expect(title()).toBe(translate('en', 'auth.title.login'))
  })

  it('with nothing pending, /login still opens the login form', async () => {
    await mount('login')
    expect(title()).toBe(translate('en', 'auth.title.login'))
  })

  it('a stale step (older than the limit) is ignored', async () => {
    savePendingCode('new@user.com', Date.now() - 31 * 60 * 1000)
    await mount('login')
    expect(title()).toBe(translate('en', 'auth.title.login'))
  })
})
