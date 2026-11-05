'use client'

import { BrandTile } from '@/components/BrandTile'
import { useT } from '@/i18n'

export function Restoring() {
  const { t } = useT()
  return (
    <div className="app-shell grid h-full place-items-center text-ink-3" role="status">
      <span className="flex flex-col items-center gap-4 text-body">
        <BrandTile size={56} mode="pulse" />
        {t('auth.restoring')}
      </span>
    </div>
  )
}
