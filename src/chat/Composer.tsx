'use client'

import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import clsx from 'clsx'
import { ArrowUp, Check, Paperclip, Square, X, AlertCircle } from 'lucide-react'
import { useT } from '@/i18n'
import { IconButton } from '@/components/ui'
import type { ChatAttachment } from './chatStore'

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
        cx="10" cy="10" r={r} fill="none" stroke="rgb(165 174 255)" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0.04, item.progress)))}
        className="transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  )
}

function AttachmentChip({ item, onRemove }: { item: ChatAttachment; onRemove: () => void }) {
  const { t } = useT()
  const pct = Math.round(item.progress * 100)
  const status =
    item.state === 'failed' ? t('chat.upload.failed') : item.state === 'ready' ? t('chat.upload.ready') : t('chat.upload.uploading', { pct })
  return (
    <li
      data-testid={`chat-attachment-${item.id}`}
      className={clsx(
        'flex max-w-full items-center gap-2 rounded-xl border bg-surface-2 py-1 pl-2.5 pr-1 text-label',
        item.state === 'failed' ? 'border-danger/40' : 'border-line',
      )}
    >
      <ProgressRing item={item} />
      <span className="min-w-0 truncate text-ink-1">{item.name}</span>
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
  attachments: ChatAttachment[]
  onRemoveAttachment: (id: string) => void
  onAttachClick: () => void
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
  const canSend = !p.sendDisabled && (p.text.trim().length > 0 || p.attachments.length > 0)
  return (
    <div className="rounded-3xl border border-line-strong bg-surface-1 shadow-composer transition-colors focus-within:border-accent-line">
      {p.attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-3 pt-3">
          {p.attachments.map((a) => (
            <AttachmentChip key={a.id} item={a} onRemove={() => p.onRemoveAttachment(a.id)} />
          ))}
        </ul>
      )}
      <textarea
        ref={setRef}
        data-testid="chat-input"
        aria-label={t('chat.composer.aria')}
        value={p.text}
        rows={1}
        onChange={(e) => p.onText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={p.placeholder}
        className="scroll-thin block max-h-44 min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-prose text-ink-0 placeholder:text-ink-4 focus:outline-none focus-visible:outline-none"
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <div className="flex min-w-0 items-center gap-1">
          <IconButton
            data-testid="chat-attach"
            icon={Paperclip}
            size="lg"
            aria-label={t('chat.attach')}
            disabled={p.attachDisabled}
            onClick={p.onAttachClick}
            className="rounded-full"
          />
          <span className="hidden truncate text-caption text-ink-4 sm:inline">{t('chat.composer.hint')}</span>
        </div>
        {p.running ? (
          <button
            type="button"
            data-testid="chat-stop"
            onClick={p.onStop}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface-3 pl-3.5 pr-4 text-body font-medium text-ink-0 transition-colors hover:bg-surface-4"
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
              'inline-flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-30',
              canSend ? 'bg-ink-0 text-surface-0 hover:bg-white' : 'bg-white/[0.08] text-ink-3',
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
