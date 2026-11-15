import type { OnboardingPayload } from './authStore'

/** The answers of the onboarding screen and what is checked before they are sent. Pure, so it is tested without a screen. */

export interface OnboardingForm {
  name: string
  /** Country code with the plus sign, e.g. `+91`. */
  cc: string
  /** The number as typed, without the country code. */
  phone: string
  contentTypes: string[]
  contentOther: string
  role: string | null
  source: string | null
  platforms: string[]
  handle: string
  followers: string
}

export const EMPTY_FORM: OnboardingForm = {
  name: '', cc: '+91', phone: '', contentTypes: [], contentOther: '', role: null, source: null, platforms: [], handle: '', followers: '',
}

export const COUNTRY_CODES = ['+91', '+1', '+44', '+971', '+61', '+65', '+92', '+880', '+94', '+977', '+49', '+33'] as const

/** What the chips say (the same words are sent, so the team reads the answers as they were shown). */
export const CONTENT_TYPES = ['Reels / Shorts', 'Podcasts', 'Gaming / Streams', 'Educational', 'Vlogs', 'Business / Ads', 'Music'] as const
export const ROLES = ['Solo creator', 'Production house', 'Freelancer', 'Founder'] as const
export const SOURCES = ['Instagram', 'YouTube', 'Google search', 'Friend / referral', 'X / Twitter', 'ChatGPT / AI tool', 'Other'] as const
export const PLATFORMS = ['YouTube', 'Instagram'] as const

export type PhoneProblem = 'empty' | 'chars' | 'short' | 'long' | 'indian'

/** `{ok, phone}` with the full international number (`+919812345670`), or why it is not one. The server checks the rest. */
export function checkPhone(cc: string, raw: string): { ok: true; phone: string } | { ok: false; problem: PhoneProblem } {
  const typed = raw.trim()
  if (typed === '') return { ok: false, problem: 'empty' }
  if (!/^[0-9 \-().]+$/.test(typed)) return { ok: false, problem: 'chars' }
  let digits = typed.replace(/\D/g, '')
  if (cc === '+91') {
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
    if (digits.length < 10) return { ok: false, problem: 'short' }
    if (digits.length > 10 || !/^[6-9]/.test(digits)) return { ok: false, problem: 'indian' }
  } else {
    if (digits.length < 6) return { ok: false, problem: 'short' }
    if (digits.length > 14) return { ok: false, problem: 'long' }
  }
  return { ok: true, phone: `${cc}${digits}` }
}

/** "12k", "1.2m", "12,500", "12 500", "1.5 lakh" -> a whole number; '' -> null (not given); anything else -> 'invalid'. */
export function parseFollowers(raw: string): number | null | 'invalid' {
  const s = raw.trim().toLowerCase().replace(/[, ]/g, '')
  if (s === '') return null
  const m = /^(\d+(?:\.\d+)?)(k|m|b|lakh|lac|cr|crore)?$/.exec(s)
  if (!m) return 'invalid'
  const mult = { k: 1e3, m: 1e6, b: 1e9, lakh: 1e5, lac: 1e5, cr: 1e7, crore: 1e7 }[m[2] as 'k'] ?? 1
  const n = Math.round(Number(m[1]) * mult)
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000_000 ? n : 'invalid'
}

export type StepProblem = 'name' | PhoneProblem | 'followers'

/** The first problem of a step (1 = about you, 2 = your content, 3 = your reach), or null. Only step 1 is required. */
export function stepProblem(step: 1 | 2 | 3, f: OnboardingForm): StepProblem | null {
  if (step === 1) {
    if (f.name.trim() === '') return 'name'
    const p = checkPhone(f.cc, f.phone)
    return p.ok ? null : p.problem
  }
  if (step === 3 && parseFollowers(f.followers) === 'invalid') return 'followers'
  return null
}

/** The request body. Optional answers that were left empty are left out, never sent as blanks. */
export function toPayload(f: OnboardingForm): OnboardingPayload {
  const phone = checkPhone(f.cc, f.phone)
  if (!phone.ok) throw new Error('phone')
  const other = f.contentOther.trim()
  const content = [...f.contentTypes, ...(other ? [other] : [])]
  const followers = parseFollowers(f.followers)
  const handle = f.handle.trim()
  return {
    name: f.name.trim(),
    phone: phone.phone,
    ...(content.length ? { contentTypes: content } : {}),
    ...(f.role ? { professionTypes: [f.role] } : {}),
    ...(f.source ? { referralSources: [f.source] } : {}),
    ...(f.platforms.length ? { socialPlatforms: f.platforms } : {}),
    ...(handle ? { socialHandle: handle } : {}),
    ...(typeof followers === 'number' ? { followersCount: followers } : {}),
  }
}

/** Toggle `v` in a list, keeping the order picked and at most `max` items. */
export function toggle(list: string[], v: string, max = 8): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]
}
