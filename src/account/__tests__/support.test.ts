import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()
vi.mock('@/lib/apiClient', () => ({
  apiClient: { post: (...a: unknown[]) => post(...a) },
  fetchOrExplain: (url: string, init?: RequestInit) => fetch(url, init),
}))

import { createTicket, getLegalDocument, listLegalDocuments } from '../services/supportApi'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})
beforeEach(() => post.mockReset())

describe('support + legal services', () => {
  it('lists legal documents with a plain public GET (no auth header)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ slug: 'terms', title: 'Terms', version: '1', effectiveDate: null }] })
    globalThis.fetch = f as unknown as typeof fetch
    const docs = await listLegalDocuments()
    expect(docs[0]!.slug).toBe('terms')
    const [url, init] = f.mock.calls[0]!
    expect(String(url)).toMatch(/\/legal$/)
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i)
  })

  it('encodes the slug and surfaces a failed read', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' })
    globalThis.fetch = f as unknown as typeof fetch
    await expect(getLegalDocument('a/b')).rejects.toThrow('404 Not Found')
    expect(String(f.mock.calls[0]![0])).toMatch(/\/legal\/a%2Fb$/)
  })

  it('creates a ticket with the editor payload shape and returns the reference', async () => {
    post.mockResolvedValue({ id: 'id1', reference: 'SUP-12' })
    const r = await createTicket({ category: 'billing', severity: 'normal', subject: 's', message: 'm' })
    expect(r).toEqual({ id: 'id1', reference: 'SUP-12' })
    expect(post).toHaveBeenCalledWith('/support/tickets', { category: 'billing', severity: 'normal', subject: 's', message: 'm' })
  })
})
