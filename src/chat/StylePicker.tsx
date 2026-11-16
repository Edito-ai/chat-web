'use client'

import { useRef, useState } from 'react'
import { Check, Link2, Palette, Plus, X } from 'lucide-react'
import { useT } from '@/i18n'
import { IconButton } from '@/components/ui'
import { looksLikeLink } from './chatStore'
import { useStyles } from './styles'

/**
 * The template the next edit follows: "Auto" (designed from the video) or one from the stock every user shares. New
 * templates come from references: a link (Instagram, YouTube ...) or an uploaded video, read into a template for everyone.
 * This is the body of the "Template" page of the attach menu (`AttachMenu`); `onDone` closes the menu after a choice.
 */
export function StylePanel({ onDone, onReference, onReferenceLink }: {
  onDone: () => void
  onReference?: (files: File[]) => void
  onReferenceLink?: (url: string) => void
}) {
  const { t } = useT()
  const items = useStyles((s) => s.items)
  const selected = useStyles((s) => s.selected)
  const { select } = useStyles.getState()
  const [link, setLink] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  if (items === null) return null
  const current = items.find((s) => s.id === selected)
  return (
    <div role="listbox" aria-label={t('chat.style.title')} data-testid="chat-style-panel">
      <button
        type="button"
        role="option"
        aria-selected={!current}
        onClick={() => {
          select(null)
          onDone()
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
      <div className="scroll-thin max-h-60 overflow-y-auto border-t border-line">
        {items.length === 0 && <p className="px-3.5 py-3 text-caption text-ink-3">{t('chat.style.empty')}</p>}
        {items.map((s) => (
          <div key={s.id} className="group flex items-start gap-2.5 px-3.5 py-2.5 hover:bg-white/[0.05]">
            <button
              type="button"
              role="option"
              aria-selected={s.id === selected}
              onClick={() => {
                select(s.id)
                onDone()
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
          </div>
        ))}
      </div>
      {onReferenceLink && (
        <form
          className="flex items-center gap-2 border-t border-line px-3.5 py-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!looksLikeLink(link)) return
            onReferenceLink(link.trim())
            setLink('')
            onDone()
          }}
        >
          <Link2 size={16} className="shrink-0 text-accent" aria-hidden />
          <input
            data-testid="chat-style-link"
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={t('chat.look.linkPlaceholder')}
            aria-label={t('chat.look.linkPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-label text-ink-0 placeholder:text-ink-4 focus:!outline-none"
          />
          <button
            type="submit"
            data-testid="chat-style-link-use"
            disabled={!looksLikeLink(link)}
            className="shrink-0 rounded-full bg-accent px-3 py-1 text-caption font-medium text-white disabled:opacity-40"
          >
            {t('chat.look.linkUse')}
          </button>
        </form>
      )}
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
                onDone()
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
  )
}

/** The chosen template, shown with the other chips above the text box (nothing for "Auto"), with a way to drop it. */
export function StyleChip() {
  const { t } = useT()
  const items = useStyles((s) => s.items)
  const selected = useStyles((s) => s.selected)
  const current = items?.find((s) => s.id === selected)
  if (!current) return null
  return (
    <li data-testid="chat-style-chip" className="flex max-w-full items-center gap-2 rounded-xl border border-accent-line bg-surface-2 py-1 pl-2.5 pr-1 text-label">
      <span aria-hidden className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: current.colours.text || current.colours.a || '#888' }} />
      <span className="min-w-0 max-w-[14rem] truncate text-ink-1">{current.name}</span>
      <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-caption text-ink-0">{t('chat.style.title')}</span>
      <IconButton icon={X} size="sm" aria-label={t('chat.remove', { name: current.name })} onClick={() => useStyles.getState().select(null)} className="h-6 w-6" />
    </li>
  )
}

/** The id of the chosen template (null = Auto). */
export function useChosenStyle(): boolean {
  return useStyles((s) => s.items?.some((x) => x.id === s.selected) ?? false)
}
