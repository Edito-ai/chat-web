'use client'

import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import clsx from 'clsx'
import { ArrowUp, Check, FolderOpen, Link2, Paperclip, Square, X, AlertCircle, Wand2 } from 'lucide-react'
import { useT } from '@/i18n'
import { useTypewriter } from './useTypewriter'
import { IconButton } from '@/components/ui'
import type { ChatAttachment } from './chatStore'
import { StylePicker } from './StylePicker'
import { useStyles } from './styles'

/** A small ring that fills with upload progress; a check when ready, an alert when failed. */
function ProgressRing({ item }: { item: ChatAttachment }) {
  const r = 8
  const c = 2 * Math.PI * r
  if (item.state === 'ready') return <Check size={14} strokeWidth={2.5} className="text-success" aria-hidden />
  if (item.state === 'failed') return <AlertCircle size={14} className="text-danger" aria-hidden />
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden className="-rotate-90">
      <circle cx="10" cy="10" r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
      <circle
        cx="10" cy="10" r={r} fill="none" stroke="rgb(255 158 140)" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0.04, item.progress)))}
        className="transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  )
}

function AttachmentChip({ item, onRemove, onReference }: { item: ChatAttachment; onRemove: () => void; onReference?: () => void }) {
  const { t } = useT()
  const pct = Math.round(item.progress * 100)
  const status =
    item.state === 'failed' ? t('chat.upload.failed') : item.state === 'ready' ? t('chat.upload.ready') : t('chat.upload.uploading', { pct })
  return (
    <li
      data-testid={`chat-attachment-${item.id}`}
      className={clsx(
        'flex max-w-full items-center gap-2 rounded-xl border bg-surface-2 py-1 pl-2.5 pr-1 text-label',
        item.state === 'failed' ? 'border-danger/40' : item.reference ? 'border-accent-line' : 'border-line',
      )}
    >
      <ProgressRing item={item} />
      <span className="min-w-0 truncate text-ink-1">{item.name}</span>
      {onReference && (
        <button
          type="button"
          data-testid={`chat-reference-${item.id}`}
          aria-pressed={!!item.reference}
          onClick={onReference}
          title={t('chat.reference.hint')}
          className={clsx(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption transition-colors',
            item.reference ? 'bg-accent/20 text-ink-0' : 'text-ink-3 hover:bg-white/[0.06] hover:text-ink-1',
          )}
        >
          <Wand2 size={12} aria-hidden /> {item.reference ? t('chat.reference.on') : t('chat.reference.off')}
        </button>
      )}
      <span className={clsx('shrink-0 font-mono text-caption tabular-nums', item.state === 'failed' ? 'text-danger' : 'text-ink-3')}>
        {status}
      </span>
      <IconButton icon={X} size="sm" aria-label={t('chat.remove', { name: item.name })} onClick={onRemove} className="h-6 w-6" />
    </li>
  )
}

export interface ComposerProps {
  text: string
  onText: (v: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  placeholder: string
  /** Example prompts typed out in the empty box while nothing is happening, to invite the person to write one. */
  hints?: string[]
  attachments: ChatAttachment[]
  onRemoveAttachment: (id: string) => void
  onToggleReference?: (id: string) => void
  onAttachReference?: (files: File[]) => void
  /** A link whose look the next message copies (shown as a chip); null = none. */
  referenceLink?: string | null
  onReferenceLink?: (url: string | null) => void
  onAttachClick: () => void
  onLibraryClick: () => void
  attachDisabled: boolean
  running: boolean
  sendDisabled: boolean
  onSend: () => void
  onStop: () => void
}

/** Pill-shaped composer: attach chips on top, auto-growing textarea, attach on the left, send/stop on the right. */
export function Composer(p: ComposerProps) {
  const { t } = useT()
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const setRef = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el
    p.textareaRef.current = el
  }
  // Auto-grow up to ~8 lines.
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`
  }, [p.text])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      p.onSend()
    }
  }
  const typed = useTypewriter(p.hints ?? [], p.text === '' && !p.running)
  const canSend = !p.sendDisabled && (p.text.trim().length > 0 || p.attachments.length > 0 || !!p.referenceLink)
  const stylesOn = useStyles((s) => s.items) !== null
  return (
    <div className="rounded-[1.75rem] border border-white/15 bg-surface-1/75 backdrop-blur-xl shadow-composer transition-[border-color,box-shadow] duration-200 focus-within:border-accent-line focus-within:shadow-[0_0_0_4px_rgb(255_158_140/0.10),0_20px_50px_-20px_rgb(0_0_0/0.9)]">
      {(p.attachments.length > 0 || p.referenceLink) && (
        <ul className="flex flex-wrap gap-2 px-3 pt-3">
          {p.referenceLink && (
            <li data-testid="chat-reference-link" className="flex max-w-full items-center gap-2 rounded-xl border border-accent-line bg-surface-2 py-1 pl-2.5 pr-1 text-label">
              <Link2 size={14} className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 max-w-[16rem] truncate text-ink-1">{p.referenceLink.replace(/^https?:\/\/(www\.)?/, '')}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-caption text-ink-0">
                <Wand2 size={12} aria-hidden /> {t('chat.reference.on')}
              </span>
              <IconButton icon={X} size="sm" aria-label={t('chat.remove', { name: p.referenceLink })} onClick={() => p.onReferenceLink?.(null)} className="h-6 w-6" />
            </li>
          )}
          {p.attachments.map((a) => (
            <AttachmentChip
              key={a.id}
              item={a}
              onRemove={() => p.onRemoveAttachment(a.id)}
              onReference={stylesOn && p.onToggleReference ? () => p.onToggleReference!(a.id) : undefined}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-1.5 p-2 sm:flex-nowrap">
        <IconButton
          data-testid="chat-attach"
          icon={Paperclip}
          size="lg"
          aria-label={t('chat.attach')}
          disabled={p.attachDisabled}
          onClick={p.onAttachClick}
          className="shrink-0 rounded-full"
        />
        <IconButton
          data-testid="chat-library"
          icon={FolderOpen}
          size="lg"
          aria-label={t('chat.library.open')}
          disabled={p.attachDisabled}
          onClick={p.onLibraryClick}
          className="shrink-0 rounded-full"
        />
        <StylePicker disabled={p.attachDisabled} onReference={p.onAttachReference} onReferenceLink={p.onReferenceLink ?? undefined} />
        <textarea
          ref={setRef}
          data-testid="chat-input"
          aria-label={t('chat.composer.aria')}
          value={p.text}
          rows={1}
          onChange={(e) => p.onText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={typed || p.placeholder}
          className="scroll-thin order-first block max-h-44 min-h-[44px] w-full min-w-0 basis-full resize-none self-center bg-transparent px-2.5 py-2.5 text-[16px] leading-[1.5] text-ink-0 placeholder:text-ink-4 focus:!outline-none focus-visible:!outline-none sm:order-none sm:min-h-[40px] sm:w-auto sm:basis-0 sm:flex-1 sm:px-1 sm:text-prose"
        />
        {p.running ? (
          <button
            type="button"
            data-testid="chat-stop"
            onClick={p.onStop}
            className="ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line-strong bg-surface-3 pl-3.5 pr-4 text-body font-medium text-ink-0 transition-colors hover:bg-surface-4 sm:ml-0"
          >
            <Square size={12} fill="currentColor" aria-hidden /> {t('chat.stop')}
          </button>
        ) : (
          <button
            type="button"
            data-testid="chat-send"
            disabled={p.sendDisabled}
            aria-disabled={!canSend}
            onClick={p.onSend}
            className={clsx(
              'ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-30 sm:ml-0',
              canSend ? 'bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] text-white shadow-[0_8px_22px_-8px_rgb(255_90_80/0.8)] hover:-translate-y-px hover:brightness-110' : 'bg-white/[0.08] text-ink-3',
            )}
          >
            <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
            <span className="sr-only">{t('chat.send')}</span>
          </button>
        )}
      </div>
    </div>
  )
}
