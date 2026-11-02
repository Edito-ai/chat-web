'use client'

import { useEffect, useRef } from 'react'
import { useT } from '@/i18n'
import { Button, InlineError } from '@/components/ui'

/** The confirmation step before POST /billing/subscription/cancel; it states what the backend really does. */
export function CancelPanel({
  endDate,
  busy,
  error,
  onKeep,
  onConfirm,
}: {
  endDate: string
  busy: boolean
  error: unknown
  onKeep: () => void
  onConfirm: () => void
}) {
  const { t } = useT()
  const keepRef = useRef<HTMLButtonElement>(null)
  useEffect(() => keepRef.current?.focus(), [])
  return (
    <section role="group" aria-labelledby="cancel-h" data-testid="bill-cancel-confirm" className="space-y-3 rounded-xl border border-danger/40 bg-danger-soft p-4">
      <h3 id="cancel-h" className="text-body font-medium text-ink-0">{t('acct.bill.cancelTitle')}</h3>
      <p className="text-label text-ink-1">{endDate ? t('acct.bill.cancelBody', { date: endDate }) : t('acct.bill.cancelBodyNoDate')}</p>
      {error ? <InlineError error={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <button
          ref={keepRef}
          type="button"
          onClick={onKeep}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface-3 px-3.5 text-body font-semibold text-ink-0 hover:bg-surface-4 disabled:opacity-40"
        >
          {t('acct.bill.cancelKeep')}
        </button>
        <Button variant="ghost" className="h-9 text-danger hover:text-danger" onClick={onConfirm} disabled={busy} data-testid="bill-cancel-yes">
          {busy ? t('acct.bill.cancelling') : t('acct.bill.cancelConfirm')}
        </Button>
      </div>
    </section>
  )
}
