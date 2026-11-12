// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { secondsLeft, useAuth } from '../authStore'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** An unsigned JWT-shaped string: header.payload.signature with the given `exp` (seconds from now). */
const token = (expIn: number) => {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + expIn })}.sig`
}
const USER = { id: 'u1', email: 'a@b.c', name: 'Shubham' }

let calls: string[] = []
let handler: (url: string) => Promise<Response>

beforeEach(() => {
  calls = []
  localStorage.clear()
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url)
    return handler(url)
  })
})
afterEach(() => vi.unstubAllGlobals())

const set = (s: object) => useAuth.setState({ status: 'restoring', user: null, accessToken: null, refreshToken: null, error: null, ...s })

describe('restoring a session', () => {
  it('right after login nothing is restored: the profile does not disappear while /auth/me is asked', async () => {
    handler = async () => json(200, { user: USER })
    set({ status: 'authenticated', user: USER, accessToken: token(900), refreshToken: 'r' })
    const states: string[] = []
    const off = useAuth.subscribe((s) => states.push(s.status))
    await useAuth.getState().restoreSession()
    off()
    expect(useAuth.getState().status).toBe('authenticated')
    expect(states).not.toContain('restoring')
    expect(calls).toEqual([]) // no request at all
  })

  it('a reload with a stored session shows the signed-in screen at once, then confirms it in the background', async () => {
    let answer!: (r: Response) => void
    handler = () => new Promise<Response>((r) => (answer = r)) // the server has not answered yet
    set({ user: USER, accessToken: token(900), refreshToken: 'r' })
    const pending = useAuth.getState().restoreSession()
    await Promise.resolve()
    expect(useAuth.getState().status).toBe('authenticated') // before the answer
    answer(json(200, { user: { ...USER, name: 'Shubham K' } }))
    await pending
    expect(useAuth.getState().user?.name).toBe('Shubham K') // refreshed from the server
    expect(calls).toHaveLength(1)
  })

  it('a server that is down does not sign anyone out', async () => {
    handler = async () => {
      throw new TypeError('Failed to fetch')
    }
    set({ user: USER, accessToken: token(900), refreshToken: 'r' })
    await useAuth.getState().restoreSession()
    expect(useAuth.getState()).toMatchObject({ status: 'authenticated', refreshToken: 'r' })
  })

  it('a token the server rejects is refreshed once and the session carries on', async () => {
    let me = 0
    handler = async (url) => {
      if (url.endsWith('/auth/me')) return ++me === 1 ? json(401, { error: 'expired' }) : json(200, { user: USER })
      return json(200, { accessToken: token(900), refreshToken: 'r2' })
    }
    set({ user: USER, accessToken: token(900), refreshToken: 'r1' })
    await useAuth.getState().restoreSession()
    expect(useAuth.getState()).toMatchObject({ status: 'authenticated', refreshToken: 'r2' })
    expect(calls.filter((c) => c.endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('a refresh the server refuses signs the person out and clears the stored tokens', async () => {
    handler = async (url) => (url.endsWith('/auth/me') ? json(401, { error: 'expired' }) : json(401, { error: 'revoked' }))
    set({ user: USER, accessToken: token(900), refreshToken: 'r1' })
    await useAuth.getState().restoreSession()
    expect(useAuth.getState()).toMatchObject({ status: 'unauthenticated', accessToken: null, refreshToken: null })
  })

  it('an expired access token takes the careful path: the session is checked first, the signed-in screen is not shown early', async () => {
    const seen: string[] = []
    handler = async () => json(200, { user: USER })
    set({ user: USER, accessToken: token(-60), refreshToken: 'r1' })
    const off = useAuth.subscribe((s) => seen.push(s.status))
    await useAuth.getState().restoreSession()
    off()
    expect(seen[0]).toBe('restoring')
    expect(useAuth.getState().status).toBe('authenticated')
    expect(calls.length).toBeGreaterThan(0)
  })

  it('no stored refresh token means signed out', async () => {
    handler = async () => json(200, {})
    set({ user: USER, accessToken: token(900), refreshToken: null })
    await useAuth.getState().restoreSession()
    expect(useAuth.getState().status).toBe('unauthenticated')
    expect(calls).toEqual([])
  })
})

describe('secondsLeft', () => {
  it('reads the expiry of a token and distrusts anything it cannot read', () => {
    expect(secondsLeft(token(600))).toBeGreaterThan(590)
    expect(secondsLeft(token(-5))).toBeLessThan(0)
    for (const bad of [null, '', 'abc', 'a.b.c', 'a.@@@.c']) expect(secondsLeft(bad)).toBe(0)
  })
})
