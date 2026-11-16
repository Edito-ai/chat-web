'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useT } from '@/i18n'
import { useNow } from './ActivityPanel'
import { useChat } from './chatStore'
import type { ChatAssistantMessage } from './chatTypes'

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/**
 * The final frames, before the full-size render (backend2 `b2/stages/approval.py`): one frame per scene drawn from the
 * plan. "Looks good" renders the video; a message typed in the composer is the change (the edit is re-planned and the
 * frames come back). The server renders by itself when the time runs out, so the countdown is real.
 */
export function FramesReview({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const [sent, setSent] = useState(false)
  const fr = msg.framesReview
  const now = useNow(!!fr, 1000)
  if (!fr || !fr.open) return null
  const left = Math.max(0, fr.secondsLeft - (now - fr.receivedAt) / 1000)
  const approve = () => {
    if (sent) return
    setSent(true)
    void useChat.getState().approveFrames(msg.jobId)
  }
  return (
    <div data-testid="chat-frames-review" role="group" aria-label={t('chat.frames.title')} className="mt-4 border-t border-white/10 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body font-semibold text-ink-0">{fr.round > 1 ? t('chat.frames.titleAgain') : t('chat.frames.title')}</p>
        <p data-testid="chat-frames-timer" aria-live="off" className="font-mono text-caption tabular-nums text-ink-3">
          {t('chat.frames.auto', { n: Math.max(1, Math.ceil(left / 60)) })}
        </p>
      </div>
      <p className="mt-1.5 text-label leading-relaxed text-ink-2">{t('chat.frames.hint')}</p>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fr.frames.map((f) => (
          <li key={f.n} className="min-w-0">
            <a
              href={f.imageUrl}
              target="_blank"
              rel="noreferrer"
              data-testid={`chat-frame-${f.n}`}
              className="group relative block overflow-hidden rounded-lg border border-white/15 bg-surface-1 transition-colors hover:border-accent-line"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.imageUrl} alt={t('chat.frames.frame', { n: f.n })} className="w-full object-cover" loading="eager" />
              <span className="absolute left-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-caption font-semibold text-white">
                {f.n}
              </span>
              <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-caption tabular-nums text-white/90">
                {clock(f.t)}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-testid="chat-frames-render"
        onClick={approve}
        disabled={sent}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-label font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {sent ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />}
        {sent ? t('chat.frames.rendering') : t('chat.frames.render')}
      </button>
    </div>
  )
}
