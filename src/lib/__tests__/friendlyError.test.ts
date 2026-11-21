import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../apiClient'
import { COPY, friendlyError, isHumanText, userMessage } from '../friendlyError'

const api = (status: number, reason: string, extra: Partial<ApiError> = {}, details?: unknown) => {
  const e = new ApiError(status, `${status} ${reason}`, details)
  e.reason = reason
  Object.assign(e, extra)
  return e
}

afterEach(() => vi.unstubAllEnvs())

const prod = () => vi.stubEnv('NODE_ENV', 'production')
const dev = () => vi.stubEnv('NODE_ENV', 'development')

describe('what is a sentence for people', () => {
  it('accepts one short plain sentence and rejects developer output', () => {
    for (const ok of ['That is not the email of this account.', 'Invalid or expired code', 'Add a video first, then describe the edit.']) {
      expect(isHumanText(ok)).toBe(true)
    }
    for (const bad of [
      '', 'Internal server error', 'TypeError: x is undefined', 'Request failed at https://api.x.com/v1', 'duplicate key value violates unique constraint',
      'x264 [error]: malloc failed', 'at foo (node_modules/x/index.js:1:2)', '{"error":"boom"}', 'a'.repeat(300), 'line one\nline two', 'Error code: 402 - no balance',
    ]) {
      expect(isHumanText(bad)).toBe(false)
    }
  })
})

describe('production: a person only reads a plain sentence', () => {
  it('a server error never shows its status, path or class, and keeps the reference to quote', () => {
    prod()
    const e = api(500, 'Internal server error', { path: '/chat/jobs', method: 'POST', reference: 'abc123def456', debug: { type: 'RuntimeError', message: 'x264 malloc' } })
    const f = friendlyError(e)
    expect(f.message).toBe(COPY.server)
    expect(f.reference).toBe('abc123def456')
    expect(f.details).toBeUndefined()
    expect(JSON.stringify(f)).not.toMatch(/500|chat\/jobs|RuntimeError|x264/)
    expect(userMessage(e)).toBe(`${COPY.server} (Ref: abc123def456)`)
  })

  it('a busy gateway, the network, a timeout and too many requests each have their own calm sentence', () => {
    prod()
    expect(friendlyError(api(503, 'Service Unavailable')).message).toBe(COPY.busy)
    expect(friendlyError(new TypeError('Failed to fetch')).message).toBe(COPY.network)
    expect(friendlyError(new Error("Can't reach the server at http://127.0.0.1:4100. Is the backend running?")).message).toBe(COPY.network)
    expect(friendlyError(api(429, 'Too many requests, please try again later')).message).toBe(COPY.tooMany)
    expect(friendlyError(api(413, 'Payload too large')).message).toBe(COPY.tooLarge)
  })

  it('a sentence the server wrote for people passes through, without the status prefix', () => {
    prod()
    expect(friendlyError(api(400, 'That is not the email of this account.')).message).toBe('That is not the email of this account.')
    expect(friendlyError(api(409, 'An account with this email already exists. Sign in instead.')).message).toBe('An account with this email already exists. Sign in instead.')
    expect(friendlyError(api(401, 'Invalid or expired code')).message).toBe('Invalid or expired code')
    expect(friendlyError(new Error('400 That is not the email of this account.')).message).toBe('That is not the email of this account.')
  })

  it('a technical or generic server text is replaced by a sentence for the status', () => {
    prod()
    expect(friendlyError(api(400, 'duplicate key value violates unique constraint "uq_users_email"')).message).toBe(COPY.check)
    expect(friendlyError(api(409, 'duplicate key value violates unique constraint')).message).toBe(COPY.conflict)
    expect(friendlyError(api(404, 'Not Found')).message).toBe('Not Found') // short and plain, so it stays
    expect(friendlyError(api(404, 'Resource not found: /x.py line 4')).message).toBe(COPY.notFound)
    expect(friendlyError(api(401, 'Unauthorized')).message).toBe(COPY.session)
    expect(friendlyError(api(401, 'Sign in first.')).message).toBe(COPY.session)
    expect(friendlyError(api(403, 'Forbidden: token claims missing')).message).toBe(COPY.forbidden)
  })

  it('a form problem names the fields instead of the raw validation text', () => {
    prod()
    const e = api(422, 'Please check what you entered and try again.', {}, [
      { type: 'int_parsing', loc: ['body', 'followersCount'], msg: 'Input should be a valid integer' },
      { type: 'missing', loc: ['body', 'phone'], msg: 'Field required' },
    ])
    expect(friendlyError(e).message).toBe('Please check: Followers count, Phone.')
    expect(friendlyError(api(422, 'Validation failed')).message).toBe('Validation failed')
    expect(friendlyError(api(422, 'x'.repeat(300))).message).toBe(COPY.check)
  })

  it('an unknown thrown value gets the fallback, never "[object Object]" or a stack', () => {
    prod()
    expect(friendlyError({ weird: true }, 'We could not do that.').message).toBe('We could not do that.')
    expect(friendlyError(new Error('Cannot read properties of undefined (reading x)'), 'We could not do that.').message).toBe('We could not do that.')
    expect(friendlyError('plain words').message).toBe('plain words')
    expect(friendlyError(new DOMException('aborted', 'AbortError'), 'x').message).toBe('x')
  })
})

describe('development: the developer sees what broke', () => {
  it('a server error shows the line, the debug object, and what a user would see', () => {
    dev()
    const e = api(500, 'Internal server error', { path: '/chat/jobs', method: 'POST', debug: { type: 'RuntimeError', message: 'x264 malloc failed' } })
    const f = friendlyError(e)
    expect(f.message).toBe('[POST /chat/jobs -> 500] RuntimeError: x264 malloc failed')
    expect(f.details).toContain('x264 malloc failed')
    expect(f.details).toContain(`A user sees in production: "${COPY.server}"`)
  })

  it('a network failure and a technical text are shown as they are', () => {
    dev()
    expect(friendlyError(new TypeError('Failed to fetch')).message).toContain('Failed to fetch')
    const f = friendlyError(api(400, 'duplicate key value violates unique constraint "uq_users_email"', { path: '/auth/signup/complete', method: 'POST' }))
    expect(f.message).toBe('[POST /auth/signup/complete -> 400] duplicate key value violates unique constraint "uq_users_email"')
  })

  it('a sentence written for people is the same in both: development does not add noise to it', () => {
    dev()
    const e = api(400, 'That is not the email of this account.', { path: '/account', method: 'DELETE' })
    expect(friendlyError(e).message).toBe('That is not the email of this account.')
    expect(friendlyError(e).details).toBeUndefined()
  })
})
