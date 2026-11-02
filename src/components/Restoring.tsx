'use client'

import { Loader2 } from 'lucide-react'
import { useT } from '@/i18n'

export function Restoring() {
  const { t } = useT()
  return (
    <div className="app-shell grid h-full place-items-center text-ink-3" role="status">
      <span className="flex items-center gap-2 text-body">
        <Loader2 size={16} className="animate-spin" aria-hidden /> {t('auth.restoring')}
      </span>
    </div>
  )
}
