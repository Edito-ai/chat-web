/**
 * Opening a checkout in a NEW tab. A blank tab is opened synchronously inside the click (so popup blockers allow it),
 * detached from this page (`opener = null`, the same isolation as `noopener`), then pointed at the URL once the
 * backend has answered.
 */

const RAZORPAY_HOSTS = ['razorpay.com', 'rzp.io']

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** Only http(s) may be opened; a Razorpay page must be https on a Razorpay host. Mirrors the editor's vetting. */
export function isSafeCheckoutUrl(url: string): boolean {
  const u = parse(url)
  if (!u) return false
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.toLowerCase()
  const razorpay = RAZORPAY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))
  return !razorpay || u.protocol === 'https:'
}

export interface PendingTab {
  navigate: (url: string) => 'opened' | 'blocked' | 'unsafe'
  abort: () => void
}

export function openCheckoutTab(open: typeof window.open = (...a) => window.open(...a)): PendingTab {
  const w = open('about:blank', '_blank')
  if (w) {
    try {
      w.opener = null
    } catch {
      // cross-origin guard: nothing to detach
    }
  }
  return {
    navigate: (url) => {
      if (!isSafeCheckoutUrl(url)) {
        w?.close()
        return 'unsafe'
      }
      if (!w || w.closed) return 'blocked'
      w.location.href = url
      return 'opened'
    },
    abort: () => w?.close(),
  }
}
