'use client'

import clsx from 'clsx'
import { useRouter } from 'next/navigation'
import { PanelLeftClose, SquarePen } from 'lucide-react'
import { useLocale, useT, type MessageKey } from '@/i18n'
import { Button, IconButton, Logo } from '@/components/ui'
import { groupHistory, type HistoryItem } from './history'

/** "14:05" for today's rows, "3 Oct" for older ones. */
function stamp(t: number, now: number, locale: string): string {
  const d = new Date(t)
  const sameDay = d.toDateString() === new Date(now).toDateString()
  return sameDay
    ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

function StatusDot({ status }: { status: HistoryItem['status'] }) {
  const { t } = useT()
  return (
    <span
      role="img"
      aria-label={t(`nav.status.${status}` as MessageKey)}
      className={clsx(
        'h-1.5 w-1.5 shrink-0 rounded-full',
        status === 'running' && 'animate-pulse-ring bg-accent',
        status === 'complete' && 'bg-success',
        status === 'failed' && 'bg-danger',
      )}
    />
  )
}

export interface SidebarProps {
  items: HistoryItem[]
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  signedIn: boolean
  /** Whether the auth state is still being restored (no sign-in hint yet). */
  restoring: boolean
  activeJobId: string | null
  now: number
  disabled: boolean
  onNew: () => void
  onOpen: (jobId: string) => void
  onRetry: () => void
  onClose: () => void
}

/** Left rail: brand, New chat, and the user's recent chats grouped by day. Arrow-free: plain buttons in tab order. */
export function Sidebar({ items, loadState, signedIn, restoring, activeJobId, now, disabled, onNew, onOpen, onRetry, onClose }: SidebarProps) {
  const { t } = useT()
  const locale = useLocale((s) => s.locale)
  const router = useRouter()
  const groups = groupHistory(items, now)
  return (
    <div data-testid="chat-sidebar" className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <Logo />
        <IconButton icon={PanelLeftClose} aria-label={t('nav.collapse')} onClick={onClose} className="h-8 w-8" />
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          data-testid="chat-new-side"
          disabled={disabled}
          onClick={onNew}
          className="group flex h-10 w-full items-center gap-2.5 rounded-xl border border-line-strong bg-white/[0.03] px-3 text-body font-medium text-ink-0 transition-colors hover:bg-white/[0.07] disabled:opacity-40"
        >
          <SquarePen size={15} strokeWidth={1.75} aria-hidden className="text-ink-2 group-hover:text-ink-0" />
          {t('chat.new')}
        </button>
      </div>

      <nav aria-label={t('nav.aria')} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
        <h2 className="px-2 pb-1 font-serif text-title text-ink-2">{t('nav.recent')}</h2>
        {!signedIn ? (
          restoring ? null : (
            <div className="mx-1 mt-2 space-y-3 rounded-xl border border-dashed border-line-strong p-3.5">
              <p className="text-label text-ink-3">{t('nav.signedOut')}</p>
              <Button variant="secondary" className="h-9 w-full" onClick={() => router.push('/login')}>
                {t('auth.login')}
              </Button>
            </div>
          )
        ) : loadState === 'loading' && items.length === 0 ? (
          <p role="status" className="px-2 py-3 text-label text-ink-3">
            {t('nav.loading')}
          </p>
        ) : loadState === 'error' && items.length === 0 ? (
          <div role="alert" className="space-y-2 px-2 py-3 text-label text-ink-3">
            <p>{t('nav.error')}</p>
            <Button variant="ghost" className="h-8" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-label text-ink-3">{t('nav.empty')}</p>
        ) : (
          groups.map((g) => (
            <section key={g.id} aria-label={t(`nav.group.${g.id}` as MessageKey)} className="mt-3">
              <h3 className="px-2 pb-1 text-caption font-medium uppercase tracking-[0.08em] text-ink-4">
                {t(`nav.group.${g.id}` as MessageKey)}
              </h3>
              <ul className="space-y-px">
                {g.items.map((item) => {
                  const current = item.jobId === activeJobId
                  return (
                    <li key={item.jobId}>
                      <button
                        type="button"
                        data-testid={`chat-history-${item.jobId}`}
                        aria-current={current ? 'true' : undefined}
                        disabled={disabled}
                        onClick={() => onOpen(item.jobId)}
                        className={clsx(
                          'flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors disabled:opacity-50',
                          current ? 'bg-white/[0.08] text-ink-0' : 'text-ink-1 hover:bg-white/[0.05] hover:text-ink-0',
                        )}
                      >
                        <StatusDot status={item.status} />
                        <span className="min-w-0 flex-1 truncate text-body">{item.title}</span>
                        <span className="shrink-0 font-mono text-caption tabular-nums text-ink-4">
                          {stamp(item.updatedAt, now, locale)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </nav>
    </div>
  )
}
