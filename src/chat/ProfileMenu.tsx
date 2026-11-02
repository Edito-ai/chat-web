'use client'

import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { BarChart3, ChevronsUpDown, CreditCard, ExternalLink, Languages, LifeBuoy, LogOut, Scale, ShieldCheck, Sparkles, SquareArrowOutUpRight, type LucideIcon } from 'lucide-react'
import { useLocale, useT, type Locale, type MessageKey } from '@/i18n'
import { EDITOR_URL } from '@/lib/env'
import { AccountDialogs } from '@/account/components/AccountDialogs'
import { PlanBadge } from '@/account/components/PlanBadge'
import { useAccount, type AccountDialog } from '@/account/accountStore'
import { displayName, initialOf, type ProfileUser } from './profile'

const ITEM =
  'flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-body text-ink-1 transition-colors hover:bg-white/[0.06] hover:text-ink-0 focus-visible:bg-white/[0.08] focus-visible:text-ink-0 focus-visible:outline-none'

function MenuButton({ icon: Icon, label, onClick, testId }: { icon: LucideIcon; label: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} data-testid={testId} onClick={onClick} className={ITEM}>
      <Icon size={15} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-2" />
      {label}
    </button>
  )
}

function Sep() {
  return <div role="separator" className="my-1 h-px bg-line" />
}

/** Language row: two radio items so the choice is one keypress and stays visible. */
function LanguageRow() {
  const { t } = useT()
  const locale = useLocale((s) => s.locale)
  const setLocale = useLocale((s) => s.setLocale)
  const opt = (value: Locale, short: MessageKey, full: MessageKey) => (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={locale === value}
      aria-label={t(full)}
      tabIndex={-1}
      lang={value}
      data-testid={`chat-lang-${value}`}
      onClick={() => setLocale(value)}
      className={clsx(
        'min-h-[28px] min-w-[36px] rounded-md px-2 text-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-line',
        locale === value ? 'bg-white/[0.12] text-ink-0' : 'text-ink-3 hover:bg-white/[0.06] hover:text-ink-0',
      )}
    >
      {t(short)}
    </button>
  )
  return (
    <div className="flex min-h-[36px] items-center gap-2.5 px-3 text-body text-ink-1">
      <Languages size={15} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-2" />
      <span className="flex-1">{t('acct.menu.language')}</span>
      <div role="group" aria-label={t('acct.menu.language')} className="flex gap-0.5 rounded-lg border border-line p-0.5">
        {opt('en', 'acct.lang.en', 'acct.lang.enFull')}
        {opt('hi', 'acct.lang.hi', 'acct.lang.hiFull')}
      </div>
    </div>
  )
}

/**
 * The signed-in person at the foot of the sidebar: initial circle, name, email, and the account menu (plan badge,
 * usage, plan and billing, pricing, help, legal, language, editor link, admin, sign out). Arrow keys move through the
 * items, Home/End jump, Esc closes and returns focus to the footer button.
 */
export function ProfileMenu({ user, onSignOut }: { user: ProfileUser; onSignOut: () => void }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const name = displayName(user)
  const refresh = useAccount((s) => s.refresh)
  const openDialog = useAccount((s) => s.openDialog)

  // Plan badge: fetched when the sidebar mounts and again whenever the menu opens (a purchase may have finished).
  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])

  useEffect(() => {
    if (!open) return
    items()[0]?.focus()
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  const onMenuKey = (e: KeyboardEvent) => {
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => {
      e.preventDefault()
      list[(n + list.length) % list.length]?.focus()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i < 0 ? -1 : i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(-1)
    else if (e.key === 'Tab') setOpen(false)
  }

  const pick = (d: AccountDialog, focus?: 'plans') => {
    setOpen(false)
    openDialog(d, focus ? { focus } : undefined)
  }
  const isAdmin = user.isAdmin === true && EDITOR_URL !== ''

  return (
    <div ref={rootRef} data-testid="chat-profile" className="relative shrink-0 border-t border-line p-2">
      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={t('nav.account')}
          onKeyDown={onMenuKey}
          className="scroll-thin absolute inset-x-2 bottom-full mb-1 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl border border-line-strong bg-surface-2 p-1 shadow-lift"
        >
          <div className="px-3 py-2">
            <p className="truncate text-body font-medium text-ink-0">{name}</p>
            <p className="truncate text-label text-ink-3">{user.email}</p>
            <PlanBadge onUpgrade={() => pick('billing', 'plans')} />
          </div>
          <Sep />
          <MenuButton icon={BarChart3} label={t('acct.menu.usage')} testId="chat-menu-usage" onClick={() => pick('usage')} />
          <MenuButton icon={CreditCard} label={t('acct.menu.billing')} testId="chat-menu-billing" onClick={() => pick('billing')} />
          <MenuButton icon={Sparkles} label={t('acct.menu.pricing')} testId="chat-menu-pricing" onClick={() => pick('billing', 'plans')} />
          <Sep />
          <MenuButton icon={LifeBuoy} label={t('acct.menu.help')} testId="chat-menu-help" onClick={() => pick('help')} />
          <MenuButton icon={Scale} label={t('acct.menu.legal')} testId="chat-menu-legal" onClick={() => pick('legal')} />
          <LanguageRow />
          {EDITOR_URL ? (
            <>
              <Sep />
              <a
                role="menuitem"
                tabIndex={-1}
                href={EDITOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="chat-menu-editor"
                onClick={() => setOpen(false)}
                className={ITEM}
              >
                <SquareArrowOutUpRight size={15} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-2" />
                <span className="flex-1">{t('acct.menu.editor')}</span>
                <ExternalLink size={12} aria-hidden className="text-ink-4" />
                <span className="sr-only">{t('acct.newTab')}</span>
              </a>
              {isAdmin ? (
                <a
                  role="menuitem"
                  tabIndex={-1}
                  href={EDITOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="chat-menu-admin"
                  onClick={() => setOpen(false)}
                  className={ITEM}
                >
                  <ShieldCheck size={15} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-2" />
                  <span className="flex-1">{t('acct.menu.admin')}</span>
                  <span className="sr-only">{t('acct.newTab')}</span>
                </a>
              ) : null}
            </>
          ) : null}
          <Sep />
          <MenuButton
            icon={LogOut}
            label={t('auth.signOut')}
            testId="chat-sign-out"
            onClick={() => {
              setOpen(false)
              useAccount.getState().reset()
              onSignOut()
            }}
          />
        </div>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        data-testid="chat-profile-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
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
      <AccountDialogs />
    </div>
  )
}
