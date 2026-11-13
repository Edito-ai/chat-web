'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { Check, Sparkles } from 'lucide-react'
import { useT } from '@/i18n'
import { useNow } from './ActivityPanel'
import { useChat } from './chatStore'
import type { ChatAssistantMessage } from './chatTypes'

/**
 * The top caption styles for this video, each a still of the user's own footage, the recommended one tagged "Best".
 * The server waits `seconds` for a pick and then takes the best one, so the countdown here is the real deadline.
 */
export function LookChoice({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const choose = useChat((s) => s.chooseLook)
  const [picked, setPicked] = useState<string | null>(null)
  const lc = msg.lookChoice
  const now = useNow(!!lc, 500)
  if (!lc || !lc.open) return null
  const left = Math.max(0, Math.ceil(lc.secondsLeft - (now - lc.receivedAt) / 1000))
  const pick = (id: string) => {
    if (picked) return
    setPicked(id)
    void choose(msg.jobId, id)
  }
  return (
    <div data-testid="chat-look-choice" role="group" aria-label={t('chat.look.title')} className="mt-4 border-t border-white/10 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body font-semibold text-ink-0">{t('chat.look.title')}</p>
        <p data-testid="chat-look-timer" aria-live="off" className="font-mono text-caption tabular-nums text-ink-3">
          {picked ? t('chat.look.picked') : t('chat.look.auto', { n: left })}
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2.5">
        {lc.options.map((o) => {
          const on = picked === o.id
          return (
            <li key={o.id} className="min-w-0">
              <button
                type="button"
                data-testid={`chat-look-${o.id}`}
                disabled={picked !== null}
                onClick={() => pick(o.id)}
                aria-pressed={on}
                className={clsx(
                  'group relative block w-full overflow-hidden rounded-xl border bg-surface-1 text-left transition-all',
                  on ? 'border-accent ring-2 ring-accent' : 'border-white/15 hover:-translate-y-px hover:border-accent-line',
                  picked && !on && 'opacity-50',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.imageUrl} alt={`${o.label}: ${o.desc}`} className="aspect-[9/16] w-full object-cover" loading="eager" />
                {o.best && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-caption font-semibold text-white shadow">
                    <Sparkles size={10} aria-hidden />
                    {t('chat.look.best')}
                  </span>
                )}
                {on && (
                  <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
                    <Check size={12} aria-hidden />
                  </span>
                )}
                <span className="block px-2 py-1.5">
                  <span className="block truncate text-label font-medium text-ink-0">{o.label}</span>
                  <span className="mt-0.5 line-clamp-2 block text-caption leading-snug text-ink-3">{o.desc}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
