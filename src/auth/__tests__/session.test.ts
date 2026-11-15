// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../authStore'
import { apiClient } from '@/lib/apiClient'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let calls: { url: string; init: RequestInit }[] = []
let handler: (url: string, init: RequestInit) => Response

beforeEach(() => {
  calls = []
  localStorage.clear()
  useAuth.setState({ status: 'authenticated', user: { id: 'u', email: 'a@b.c', name: null }, accessToken: 'old', refreshToken: 'r1', error: null })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    return handler(url, init)
  })
})
afterEach(() => vi.unstubAllGlobals())

const auth = (init: RequestInit) => new Headers(init.headers).get('Authorization')

describe('apiClient bearer + one silent refresh', () => {
  it('on a 401 refreshes once with the stored refresh token in the body, then retries with the new access token', async () => {
    handler = (url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'new', refreshToken: 'r2' })
      return auth(init) === 'Bearer new' ? json(200, { ok: true }) : json(401, { error: 'expired' })
    }
    expect(await apiClient.get('/projects')).toEqual({ ok: true })
    const refresh = calls.find((c) => c.url.endsWith('/auth/refresh'))!
    expect(JSON.parse(refresh.init.body as string)).toEqual({ refreshToken: 'r1' })
    expect(refresh.init.credentials).toBe('omit')
    expect(useAuth.getState()).toMatchObject({ accessToken: 'new', refreshToken: 'r2' })
    expect(calls.filter((c) => c.url.endsWith('/projects'))).toHaveLength(2)
  })

  it('does not loop: a second 401 after the refresh surfaces as an error', async () => {
    handler = (url) => (url.endsWith('/auth/refresh') ? json(200, { accessToken: 'new', refreshToken: 'r2' }) : json(401, { error: 'nope' }))
    await expect(apiClient.get('/projects')).rejects.toMatchObject({ status: 401 })
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('concurrent 401s share one refresh (rotation would otherwise trip reuse detection)', async () => {
    handler = (url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'new', refreshToken: 'r2' })
      return auth(init) === 'Bearer new' ? json(200, {}) : json(401, { error: 'expired' })
    }
    await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')])
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('a rejected refresh signs the user out and clears the stored tokens', async () => {
    handler = (url) => (url.endsWith('/auth/refresh') ? json(401, { error: 'revoked' }) : json(401, { error: 'expired' }))
    await expect(apiClient.get('/projects')).rejects.toMatchObject({ status: 401 })
    expect(useAuth.getState()).toMatchObject({ status: 'unauthenticated', accessToken: null, refreshToken: null })
  })

  it('a refresh that fails on a network error keeps the refresh token for next time', async () => {
    handler = (url) => {
      if (url.endsWith('/auth/refresh')) throw new TypeError('Failed to fetch')
      return json(401, { error: 'expired' })
    }
    await expect(apiClient.get('/projects')).rejects.toBeTruthy()
    expect(useAuth.getState()).toMatchObject({ status: 'unauthenticated', refreshToken: 'r1' })
  })
})

describe('sign-in with an emailed code', () => {
  const out = () => useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, pendingSignup: null, celebration: null })

  it('asks for the code with allowSignup (an unknown address may sign up too)', async () => {
    out()
    handler = () => json(200, { message: 'ok' })
    await useAuth.getState().requestLoginCode('a@b.c')
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ email: 'a@b.c', allowSignup: true })
    expect(calls[0]!.url).toMatch(/\/auth\/otp\/request$/)
  })

  it('a known account gets its session; both tokens are stored in browser storage', async () => {
    out()
    handler = () => json(200, { user: { id: 'u', email: 'a@b.c', name: 'A', needsOnboarding: false }, accessToken: 'acc', refreshToken: 'ref' })
    expect(await useAuth.getState().loginWithCode('a@b.c', '123456')).toBe('signedIn')
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ email: 'a@b.c', code: '123456', allowSignup: true })
    const saved = JSON.parse(localStorage.getItem('edito.chat-web.auth.v1')!).state
    expect(saved).toMatchObject({ accessToken: 'acc', refreshToken: 'ref' })
    expect(useAuth.getState().status).toBe('authenticated')
  })

  it('an address nobody has yet is NOT signed in: the proof is kept for the onboarding screen', async () => {
    out()
    handler = () => json(200, { needsSignup: true, signupToken: 'tok.tok.tok', email: 'new@b.c', name: null, via: 'email' })
    expect(await useAuth.getState().loginWithCode('new@b.c', '123456')).toBe('signup')
    expect(useAuth.getState()).toMatchObject({ status: 'unauthenticated', accessToken: null, pendingSignup: { signupToken: 'tok.tok.tok', email: 'new@b.c', via: 'email' } })
    // it survives a reload (the token lives 45 minutes); the session tokens are not stored
    expect(JSON.parse(localStorage.getItem('edito.chat-web.auth.v1')!).state.pendingSignup.email).toBe('new@b.c')
  })

  it('a wrong code shows the reason and signs nobody in', async () => {
    out()
    handler = () => json(401, { error: 'Invalid or expired code' })
    await expect(useAuth.getState().loginWithCode('a@b.c', '000000')).rejects.toBeTruthy()
    expect(useAuth.getState()).toMatchObject({ status: 'unauthenticated', error: 'Invalid or expired code', loading: false })
  })
})

describe('sign-in with Google', () => {
  it('sends the ID token; a new Google person goes to onboarding with the name Google knows', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, pendingSignup: null })
    handler = () => json(200, { needsSignup: true, signupToken: 'g.g.g', email: 'ann@gmail.com', name: 'Ann Lee', via: 'google' })
    expect(await useAuth.getState().loginWithGoogle('google-id-token')).toBe('signup')
    expect(calls[0]!.url).toMatch(/\/auth\/google$/)
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ idToken: 'google-id-token' })
    expect(useAuth.getState().pendingSignup).toEqual({ signupToken: 'g.g.g', email: 'ann@gmail.com', name: 'Ann Lee', via: 'google' })
  })

  it('a known Google account is signed in at once', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, pendingSignup: null })
    handler = () => json(200, { user: { id: 'u', email: 'ann@gmail.com', name: 'Ann' }, accessToken: 'a', refreshToken: 'r' })
    expect(await useAuth.getState().loginWithGoogle('t')).toBe('signedIn')
    expect(useAuth.getState().status).toBe('authenticated')
  })

  it('"not set up" (503) and a refused token surface as messages, not as a session', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null })
    handler = () => json(503, { error: 'Google sign-in is not set up on this server.', code: 'google_not_configured' })
    await expect(useAuth.getState().loginWithGoogle('t')).rejects.toBeTruthy()
    expect(useAuth.getState()).toMatchObject({ status: 'unauthenticated', error: 'Google sign-in is not set up on this server.' })
  })
})

describe('finishing onboarding', () => {
  const pending = { signupToken: 'tok.tok.tok', email: 'new@b.c', name: null, via: 'email' as const }
  const payload = { name: 'Asha', phone: '+919812345670', contentTypes: ['Reels / Shorts'] }

  it('a new person: creates the account, signs in, and keeps the credit result for the popup', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, pendingSignup: pending, celebration: null })
    handler = () => json(201, { user: { id: 'u', email: 'new@b.c', name: 'Asha', needsOnboarding: false }, accessToken: 'a', refreshToken: 'r', credit: { status: 'granted', usd: 1, tokens: 750000 } })
    await useAuth.getState().completeSignup(payload, { termsVersion: '1', privacyVersion: '1' })
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ signupToken: 'tok.tok.tok', ...payload, legalConsent: { termsVersion: '1', privacyVersion: '1' } })
    expect(useAuth.getState()).toMatchObject({ status: 'authenticated', pendingSignup: null, celebration: { status: 'granted', usd: 1 } })
    useAuth.getState().dismissCelebration()
    expect(useAuth.getState().celebration).toBeNull()
  })

  it('an expired proof ends the onboarding and says so', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, pendingSignup: pending })
    handler = () => json(401, { error: 'Your sign-up expired. Start again.', code: 'signup_expired' })
    await expect(useAuth.getState().completeSignup(payload)).rejects.toBeTruthy()
    expect(useAuth.getState()).toMatchObject({ pendingSignup: null, error: 'Your sign-up expired. Start again.', status: 'unauthenticated' })
  })

  it('a refused phone number keeps the person on the screen with the reason', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, pendingSignup: pending })
    handler = () => json(400, { error: 'Enter a valid Indian mobile number.' })
    await expect(useAuth.getState().completeSignup(payload)).rejects.toBeTruthy()
    expect(useAuth.getState()).toMatchObject({ pendingSignup: pending, error: 'Enter a valid Indian mobile number.' })
  })

  it('an existing account that never did the screen: PATCH, the profile is updated, the popup is shown', async () => {
    useAuth.setState({ status: 'authenticated', user: { id: 'u', email: 'a@b.c', name: 'A', needsOnboarding: true }, accessToken: 'tok', refreshToken: 'r1', celebration: null })
    handler = () => json(200, { user: { id: 'u', email: 'a@b.c', name: 'Asha', phone: '••••••5670', needsOnboarding: false }, credit: { status: 'phone_in_use', usd: 0, tokens: 0 } })
    await useAuth.getState().submitOnboarding(payload)
    expect(calls[0]!.init.method).toBe('PATCH')
    expect(calls[0]!.url).toMatch(/\/auth\/onboarding$/)
    expect(auth(calls[0]!.init)).toBe('Bearer tok')
    expect(useAuth.getState().user).toMatchObject({ name: 'Asha', needsOnboarding: false })
    expect(useAuth.getState().celebration).toMatchObject({ status: 'phone_in_use' })
  })

  it('cancelling the onboarding goes back to sign-in, and signing out forgets everything', () => {
    useAuth.setState({ status: 'unauthenticated', pendingSignup: pending, error: 'x' })
    useAuth.getState().cancelSignup()
    expect(useAuth.getState()).toMatchObject({ pendingSignup: null, error: null })
    useAuth.setState({ status: 'authenticated', accessToken: null, refreshToken: null, celebration: { status: 'off', usd: 0, tokens: 0 }, pendingSignup: pending })
    useAuth.getState().logout()
    expect(useAuth.getState()).toMatchObject({ celebration: null, pendingSignup: null, status: 'unauthenticated' })
  })
})
