'use client'

import clsx from 'clsx'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pin, PinOff, PanelLeftClose, SquarePen, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { useLocale, useT, type MessageKey } from '@/i18n'
import { Button, IconButton, Logo } from '@/components/ui'
import { groupHistory, type HistoryItem } from './history'
import { ProfileMenu } from './ProfileMenu'
import type { ProfileUser } from './profile'

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


/** The "..." menu of one chat row: pin or unpin, and delete (asks first). Rendered in a portal so the list never clips it. */
function RowMenu({
  item,
  onPin,
  onDelete,
}: {
  item: HistoryItem
  onPin: (jobId: string, pinned: boolean) => void
  onDelete: (jobId: string) => void
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const r = trigger.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e instanceof MouseEvent && (panel.current?.contains(e.target as Node) || trigger.current?.contains(e.target as Node))) return
      setOpen(false)
      if (e instanceof KeyboardEvent) trigger.current?.focus()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const itemCls =
    'flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-body transition-colors hover:bg-white/[0.07] focus-visible:bg-white/[0.07]'
  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-testid={`chat-row-menu-${item.jobId}`}
        aria-label={t('nav.row.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-3 transition-opacity hover:bg-white/[0.08] hover:text-ink-0',
          open ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100',
        )}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            aria-label={t('nav.row.menu')}
            style={{ position: 'fixed', top: pos.top, right: pos.right }}
            className="z-[60] w-52 animate-fade-in rounded-xl border border-white/15 bg-surface-2 p-1 shadow-lift"
          >
            <button
              type="button"
              role="menuitem"
              data-testid={`chat-row-pin-${item.jobId}`}
              className={clsx(itemCls, 'text-ink-1')}
              onClick={() => {
                setOpen(false)
                onPin(item.jobId, !item.pinned)
              }}
            >
              {item.pinned ? <PinOff size={15} aria-hidden /> : <Pin size={15} aria-hidden />}
              {t(item.pinned ? 'nav.row.unpin' : 'nav.row.pin')}
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid={`chat-row-delete-${item.jobId}`}
              className={clsx(itemCls, 'text-danger')}
              onClick={() => {
                setOpen(false)
                setConfirming(true)
              }}
            >
              <Trash2 size={15} aria-hidden />
              {t('nav.row.delete')}
            </button>
          </div>,
          document.body,
        )}
      {confirming && (
        <Dialog title={t('nav.delete.title')} onClose={() => setConfirming(false)} returnFocusTo={`[data-testid="chat-row-menu-${item.jobId}"]`} testId="chat-delete-dialog">
          <div className="space-y-4 px-5 pb-5 pt-3">
            <p className="text-body text-ink-2">{t('nav.delete.body')}</p>
            <p className="truncate rounded-lg bg-white/[0.05] px-3 py-2 text-label text-ink-1">{item.title}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirming(false)} data-testid="chat-delete-cancel">
                {t('nav.delete.cancel')}
              </Button>
              <Button
                variant="secondary"
                className="!border-danger/40 !text-danger hover:!bg-danger-soft"
                data-testid="chat-delete-confirm"
                onClick={() => {
                  setConfirming(false)
                  onDelete(item.jobId)
                }}
              >
                {t('nav.delete.confirm')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
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
  onPin: (jobId: string, pinned: boolean) => void
  onDelete: (jobId: string) => void
  onClose: () => void
  /** Rendered inside the mobile drawer: the close control is an X and touch targets are larger. */
  drawer?: boolean
  /** The signed-in person, shown at the foot of the rail with a Sign out menu. */
  user: ProfileUser | null
  onSignOut: () => void
}

/** Left rail: brand, New chat, and the user's recent chats grouped by day. Arrow-free: plain buttons in tab order. */
export function Sidebar({ items, loadState, signedIn, restoring, activeJobId, now, disabled, onNew, onOpen, onRetry, onPin, onDelete, onClose, drawer = false, user, onSignOut }: SidebarProps) {
  const { t } = useT()
  const locale = useLocale((s) => s.locale)
  const router = useRouter()
  const groups = groupHistory(items, now)
  // The signed-in person's footer is there as soon as the page has loaded, also while the session is being checked (the
  // name and email come from browser storage). Only after mount: the server-rendered page never has them.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <div data-testid="chat-sidebar" className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <Logo />
        <IconButton icon={drawer ? X : PanelLeftClose} aria-label={t(drawer ? 'nav.close' : 'nav.collapse')} onClick={onClose} className="h-10 w-10 md:h-8 md:w-8" />
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          data-testid="chat-new-side"
          disabled={disabled}
          onClick={onNew}
          className="group flex h-11 w-full items-center gap-2.5 rounded-xl md:h-10 border border-line-strong bg-white/[0.03] px-3 text-body font-medium text-ink-0 transition-colors hover:bg-white/[0.07] disabled:opacity-40"
        >
          <SquarePen size={15} strokeWidth={1.75} aria-hidden className="text-ink-2 group-hover:text-ink-0" />
          {t('chat.new')}
        </button>
      </div>

      <nav aria-label={t('nav.aria')} className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-2">
        <h2 className="px-2 pb-1 text-body font-medium text-ink-2">{t('nav.recent')}</h2>
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
              <h3 className="px-2 pb-1 text-caption font-medium text-ink-4">
                {t(`nav.group.${g.id}` as MessageKey)}
              </h3>
              <ul className="space-y-px">
                {g.items.map((item) => {
                  const current = item.jobId === activeJobId
                  return (
                    <li key={item.jobId} className="group relative flex items-center rounded-lg">
                      <button
                        type="button"
                        data-testid={`chat-history-${item.jobId}`}
                        aria-current={current ? 'true' : undefined}
                        disabled={disabled}
                        onClick={() => onOpen(item.jobId)}
                        className={clsx(
                          'flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-50 md:min-h-[36px] md:px-2 md:py-1.5',
                          current ? 'bg-white/[0.08] text-ink-0' : 'text-ink-1 hover:bg-white/[0.05] hover:text-ink-0',
                        )}
                      >
                        <StatusDot status={item.status} />
                        <span className="min-w-0 flex-1 truncate text-body">{item.title}</span>
                        {item.pinned && <Pin size={11} aria-label={t('nav.group.pinned')} className="shrink-0 text-ink-4" />}
                        <span className="shrink-0 font-mono text-caption tabular-nums text-ink-4">
                          {stamp(item.updatedAt, now, locale)}
                        </span>
                      </button>
                      <RowMenu item={item} onPin={onPin} onDelete={onDelete} />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </nav>

      {mounted && (signedIn || restoring) && user ? <ProfileMenu user={user} onSignOut={onSignOut} /> : null}
    </div>
  )
}
