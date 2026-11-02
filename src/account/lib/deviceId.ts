/**
 * Device fingerprint for the free-trial abuse guard (`POST /billing/trial/checkout-session`). Not a credential: a
 * best-effort signal so one device cannot take the trial twice. Mirrors the editor's web path
 * (Frontend shared/lib/deviceId.ts): a persisted random id mixed with coarse browser signals and hashed.
 */
const KEY = 'broll_device_id'

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function persistedId(): string {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export async function getDeviceFingerprint(): Promise<{ fingerprint: string; platform: 'web' }> {
  const id = persistedId()
  const signal = [id, navigator.userAgent, `${screen.width}x${screen.height}`, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|')
  try {
    return { fingerprint: await sha256Hex(signal), platform: 'web' }
  } catch {
    return { fingerprint: id, platform: 'web' }
  }
}
