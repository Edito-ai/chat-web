import { apiClient } from './apiClient'
import { useServerWake } from './serverWake'

/**
 * The first keystroke of a prompt tells the API that an edit is coming: it starts a render worker (or keeps the waiting one), so the edit does
 * not wait ~80 s for a Fargate task. It waits ~5 minutes for the prompt to be sent. Best effort: a failure, an old API without the route, or a
 * sleeping server never shows anything to the person, and it is sent at most once every 4 minutes.
 */
export const WARM_EVERY_MS = 4 * 60_000

let last = 0

export function warmWorker(now: number = Date.now()): void {
  if (typeof window === 'undefined') return
  if (now - last < WARM_EVERY_MS) return
  if (useServerWake.getState().since !== null) return // the server is waking up: this ping must not add to the wait
  last = now
  void Promise.resolve(apiClient.post('/chat/warm')).catch(() => undefined)
}

/** Tests. */
export function resetWarmWorker(): void {
  last = 0
}
