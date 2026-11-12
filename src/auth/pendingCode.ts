/**
 * The "enter the code we emailed you" step must survive a page reload.
 *
 * On a phone the person leaves the page to open their mail app. The browser is free to reload or discard that tab while it
 * is in the background (or the mail app opens the link in a new tab), and the step lived only in React state, so they came
 * back to an empty /login form and could not finish registering. This keeps just the email, for a short time, in
 * localStorage (not sessionStorage: a new tab must find it too). No password and no code is ever stored.
 *
 * The account already exists once the code is mailed; the code itself expires after 10 minutes, but "send a new code" is on the
 * same screen, so the step is kept a little longer than the code.
 */

const KEY = 'edito.chat-web.auth.pendingCode.v1'
export const PENDING_CODE_TTL_MS = 30 * 60 * 1000

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null // storage blocked (private mode, policy): the step simply does not survive a reload
  }
}

export function savePendingCode(email: string, now: number = Date.now()): void {
  const clean = email.trim()
  if (!clean) return
  try {
    storage()?.setItem(KEY, JSON.stringify({ email: clean, savedAt: now }))
  } catch {
    // quota or blocked: nothing to do
  }
}

/** The email waiting for its code, or null when there is none, it is stale, or the stored value is not ours. */
export function loadPendingCode(now: number = Date.now()): string | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { email?: unknown; savedAt?: unknown }
    if (typeof v.email === 'string' && v.email && typeof v.savedAt === 'number' && now - v.savedAt >= 0 && now - v.savedAt < PENDING_CODE_TTL_MS) {
      return v.email
    }
  } catch {
    // unreadable: fall through and drop it
  }
  clearPendingCode()
  return null
}

export function clearPendingCode(): void {
  try {
    storage()?.removeItem(KEY)
  } catch {
    // nothing to do
  }
}
