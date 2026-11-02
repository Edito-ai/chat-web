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

describe('login', () => {
  it('stores both tokens in browser storage', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null })
    handler = () => json(200, { user: { id: 'u', email: 'a@b.c', name: 'A' }, accessToken: 'acc', refreshToken: 'ref' })
    await useAuth.getState().login('a@b.c', 'password1')
    const saved = JSON.parse(localStorage.getItem('edito.chat-web.auth.v1')!).state
    expect(saved).toMatchObject({ accessToken: 'acc', refreshToken: 'ref' })
    expect(useAuth.getState().status).toBe('authenticated')
  })

  it('an unverified account routes to code entry instead of showing an error', async () => {
    useAuth.setState({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null })
    handler = () => json(403, { error: 'Email not verified', details: { reason: 'email_not_verified' } })
    await expect(useAuth.getState().login('a@b.c', 'password1')).rejects.toBeTruthy()
    expect(useAuth.getState()).toMatchObject({ verificationEmail: 'a@b.c', error: null })
  })
})
