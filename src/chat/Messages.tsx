'use client'

import { useT } from '@/i18n'
import { InlineError } from '@/components/ui'
import { useChat } from './chatStore'
import { ActivitySummary, LiveActivity } from './ActivityPanel'
import { ResultCard } from './ResultCard'
import type { ChatAssistantMessage, ChatMessage } from './chatTypes'
import { Avatar } from './Avatar'
import { isTerminal } from './chatState'

function ErrorCard({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const detail = msg.error && msg.error !== 'failed' && msg.error !== 'missing_result' ? msg.error : undefined
  return (
    <div role="alert" className="w-full max-w-lg rounded-2xl border border-danger/25 bg-danger-soft p-4">
      <p className="font-serif text-title text-ink-0">{t('chat.error.title')}</p>
      {detail && <p className="mt-2 break-words rounded-lg bg-black/25 px-3 py-2 font-mono text-label text-danger">{detail}</p>}
      <p className="mt-2 text-label text-ink-3">{t('chat.error.next')}</p>
    </div>
  )
}

function AssistantBody({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const lostJobId = useChat((s) => s.pollLostJobId)
  const retryPolling = useChat((s) => s.retryPolling)
  const actionError = useChat((s) => s.actionError)

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

export function Bubble({ msg }: { msg: ChatMessage }) {
  const { t } = useT()
  if (msg.role === 'user') {
    return (
      <li data-testid={`chat-message-${msg.id}`} className="flex animate-rise justify-end">
        <div className="max-w-[min(88%,34rem)] space-y-1.5 rounded-2xl rounded-br-md border border-line bg-surface-3 px-4 py-2.5 shadow-sm">
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
    <li data-testid={`chat-message-${msg.id}`} className="flex animate-rise justify-start gap-3">
      <Avatar working={!isTerminal(msg.status)} />
      <div className="min-w-0 max-w-full flex-1">
        <span className="sr-only">{t('chat.assistant')}: </span>
        <AssistantBody msg={msg} />
      </div>
    </li>
  )
}
