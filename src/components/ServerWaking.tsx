'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useT } from '@/i18n'
import { useServerWake } from '@/lib/serverWake'
import { formatElapsed } from '@/chat/activity'

/** Shown on every screen while a request waits for the sleeping API to wake (see lib/serverWake.ts). */
export function ServerWaking() {
  const { t } = useT()
  const since = useServerWake((s) => s.since)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [since])
  if (since === null) return null
  return (
    <div
      data-testid="server-waking"
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-3 z-[100] flex justify-center px-4 pointer-events-none"
    >
      <div className="pointer-events-auto flex max-w-md animate-rise items-start gap-3 rounded-2xl border border-white/15 bg-surface-2/95 px-4 py-3 shadow-lift backdrop-blur-md">
        <Loader2 size={18} aria-hidden className="mt-0.5 shrink-0 animate-spin text-accent" />
        <div className="min-w-0">
          <p className="shimmer-text text-body font-semibold">{t('wake.title')}</p>
          <p className="mt-0.5 text-label leading-snug text-ink-2">{t('wake.detail')}</p>
          <p className="mt-1 font-mono text-caption tabular-nums text-ink-4">{t('wake.elapsed', { time: formatElapsed(Math.max(0, now - since)) })}</p>
        </div>
      </div>
    </div>
  )
}
