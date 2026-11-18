'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Film, Paperclip, Palette, Scissors, type LucideIcon } from 'lucide-react'
import { useT } from '@/i18n'
import { StylePanel } from './StylePicker'
import { useStyles } from './styles'
import { isInsideTour, useTourWants } from '@/tour/tourStore'

/**
 * The paperclip of the composer. It opens a menu instead of going straight to the file picker:
 *   1. Add your footage / video   (what the paperclip used to do, now the first line)
 *   2. Template                    (Auto, a saved template, a link or a video to copy a look from)
 *   3. Clips from a stream         (cut the best short clips out of a long video or a YouTube / Twitch link)
 * Every line has its own icon. "Template" opens its page inside the menu (with a way back); "Clips" switches the mode on / off.
 */
export function AttachMenu({ disabled, clipsMode, onFootage, onClipsMode, onReference, onReferenceLink }: {
  disabled: boolean
  clipsMode: boolean
  /** Open the file picker (it checks that the person is signed in). */
  onFootage: () => void
  /** Absent = this backend has no clipping: the line is not shown. */
  onClipsMode?: (on: boolean) => void
  onReference?: (files: File[]) => void
  onReferenceLink?: (url: string) => void
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<'menu' | 'style'>('menu')
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const items = useStyles((s) => s.items)
  const chosen = useStyles((s) => s.items?.find((x) => x.id === s.selected) ?? null)
  const styleOn = items !== null && !clipsMode

  const close = () => {
    setOpen(false)
    setPage('menu')
  }

  // The product tour opens the menu to show what is in it, and closes it again on the next step.
  const tourOpen = useTourWants('attachMenu')
  useEffect(() => {
    setOpen(tourOpen)
    setPage('menu')
  }, [tourOpen])

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => {
      if (isInsideTour(e.target)) return
      if (box.current && !box.current.contains(e.target as Node)) close()
    }
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (page === 'style') setPage('menu')
      else close()
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', esc)
    }
  }, [open, page])

  // The first line is focused when the menu opens, so the keyboard works at once.
  useEffect(() => {
    if (open && page === 'menu') list.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
  }, [open, page])

  const onKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (page !== 'menu' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    const all = Array.from(list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])
    const at = all.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (at + 1) % all.length : (at - 1 + all.length) % all.length
    all[next]?.focus()
    e.preventDefault()
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        data-testid="chat-attach"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('chat.menu.open')}
        title={t('chat.menu.open')}
        onClick={() => (open ? close() : setOpen(true))}
        className={clsx(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink-0 active:scale-95 disabled:pointer-events-none disabled:opacity-30',
          (open || clipsMode || chosen) && 'bg-accent/15 text-ink-0',
        )}
      >
        <Paperclip size={20} strokeWidth={1.75} aria-hidden />
      </button>

      {open && (
        <div
          data-testid="chat-attach-menu"
          className="absolute bottom-12 left-0 z-30 w-[min(22rem,calc(100vw-2rem))] origin-bottom-left animate-rise overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-2xl"
        >
          {page === 'menu' ? (
            <div ref={list} role="menu" aria-label={t('chat.menu.open')} onKeyDown={onKeys} className="py-1">
              <Row
                testId="chat-attach-footage"
                icon={Film}
                title={t('chat.menu.footage')}
                hint={t('chat.menu.footage.hint')}
                accent
                onClick={() => {
                  close()
                  onFootage()
                }}
              />
              {styleOn && (
                <Row
                  testId="chat-attach-template"
                  icon={Palette}
                  title={t('chat.menu.template')}
                  hint={t('chat.menu.template.hint')}
                  value={chosen ? chosen.name : t('chat.style.auto')}
                  chevron
                  onClick={() => setPage('style')}
                />
              )}
              {onClipsMode && (
                <Row
                  testId="chat-attach-clips"
                  icon={Scissors}
                  title={t('chat.menu.clips')}
                  hint={t('chat.menu.clips.hint')}
                  checked={clipsMode}
                  onClick={() => {
                    onClipsMode(!clipsMode)
                    close()
                  }}
                />
              )}
            </div>
          ) : (
            <div>
              <button
                type="button"
                data-testid="chat-attach-back"
                onClick={() => setPage('menu')}
                className="flex w-full items-center gap-2 border-b border-line px-3 py-2.5 text-left text-label font-medium text-ink-0 hover:bg-white/[0.05]"
              >
                <ChevronLeft size={16} className="text-ink-3" aria-hidden />
                <Palette size={15} className="text-accent" aria-hidden />
                {t('chat.menu.template')}
              </button>
              <StylePanel onDone={close} onReference={onReference} onReferenceLink={onReferenceLink} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ icon: Icon, title, hint, value, accent, checked, chevron, onClick, testId }: {
  icon: LucideIcon
  title: string
  hint: string
  value?: string
  accent?: boolean
  checked?: boolean
  chevron?: boolean
  onClick: () => void
  testId: string
}) {
  const check = checked !== undefined
  return (
    <button
      type="button"
      role={check ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={check ? checked : undefined}
      data-testid={testId}
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06]',
        accent && 'bg-accent/[0.08]',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
          accent ? 'bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] text-white' : 'bg-white/[0.07] text-ink-1',
        )}
      >
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label font-medium text-ink-0">{title}</span>
        <span className="block text-caption leading-snug text-ink-3">{hint}</span>
      </span>
      <Trailing value={value} checked={checked} chevron={chevron} />
    </button>
  )
}

function Trailing({ value, checked, chevron }: { value?: string; checked?: boolean; chevron?: boolean }): ReactNode {
  return (
    <>
      {value && <span className="max-w-[6rem] shrink-0 truncate rounded-full bg-white/[0.07] px-2 py-0.5 text-caption text-ink-2">{value}</span>}
      {checked && <Check size={16} className="shrink-0 text-accent" aria-hidden />}
      {chevron && <ChevronRight size={15} className="shrink-0 text-ink-4" aria-hidden />}
    </>
  )
}
