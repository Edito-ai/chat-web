'use client'

import { Check, LifeBuoy, X } from 'lucide-react'
import { useT } from '@/i18n'
import { useHelp } from '@/account/helpStore'
import type { ChatAssistantMessage } from './chatTypes'
import { STUCK_AFTER_MS } from './useStuckNudge'

/** "Is everything fine?" card shown when a running edit has sat in the same state for 5 minutes. */
export function StuckNudge({ message, onDismiss }: { message: ChatAssistantMessage; onDismiss: () => void }) {
  const { t } = useT()
  const show = useHelp((s) => s.show)
  const report = () => {
    const stage = message.stage ?? message.status
    show('bug', {
      subject: t('nudge.subject', { stage }),
      message: t('nudge.message', { stage }),
      context: { stuck: true, jobId: message.jobId, turn: message.turn, status: message.status, stage: message.stage, progress: message.progress, stuckMinutes: STUCK_AFTER_MS / 60_000 },
    })
    onDismiss()
  }
  return (
    <div
      role="alertdialog"
      aria-labelledby="stuck-title"
      data-testid="stuck-nudge"
      className="fixed right-5 top-16 z-30 w-[min(22rem,calc(100vw-2rem))] animate-fade-in rounded-2xl border border-white/15 bg-surface-2 p-4 shadow-lift max-md:right-3 max-md:top-14"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common.close')}
        className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-white/[0.08] hover:text-ink-0"
      >
        <X size={14} aria-hidden />
      </button>
      <p id="stuck-title" className="pr-6 text-title font-semibold text-ink-0">{t('nudge.title')}</p>
      <p className="mt-1 text-label leading-relaxed text-ink-2">{t('nudge.body')}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-testid="stuck-fine"
          onClick={onDismiss}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/[0.08] text-label font-medium text-ink-0 hover:bg-white/[0.14]"
        >
          <Check size={14} aria-hidden />
          {t('nudge.fine')}
        </button>
        <button
          type="button"
          data-testid="stuck-report"
          onClick={report}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white text-label font-semibold text-black hover:bg-white/90"
        >
          <LifeBuoy size={14} aria-hidden />
          {t('nudge.report')}
        </button>
      </div>
    </div>
  )
}
