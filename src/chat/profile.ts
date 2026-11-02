/** Pure helpers for the sidebar's profile footer. */

export interface ProfileUser {
  name: string | null
  email: string
  /** Mirrors /auth/me isAdmin; only shows the Admin entry. */
  isAdmin?: boolean
}

/** What to call the person: their name, else the part of the email before the @. */
export function displayName(user: ProfileUser): string {
  const name = user.name?.trim()
  if (name) return name
  const local = user.email.split('@')[0]?.trim()
  return local || user.email
}

type Segmenter = new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> }

/** One uppercase grapheme for the avatar circle ("Shubham Kumar" -> "S", Devanagari keeps its whole letter, "" -> "?"). */
export function initialOf(user: ProfileUser): string {
  const source = displayName(user).trim()
  if (!source) return '?'
  const Seg = (Intl as unknown as { Segmenter?: Segmenter }).Segmenter
  const first = Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(source)][0]?.segment : Array.from(source)[0]
  return (first ?? '?').toLocaleUpperCase()
}
