'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronsUpDown, LogOut } from 'lucide-react'
import { useT } from '@/i18n'
import { displayName, initialOf, type ProfileUser } from './profile'

/** The signed-in person at the foot of the sidebar: initial circle, name, email, and a small menu with Sign out. */
export function ProfileMenu({ user, onSignOut }: { user: ProfileUser; onSignOut: () => void }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const name = displayName(user)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} data-testid="chat-profile" className="relative shrink-0 border-t border-line p-2">
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute inset-x-2 bottom-full mb-1 rounded-xl border border-line-strong bg-surface-2 p-1 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-body font-medium text-ink-0">{name}</p>
            <p className="truncate text-label text-ink-3">{user.email}</p>
          </div>
          <div role="separator" className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            data-testid="chat-sign-out"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-body text-ink-1 transition-colors hover:bg-white/[0.06] hover:text-ink-0"
          >
            <LogOut size={15} strokeWidth={1.75} aria-hidden className="text-ink-2" />
            {t('auth.signOut')}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        data-testid="chat-profile-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent-line bg-accent-soft font-serif text-title text-accent"
        >
          {initialOf(user)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-ink-0">{name}</span>
          <span className="block truncate text-caption text-ink-3">{user.email}</span>
        </span>
        <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3" />
        <span className="sr-only">{t('nav.account')}</span>
      </button>
    </div>
  )
}
