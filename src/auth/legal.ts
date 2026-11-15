import { API_BASE } from '@/lib/env'

export interface LegalVersions {
  termsVersion: string
  privacyVersion: string
}

/** Public `GET /legal`: the Terms/Privacy versions the consent box refers to. Best effort (null when it cannot be read). */
export async function fetchLegalVersions(signal: AbortSignal): Promise<LegalVersions | null> {
  const res = await fetch(`${API_BASE}/legal`, { signal, credentials: 'omit' })
  if (!res.ok) return null
  const body = await res.json()
  const docs: { slug: string; version: string }[] = Array.isArray(body) ? body : (body?.documents ?? [])
  const terms = docs.find((d) => d.slug === 'terms')
  const privacy = docs.find((d) => d.slug === 'privacy')
  return terms && privacy ? { termsVersion: terms.version, privacyVersion: privacy.version } : null
}
