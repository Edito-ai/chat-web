'use client'

import { Gift } from 'lucide-react'
import { useT } from '@/i18n'
import { Button, InlineError } from '@/components/ui'
import { Dialog } from '@/components/Dialog'
import { accountApi } from '../accountApi'
import { useAccount } from '../accountStore'
import { formatHours, formatTokens } from '../lib/usage'
import { useAsync } from '../useAsync'
import { TokenMeter } from './TokenMeter'

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div data-testid={testId} className="rounded-xl border border-line bg-black/20 p-3">
      <p className="text-caption text-ink-3">{label}</p>
      <p className="mt-1 font-mono text-title tabular-nums text-ink-0">{value}</p>
    </div>
  )
}

/** Usage: the token ledger, footage hours and prompts today, and the starter-credit status when the backend reports one. */
export function UsageDialog() {
  const { t } = useT()
  const close = useAccount((s) => s.closeDialog)
  const openDialog = useAccount((s) => s.openDialog)
  const showCredit = useAccount((s) => s.showCredit)
  const tokens = useAsync(() => accountApi().tokenUsage())
  const sub = useAsync(() => accountApi().subscription())
  const credit = useAsync(() => accountApi().freeCredit())

  const s = sub.data
  const footage = s ? (s.footageHoursCap != null ? t('acct.usage.footageVal', { used: formatHours(s.footageHoursUsed), cap: formatHours(s.footageHoursCap) }) : t('acct.usage.footageNoCap', { used: formatHours(s.footageHoursUsed) })) : '-'
  const c = credit.data
  const creditAmount = c ? formatTokens(c.tokens) : ''

  return (
    <Dialog title={t('acct.usage.title')} onClose={close} testId="dialog-usage">
      <div className="space-y-3">
        {tokens.loading && !tokens.data && !tokens.error ? (
          <p role="status" className="text-label text-ink-3">{t('common.loading')}</p>
        ) : tokens.error ? (
          <InlineError message={t('acct.usage.loadError')} onRetry={tokens.reload} />
        ) : tokens.data ? (
          <TokenMeter usage={tokens.data} />
        ) : (
          <section data-testid="usage-noplan" className="rounded-xl border border-dashed border-line-strong p-4">
            <h3 className="text-body font-medium text-ink-0">{t('acct.usage.noPlan')}</h3>
            <p className="mt-1 text-label text-ink-3">{t('acct.usage.noPlanBody')}</p>
            <Button variant="secondary" className="mt-3 h-9" onClick={() => openDialog('billing', { focus: 'plans' })}>
              {t('acct.usage.seePlans')}
            </Button>
          </section>
        )}

        {sub.error ? (
          <InlineError message={t('acct.usage.loadError')} onRetry={sub.reload} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat testId="usage-footage" label={t('acct.usage.footage')} value={footage} />
            <Stat testId="usage-prompts" label={t('acct.usage.prompts')} value={s ? String(s.promptCountToday) : '-'} />
          </div>
        )}

        {c && (c.enabled || c.claimed) ? (
          <section data-testid="usage-credit" className="flex items-start gap-3 rounded-xl border border-line bg-black/20 p-3">
            <Gift size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />
            <div>
              <h3 className="text-label font-medium text-ink-1">{t('acct.usage.credit')}</h3>
              <p className="mt-0.5 text-label text-ink-3">
                {c.claimed
                  ? c.phoneMasked
                    ? t('acct.usage.creditClaimedWith', { amount: creditAmount, phone: c.phoneMasked })
                    : t('acct.usage.creditClaimed', { amount: creditAmount })
                  : t('acct.usage.creditOffer', { amount: creditAmount })}
              </p>
              {!c.claimed && (
                <Button
                  variant="secondary"
                  className="mt-2 h-8"
                  data-testid="usage-credit-claim"
                  onClick={() => {
                    showCredit()
                    close()
                  }}
                >
                  {t('acct.usage.creditClaimNow')}
                </Button>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </Dialog>
  )
}
