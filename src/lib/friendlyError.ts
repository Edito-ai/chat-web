export interface FriendlyError {
  /** Plain-language sentence: what happened + what to do. Safe to show as-is. */
  message: string
  /** The original technical text, when it differs from `message` (shown behind a "Details" link). */
  details?: string
}

const NETWORK = /failed to fetch|networkerror|network request failed|load failed|can.t reach the server|err_connection/i
const STATUS_IN_TEXT = /request failed \((\d{3})\)/i

/** HTTP status from an `ApiError` (duck-typed: apiClient imports the auth store, which uses this file) or from the message text. */
function statusOf(e: unknown, raw: string): number {
  const s = (e as { status?: unknown } | null)?.status
  return typeof s === 'number' ? s : Number(STATUS_IN_TEXT.exec(raw)?.[1]) || 0
}

/** True when the failure is the server being unreachable or erroring - as opposed to "you are not signed in". */
export function isServerTrouble(e: unknown): boolean {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return e instanceof TypeError || NETWORK.test(raw) || statusOf(e, raw) >= 500
}

/**
 * Turns a thrown value into copy a person can act on (UI audit U18/U22). Raw `Failed to fetch`
 * and `Request failed (500)` strings tell nobody anything; the original stays available as `details`.
 */
export function friendlyError(e: unknown, fallback = 'Something went wrong. Try again.'): FriendlyError {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  const status = statusOf(e, raw)

  if (e instanceof TypeError || NETWORK.test(raw)) {
    return { message: "Couldn't reach the server. Check your connection and try again.", details: raw || undefined }
  }
  if (status >= 500) {
    return { message: 'Something went wrong on our side. Try again in a moment.', details: raw || undefined }
  }
  if (status === 401) return { message: 'Your session has expired. Sign in again.', details: raw || undefined }
  if (status === 429) return { message: "Too many requests. Wait a moment, then try again.", details: raw || undefined }
  return { message: raw || fallback }
}
