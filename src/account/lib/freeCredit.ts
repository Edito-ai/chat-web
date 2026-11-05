/** Pure parts of the free-credit banner: phone check, error mapping, when to show. */
import { friendlyError } from '@/lib/friendlyError'
import type { FreeCreditStatus } from '../types'

export const PHONE_MIN = 7
export const PHONE_MAX = 24
const PHONE_CHARS = /^\+?[0-9][0-9 \-]*$/

export type PhoneProblem = 'empty' | 'chars' | 'short' | 'long'

/** Light client check only; the backend decides whether the number is real. */
export function validatePhone(raw: string): { ok: true; phone: string } | { ok: false; problem: PhoneProblem } {
  const phone = raw.trim()
  if (phone === '') return { ok: false, problem: 'empty' }
  if (!PHONE_CHARS.test(phone)) return { ok: false, problem: 'chars' }
  if (phone.length > PHONE_MAX) return { ok: false, problem: 'long' }
  if (phone.length < PHONE_MIN || phone.replace(/\D/g, '').length < PHONE_MIN) return { ok: false, problem: 'short' }
  return { ok: true, phone }
}

export type ClaimErrorKind = 'invalid' | 'used' | 'notVerified' | 'other'

function statusOf(e: unknown): number {
  const s = (e as { status?: unknown } | null)?.status
  return typeof s === 'number' ? s : 0
}

/** Maps a failed claim to a kind the UI has copy for; `other` carries the friendly text. */
export function claimErrorKind(e: unknown): { kind: ClaimErrorKind; message: string } {
  const status = statusOf(e)
  const raw = e instanceof Error ? e.message : ''
  const friendly = friendlyError(e).message
  if (status === 409) return { kind: 'used', message: friendly }
  if (/verif/i.test(raw)) return { kind: 'notVerified', message: friendly }
  if (status === 400) return { kind: 'invalid', message: friendly }
  // Show the backend's own sentence plainly, without the "403 " status prefix.
  return { kind: 'other', message: friendly.replace(/^\d{3}\s+/, '') }
}

/** The chat job was refused because the account has no credit or plan (backend 402 `subscription_required`). */
export function isSubscriptionRequired(e: unknown): boolean {
  if (statusOf(e) !== 402) return false
  const reason = (e as { details?: { reason?: unknown } } | null)?.details?.reason
  const raw = e instanceof Error ? e.message : ''
  return reason === 'subscription_required' || /subscription_required|subscription or weekly pass is required/i.test(raw)
}

export type CreditLoad = 'idle' | 'loading' | 'loaded' | 'error'

/** Show only with a real, unclaimed offer. Loading, errors and a claimed credit show nothing. */
export function shouldShowCreditBanner(
  credit: FreeCreditStatus | null,
  load: CreditLoad,
  dismissed: boolean,
  nudge = false,
): boolean {
  if (load !== 'loaded' || !credit || !credit.enabled || credit.claimed) return false
  return nudge || !dismissed
}

const DISMISS_KEY = 'edito.chat-web.freeCreditDismissed'

export function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function writeDismissed(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // not remembered; the banner just comes back on reload
  }
}

export function clearDismissed(): void {
  try {
    sessionStorage.removeItem(DISMISS_KEY)
  } catch {
    // nothing stored
  }
}
