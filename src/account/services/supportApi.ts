import { apiClient, fetchOrExplain } from '@/lib/apiClient'
import { API_BASE } from '@/lib/env'
import type { CreateTicketInput, LegalDocument, LegalDocumentSummary, TicketReceipt } from '../types'

/** Legal routes are public (readable on the sign-up screen too), so they go out without a token. */
async function publicGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetchOrExplain(`${API_BASE}${path}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export const listLegalDocuments = (signal?: AbortSignal) => publicGet<LegalDocumentSummary[]>('/legal', signal)
export const getLegalDocument = (slug: string, signal?: AbortSignal) =>
  publicGet<LegalDocument>(`/legal/${encodeURIComponent(slug)}`, signal)

/** `POST /support/tickets`, the same route and payload the editor's contact form uses (diagnostics omitted). */
export async function createTicket(input: CreateTicketInput): Promise<TicketReceipt> {
  const res = await apiClient.post('/support/tickets', input)
  return { id: String(res?.id ?? ''), reference: String(res?.reference ?? '') }
}
