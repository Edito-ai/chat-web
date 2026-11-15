'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { formatElapsed, percent } from './activity'
import { isTerminal, knownStage } from './chatState'
import { buildTranscript } from './buildTranscript'
import { useActTitle } from './Transcript'
import { useNow } from './ActivityPanel'
import type { ChatAssistantMessage } from './chatTypes'

/**
 * The edit's thinking, as text in the chat (no card): each step as a quiet line with its time, and after it what that step
 * found or decided, written out by the backend. Open while the edit runs; afterwards one "Thought for 3m 40s" line that
 * opens the same trail again.
 */
export function ThinkingTrail({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const titleOf = useActTitle()
  const running = !isTerminal(msg.status)
  const now = useNow(running)
  const [open, setOpen] = useState(false)
  const tr = buildTranscript(msg, running ? now : 0)
  const pct = running ? percent(msg) : null
  const shown = running || open

  const header = running
    ? `${t('chat.think.live')}${tr.totalMs !== null ? ` · ${formatElapsed(tr.totalMs)}` : ''}${pct !== null ? ` · ${pct}%` : ''}`
    : tr.totalMs !== null
      ? t('chat.think.done', { time: formatElapsed(tr.totalMs) })
      : t('chat.think.doneNoTime')

  // Older backends send no activity: their four coarse steps, as the same plain lines.
  const lines =
    tr.source === 'activity'
      ? tr.blocks
      : tr.steps
          .filter((s) => s.status !== 'pending')
          .map((s) => ({
            type: 'tools' as const,
            id: s.id,
            tools: [{ id: s.id, title: t(`chat.step.${s.id}` as MessageKey), detail: null, status: s.status === 'active' ? ('running' as const) : ('done' as const), elapsedMs: s.elapsedMs }],
          }))
  if (lines.length === 0 && !running) return null

  return (
    <div data-testid="chat-thinking" className="w-full max-w-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={running}
        aria-expanded={shown}
        className="-ml-1 inline-flex min-h-[28px] items-center gap-1.5 rounded-md px-1 text-label text-ink-3 transition-colors enabled:hover:text-ink-1 disabled:cursor-default"
      >
        {!running && <ChevronRight size={13} aria-hidden className={clsx('transition-transform duration-200', open && 'rotate-90')} />}
        <span className={clsx(running && 'shimmer-text font-medium')}>{header}</span>
      </button>

      {shown && (
        <ol className="mt-1.5 space-y-2 border-l border-white/10 pl-3.5" aria-live={running ? 'polite' : undefined}>
          {lines.map((b) =>
            b.type === 'thought' ? (
              <li key={b.id} className="animate-rise text-body leading-relaxed text-ink-1">
                {b.title}
              </li>
            ) : b.type === 'say' ? (
              <li key={b.id} className="text-body text-ink-1">
                {b.text}
              </li>
            ) : (
              b.tools.map((tool) => (
                <li key={tool.id} className="flex items-baseline gap-2 text-label text-ink-3">
                  <span
                    aria-hidden
                    className={clsx(
                      'h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full',
                      tool.status === 'running' ? 'animate-pulse bg-accent' : tool.status === 'failed' ? 'bg-danger' : 'bg-ink-4',
                    )}
                  />
                  <span className={clsx('min-w-0', tool.status === 'running' && 'shimmer-text text-ink-1')}>
                    {titleOf(tool)}
                    {tool.status === 'running' && tool.detail && !tool.detail.startsWith('took') ? ` — ${tool.detail}` : ''}
                  </span>
                  {tool.elapsedMs !== null && (
                    <span className="shrink-0 font-mono text-caption tabular-nums text-ink-4">{formatElapsed(tool.elapsedMs)}</span>
                  )}
                </li>
              ))
            ),
          )}
          {running && lines.length === 0 && (
            <li className="text-label text-ink-3">{msg.message ?? t(`chat.stage.${knownStage(msg.stage) ?? 'working'}` as MessageKey)}</li>
          )}
        </ol>
      )}
    </div>
  )
}
