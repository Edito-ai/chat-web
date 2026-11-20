import { create } from 'zustand'

/**
 * The API sleeps when nobody uses it (AWS stops its only task after ~30 idle minutes) and wakes on the next requests,
 * which takes ~1-3 minutes. While it wakes, the load balancer answers 503 without CORS headers, so the browser sees a
 * network error. Requests in that window wait and retry instead of failing, and `since` drives the "Waking up" banner.
 */
export const useServerWake = create<{ since: number | null }>(() => ({ since: null }))

export const WAKE_RETRY_MS = 5_000
/** AWS sees the first requests ~3 min late and the task needs ~2-3 min to start: allow 9 minutes before giving up. */
export const WAKE_MAX_MS = 540_000

/** The load balancer's own answer while no server runs: a gateway status with no JSON body (the app's errors carry JSON). */
export function isWakeResponse(res: Response): boolean {
  if (res.status !== 502 && res.status !== 503 && res.status !== 504) return false
  return !res.headers.get('content-type')?.includes('application/json')
}

/** Only a real browser waits: tests and server rendering fail fast, as before. */
export function wakeRetryEnabled(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

export function markWaking(startedAt: number): void {
  if (useServerWake.getState().since === null) useServerWake.setState({ since: startedAt })
}

export function markAwake(): void {
  if (useServerWake.getState().since !== null) useServerWake.setState({ since: null })
}

/** Resolves after `ms`, or rejects at once with the request's own AbortError when it is cancelled. */
export function waitOrAbort(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
