'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { useT } from '@/i18n'
import { useAuth } from '@/auth/authStore'
import { Button } from '@/components/ui'
import { Dialog } from '@/components/Dialog'
import { MARKETING_URL } from '@/lib/env'
import { hasSeenTour } from '@/tour/persistence'
import { useTour } from '@/tour/tourStore'

export const PLUGIN_URL = `${MARKETING_URL}/product#resolve`
/** v1: bump the number to show a new announcement to everyone again. */
export const announceKey = (userId: string) => `edito.chat-web.announce.resolve.v1.${userId}`

function seen(userId: string): boolean {
  try {
    return localStorage.getItem(announceKey(userId)) === '1'
  } catch {
    return true // storage blocked: never nag on every visit
  }
}

function remember(userId: string): void {
  try {
    localStorage.setItem(announceKey(userId), '1')
  } catch {
    // storage blocked: nothing to keep
  }
}

/**
 * One-time notice, for every signed-in account that has not seen it in this browser (existing and new): the DaVinci Resolve plugin
 * is out, with a button to its download page. A new account sees the product tour first and this after it; it never shows over
 * onboarding or the tour. Closing it in any way (button, Escape, backdrop) counts as seen.
 */
export function PluginAnnouncement() {
  const { t } = useT()
  const authed = useAuth((s) => s.status === 'authenticated')
  const user = useAuth((s) => s.user)
  const touring = useTour((s) => s.active || s.queued)
  const [open, setOpen] = useState(false)
  const userId = user?.id ?? null
  const ready = authed && !!user && user.needsOnboarding !== true && !touring && hasSeenTour(user)

  useEffect(() => {
    if (!ready || !userId || seen(userId)) return
    const timer = setTimeout(() => setOpen(true), 1500)
    return () => clearTimeout(timer)
  }, [ready, userId])

  if (!open || !userId) return null
  const close = () => {
    remember(userId)
    setOpen(false)
  }
  return (
    <Dialog title={t('announce.resolve.title')} onClose={close} testId="dialog-plugin-announcement">
      <div className="space-y-4">
        <p className="text-body text-ink-1">{t('announce.resolve.body')}</p>
        <ul className="space-y-1.5 text-label text-ink-2">
          <li>• {t('announce.resolve.p1')}</li>
          <li>• {t('announce.resolve.p2')}</li>
          <li>• {t('announce.resolve.p3')}</li>
        </ul>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close} data-testid="plugin-announcement-later">
            {t('announce.resolve.later')}
          </Button>
          <Button
            variant="primary"
            icon={Download}
            data-testid="plugin-announcement-download"
            onClick={() => {
              window.open(PLUGIN_URL, '_blank', 'noopener,noreferrer')
              close()
            }}
          >
            {t('announce.resolve.cta')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
