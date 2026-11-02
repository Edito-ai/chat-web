'use client'

import clsx from 'clsx'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useT } from '@/i18n'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog: portal to <body>, aria-modal + aria-labelledby, Tab wraps inside, Escape and the backdrop close,
 * page scroll locked, focus returns to what opened it (or `returnFocusTo` if that element is gone).
 * Bottom sheet below the sm breakpoint, centred card above.
 */
export function Dialog({
  title,
  onClose,
  children,
  headerExtra,
  returnFocusTo = '[data-testid="chat-profile-button"]',
  testId,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  headerExtra?: ReactNode
  returnFocusTo?: string
  testId?: string
}) {
  const { t } = useT()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    // Start on the first control that is not the Close button, so a quick Enter never dismisses by accident.
    const start = panel?.querySelector<HTMLElement>(`${FOCUSABLE.split(',').map((s) => `[data-dialog-body] ${s}`).join(',')}`)
    ;(start ?? panel)?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const a = items[0]!
      const z = items[items.length - 1]!
      if (e.shiftKey && (document.activeElement === a || !panel.contains(document.activeElement))) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && (document.activeElement === z || !panel.contains(document.activeElement))) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      const back = opener && opener.isConnected ? opener : document.querySelector<HTMLElement>(returnFocusTo)
      back?.focus()
    }
  }, [returnFocusTo])

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" data-testid={testId}>
      <div aria-hidden className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onMouseDown={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[92dvh] w-full max-w-[34rem] flex-col overflow-hidden border border-line-strong bg-surface-2 shadow-lift outline-none',
          'rounded-t-2xl sm:max-h-[86dvh] sm:rounded-2xl',
        )}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate font-serif text-heading text-ink-0">
            {title}
          </h2>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink-0"
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div data-dialog-body className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
