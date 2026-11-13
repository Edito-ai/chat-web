// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const get = vi.fn()
vi.mock('@/lib/apiClient', async (orig) => ({
  ...(await orig<typeof import('@/lib/apiClient')>()),
  apiClient: { get: (...a: unknown[]) => get(...a) },
}))

import { ApiError, setAccessPendingHandler } from '@/lib/apiClient'
import { AccessPending } from '../AccessPending'
import { DEFAULT_CONTACT, useAccess } from '../access'

beforeEach(() => {
  get.mockReset()
  useAccess.getState().reset()
})
afterEach(() => useAccess.getState().reset())

describe('the access check', () => {
  it('an approved account is let through', async () => {
    get.mockResolvedValue({ approved: true, plan: 'weekly', contact: DEFAULT_CONTACT })
    await useAccess.getState().check()
    expect(useAccess.getState()).toMatchObject({ status: 'approved', checked: true })
  })

  it('a waiting account is held back, with the contact the server sent', async () => {
    get.mockResolvedValue({ approved: false, contact: { email: 'a@b.c', phone: '123' } })
    await useAccess.getState().check()
    expect(useAccess.getState()).toMatchObject({ status: 'pending', checked: true, contact: { email: 'a@b.c', phone: '123' } })
  })

  it('a server without /access has no approval step: the person is let through', async () => {
    get.mockRejectedValue(new ApiError(404, '404 Not Found'))
    await useAccess.getState().check()
    expect(useAccess.getState().status).toBe('approved')
  })

  it('a failed check says nothing about the account: the screen stops waiting and the server still enforces access', async () => {
    get.mockRejectedValue(new Error("Can't reach the server"))
    await useAccess.getState().check()
    expect(useAccess.getState()).toMatchObject({ status: 'unknown', checked: true })
  })

  it('a request the server refuses as access_pending moves the person to the same screen', () => {
    useAccess.setState({ status: 'approved', checked: true })
    // the handler the store registered with the api client
    let handler: ((c: unknown) => void) | null = null
    const real = setAccessPendingHandler
    real((c) => handler?.(c))
    handler = (c) => useAccess.getState().markPending(c as { email: string })
    handler({ email: 'x@y.z' })
    expect(useAccess.getState()).toMatchObject({ status: 'pending', contact: { email: 'x@y.z', phone: DEFAULT_CONTACT.phone } })
  })
})

describe('the access-pending screen', () => {
  it('tells the person how to get access: mail, call and message', () => {
    useAccess.getState().markPending()
    const out = renderToStaticMarkup(createElement(AccessPending))
    expect(out).toContain('href="mailto:hello@trybroll.com"')
    expect(out).toContain('href="tel:8595051170"')
    expect(out).toContain('href="https://wa.me/918595051170?text=')  // WhatsApp, with the Indian country code
    expect(out).toContain('target="_blank"')
    expect(out).not.toContain('sms:')
    expect(out).toContain('hello@trybroll.com')
    expect(out).toContain('8595051170')
    for (const id of ['access-check', 'access-signout']) expect(out).toContain(`data-testid="${id}"`)
  })
})
