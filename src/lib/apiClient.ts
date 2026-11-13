import { useAuth } from '@/auth/authStore'
import { API_BASE } from './env'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** A network-level failure (backend down, wrong port, CORS) is a bare `TypeError: Failed to fetch`; name the suspect. */
export async function fetchOrExplain(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new Error(`Can't reach the server at ${API_BASE}. Is the backend running?`)
  }
}

/** Flattens a FastAPI 422 `details` array into "field: reason". */
export function describeDetails(details: unknown): string {
  if (!Array.isArray(details)) return ''
  const parts = details.slice(0, 3).map((d: unknown) => {
    const o = d as { loc?: unknown[]; msg?: string } | null
    return o && typeof o === 'object' && Array.isArray(o.loc) ? `${o.loc.join('.')}: ${o.msg ?? 'invalid'}` : String(d)
  })
  if (parts.length === 0) return ''
  const more = details.length > parts.length ? ` (+${details.length - parts.length} more)` : ''
  return ` - ${parts.join('; ')}${more}`
}

function rawRequest(path: string, options: RequestInit, accessToken: string | null): Promise<Response> {
  const headers = new Headers(options.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  // Bearer auth only: no cookies are sent or accepted, so CORS needs no credentials mode.
  return fetchOrExplain(`${API_BASE}${path}`, { ...options, headers, credentials: 'omit' })
}

let onAccessPending: ((contact: unknown) => void) | null = null
/** The access store registers here (so this file never imports it): called when the server says the account is not approved. */
export function setAccessPendingHandler(fn: ((contact: unknown) => void) | null): void {
  onAccessPending = fn
}

async function parseOrThrow(res: Response): Promise<any> {
  if (res.status === 204) return undefined
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await res.json().catch(() => undefined) : undefined
  if (!res.ok) {
    if (res.status === 403 && body?.code === 'access_pending') onAccessPending?.(body.contact)
    const reason = body?.error ?? body?.detail ?? res.statusText
    throw new ApiError(
      res.status,
      `${res.status} ${typeof reason === 'string' ? reason : res.statusText}${describeDetails(body?.details)}`,
      body?.details,
    )
  }
  return body
}

/**
 * Attaches the bearer token and, on a 401, does exactly one silent refresh and retries once. `/auth/*` never
 * triggers this (a bad login or refresh just fails as itself).
 */
async function request(path: string, options: RequestInit = {}): Promise<any> {
  const auth = useAuth.getState()
  let res = await rawRequest(path, options, auth.accessToken)
  if (res.status === 401 && auth.status === 'authenticated' && !path.startsWith('/auth/')) {
    if (await useAuth.getState().silentRefresh()) res = await rawRequest(path, options, useAuth.getState().accessToken)
  }
  return parseOrThrow(res)
}

type Opts = { signal?: AbortSignal; headers?: Record<string, string> }
const json = (body: unknown) => (body === undefined ? undefined : JSON.stringify(body))

export const apiClient = {
  get: (path: string, opts?: Opts) => request(path, { signal: opts?.signal, headers: opts?.headers }),
  post: (path: string, body?: unknown, opts?: Opts) =>
    request(path, { method: 'POST', body: json(body), signal: opts?.signal, headers: opts?.headers }),
  put: (path: string, body?: unknown, opts?: Opts) =>
    request(path, { method: 'PUT', body: json(body), signal: opts?.signal, headers: opts?.headers }),
  delete: (path: string, opts?: Opts) => request(path, { method: 'DELETE', signal: opts?.signal }),
  upload: (path: string, formData: FormData, opts?: Opts) =>
    request(path, { method: 'POST', body: formData, signal: opts?.signal }),
}
