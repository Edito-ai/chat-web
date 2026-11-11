'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Check, Palette, Plus, Trash2 } from 'lucide-react'
import { useT } from '@/i18n'
import { useStyles } from './styles'

/**
 * The style the next edit follows: "Auto" (designed from the video) or one of the person's saved styles. Saved styles
 * come from reference videos: mark an attached video as a reference and it is read into a new style.
 */
export function StylePicker({ disabled, onReference }: { disabled: boolean; onReference?: (files: File[]) => void }) {
  const { t } = useT()
  const items = useStyles((s) => s.items)
  const selected = useStyles((s) => s.selected)
  const { select, remove } = useStyles.getState()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  if (items === null) return null
  const current = items.find((s) => s.id === selected)
  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        data-testid="chat-style"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={t('chat.style.title')}
        className={clsx(
          'inline-flex h-10 max-w-[11rem] items-center gap-1.5 rounded-full px-3 text-label transition-colors disabled:opacity-40',
          current ? 'bg-accent/15 text-ink-0 ring-1 ring-accent-line' : 'text-ink-3 hover:bg-white/[0.06] hover:text-ink-1',
        )}
      >
        {current ? (
          <span aria-hidden className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: current.colours.text || current.colours.a || '#888' }} />
        ) : (
          <Palette size={16} aria-hidden />
        )}
        <span className="truncate">{current ? current.name : t('chat.style.auto')}</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t('chat.style.title')}
          className="absolute bottom-12 left-0 z-30 w-[min(22rem,80vw)] overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-2xl"
        >
          <button
            type="button"
            role="option"
            aria-selected={!current}
            onClick={() => {
              select(null)
              setOpen(false)
            }}
            className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-white/[0.05]"
          >
            <Palette size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-label text-ink-0">{t('chat.style.auto')}</span>
              <span className="block text-caption text-ink-3">{t('chat.style.autoHint')}</span>
            </span>
            {!current && <Check size={16} className="mt-0.5 text-accent" aria-hidden />}
          </button>
          <div className="scroll-thin max-h-72 overflow-y-auto border-t border-line">
            {items.length === 0 && <p className="px-3.5 py-3 text-caption text-ink-3">{t('chat.style.empty')}</p>}
            {items.map((s) => (
              <div key={s.id} className="group flex items-start gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.05]">
                <button
                  type="button"
                  role="option"
                  aria-selected={s.id === selected}
                  onClick={() => {
                    select(s.id)
                    setOpen(false)
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                >
                  <span aria-hidden className="mt-1 flex shrink-0 gap-0.5">
                    {[s.colours.text, s.colours.a, s.colours.b].filter(Boolean).slice(0, 3).map((c, i) => (
                      <span key={i} className="h-3 w-3 rounded-full ring-1 ring-white/25" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label text-ink-0">{s.name}</span>
                    <span className="line-clamp-2 block text-caption text-ink-3">{s.description || s.summary}</span>
                  </span>
                  {s.id === selected && <Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />}
                </button>
                <button
                  type="button"
                  aria-label={t('chat.style.delete', { name: s.name })}
                  onClick={() => void remove(s.id)}
                  className="mt-0.5 shrink-0 rounded-md p-1 text-ink-4 opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          {onReference && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="video/*,.mp4,.mov,.mkv,.webm,.m4v"
                className="hidden"
                data-testid="chat-style-reference-input"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  if (picked.length > 0) {
                    onReference(picked)
                    setOpen(false)
                  }
                }}
              />
              <button
                type="button"
                data-testid="chat-style-new"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-start gap-2.5 border-t border-line px-3.5 py-2.5 text-left hover:bg-white/[0.05]"
              >
                <Plus size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-label text-ink-0">{t('chat.style.new')}</span>
                  <span className="block text-caption text-ink-3">{t('chat.style.howTo')}</span>
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
