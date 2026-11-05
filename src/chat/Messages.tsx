'use client'

import { AlertTriangle } from 'lucide-react'
import { useT } from '@/i18n'
import { FolderOpen, Sparkles, Upload } from 'lucide-react'
import { InlineError, LogoMark } from '@/components/ui'
import { ORB_ENABLED } from '@/lib/features'
import { Presence } from './Presence'
import { boldRuns, replyBlocks } from './replyText'
import { useChat } from './chatStore'
import { ActivitySummary, LiveActivity } from './ActivityPanel'
import { ResultCard } from './ResultCard'
import type { ChatAssistantMessage, ChatMessage, ChatSuggestion } from './chatTypes'

function ErrorCard({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const detail = msg.error && msg.error !== 'failed' && msg.error !== 'missing_result' ? msg.error : undefined
  return (
    <div role="alert" className="w-full max-w-lg rounded-2xl border border-danger/25 bg-danger-soft p-4">
      <p className="flex items-center gap-2 font-display text-body font-semibold text-ink-0"><AlertTriangle size={16} className="shrink-0 text-danger" aria-hidden />{t('chat.error.title')}</p>
      {detail && <p className="mt-2 break-words rounded-lg bg-black/25 px-3 py-2 font-mono text-label text-danger">{detail}</p>}
      <p className="mt-2 text-label text-ink-3">{t('chat.error.next')}</p>
    </div>
  )
}

/** Three soft dots while the assistant writes a plain reply (no progress card: nothing is being rendered). */
function Typing() {
  const { t } = useT()
  return (
    <div data-testid="chat-typing" role="status" className="flex h-8 items-center gap-1.5 px-1">
      <span className="sr-only">{t('chat.typing')}</span>
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-3" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </div>
  )
}

/** One line of reply text, with **bold** runs. Only text is ever rendered: no markup from a reply is interpreted. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {boldRuns(text).map((r, i) => (r.bold ? <strong key={i} className="font-semibold">{r.text}</strong> : <span key={i}>{r.text}</span>))}
    </>
  )
}

const CHIP_ICON = { upload: Upload, library: FolderOpen, send: Sparkles } as const

/** A plain reply: the words, then quick replies (only on the newest message, and only while nothing is running). */
function ChatReply({ msg, chips, onSuggest }: { msg: ChatAssistantMessage; chips: boolean; onSuggest?: (s: ChatSuggestion) => void }) {
  const blocks = replyBlocks(msg.reply)
  return (
    <div data-testid="chat-reply" className="max-w-lg space-y-3">
      <div className="space-y-2.5">
        {blocks.map((b, i) =>
          b.type === 'ul' ? (
            <ul key={i} className="list-disc space-y-1 pl-5 text-prose text-ink-0 marker:text-ink-4">
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          ) : (
            <p key={i} className="whitespace-pre-wrap break-words text-prose text-ink-0">
              <Inline text={b.text} />
            </p>
          ),
        )}
      </div>
      {chips && onSuggest && (msg.suggestions?.length ?? 0) > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Quick replies">
          {msg.suggestions!.map((s) => {
            const Icon = CHIP_ICON[s.action]
            return (
              <li key={s.id}>
                <button
                  type="button"
                  data-testid={`chat-chip-${s.id}`}
                  onClick={() => onSuggest(s)}
                  className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-3.5 text-label font-medium text-ink-0 transition-all hover:-translate-y-px hover:border-accent-line hover:bg-white/[0.09]"
                >
                  <Icon size={14} strokeWidth={1.75} aria-hidden className="text-accent" />
                  {s.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function AssistantBody({ msg, chips, onSuggest }: { msg: ChatAssistantMessage; chips: boolean; onSuggest?: (s: ChatSuggestion) => void }) {
  const { t } = useT()
  const lostJobId = useChat((s) => s.pollLostJobId)
  const retryPolling = useChat((s) => s.retryPolling)
  const actionError = useChat((s) => s.actionError)

  // A plain reply has no steps and no video: typing while it is written, the words when it is done.
  if (msg.kind === 'chat') {
    if (msg.status === 'complete') return <ChatReply msg={msg} chips={chips} onSuggest={onSuggest} />
    if (msg.status === 'queued' || msg.status === 'running') return lostJobId === msg.jobId ? <ErrorCard msg={{ ...msg, error: null }} /> : <Typing />
  }
  if (msg.status === 'complete') {
    return (
      <div className="space-y-2">
        <ActivitySummary msg={msg} />
        {msg.result ? (
          <ResultCard msg={{ ...msg, result: msg.result }} />
        ) : (
          <div className="max-w-lg space-y-1">
            <p className="text-prose text-ink-0">{msg.reply ?? t('chat.result.ready')}</p>
            <p className="text-label text-ink-3">{t('chat.result.earlier')}</p>
          </div>
        )}
      </div>
    )
  }
  if (msg.status === 'cancelled') {
    return (
      <div className="space-y-2">
        <ActivitySummary msg={msg} />
        <p className="text-prose text-ink-3">{t('chat.stopped')}</p>
      </div>
    )
  }
  if (msg.status === 'failed') {
    return (
      <div className="space-y-2">
        <ActivitySummary msg={msg} />
        <ErrorCard msg={msg} />
      </div>
    )
  }
  if (lostJobId === msg.jobId) {
    return (
      <div className="w-full max-w-lg space-y-1 rounded-2xl border border-warning/25 bg-warning-soft p-4">
        <p className="text-body text-ink-0">{t('chat.lost')}</p>
        <InlineError error={actionError} onRetry={retryPolling} />
      </div>
    )
  }
  return <LiveActivity msg={msg} />
}

export function Bubble({ msg, chips = false, onSuggest }: { msg: ChatMessage; chips?: boolean; onSuggest?: (s: ChatSuggestion) => void }) {
  const { t } = useT()
  if (msg.role === 'user') {
    return (
      <li data-testid={`chat-message-${msg.id}`} className="flex animate-rise justify-end">
        <div className="max-w-[min(88%,34rem)] space-y-1.5 rounded-2xl rounded-br-md bg-white/[0.07] px-4 py-2.5 ring-1 ring-white/10">
          <span className="sr-only">{t('chat.you')}: </span>
          {msg.attachments.length > 0 && (
            <p className="break-words font-mono text-caption text-ink-3">{msg.attachments.join(', ')}</p>
          )}
          <p className="whitespace-pre-wrap break-words text-prose text-ink-0">{msg.text}</p>
        </div>
      </li>
    )
  }
  return (
    <li data-testid={`chat-message-${msg.id}`} className="flex animate-rise justify-start gap-2.5 sm:gap-3">
      <div className="shrink-0">
        {ORB_ENABLED ? (
          <Presence active={msg.status === 'queued' || msg.status === 'running'} idle={chips} />
        ) : (
          <span aria-hidden className="grid h-[52px] w-[52px] place-items-center rounded-xl border border-white/[0.12] bg-gradient-to-br from-[#D8264A]/30 to-[#FF7A5C]/10">
            <LogoMark size={16} />
          </span>
        )}
      </div>
      <div className="min-w-0 max-w-full flex-1">
        <span className="sr-only">{t('chat.assistant')}: </span>
        <AssistantBody msg={msg} chips={chips} onSuggest={onSuggest} />
      </div>
    </li>
  )
}
