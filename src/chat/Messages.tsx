'use client'

import { useState } from 'react'
import { AlertTriangle, Pencil, RotateCcw } from 'lucide-react'
import { useT } from '@/i18n'
import { FolderOpen, Sparkles, Upload } from 'lucide-react'
import { InlineError, LogoMark } from '@/components/ui'
import { ORB_ENABLED } from '@/lib/features'
import { isDevMode, isHumanText } from '@/lib/friendlyError'
import { Presence } from './Presence'
import { boldRuns, replyBlocks } from './replyText'
import { useChat } from './chatStore'
import { ReplyText } from './ResultCard'
import { splitReply } from './activity'
import { ArtifactChip } from './ArtifactChip'
import { kindOf, type Artifact } from './artifacts'
import { ThinkingTrail } from './Thinking'
import { QuestionCard } from './QuestionCard'
import type { ChatAssistantMessage, ChatMessage, ChatSuggestion } from './chatTypes'

function ErrorCard({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const raw = msg.error && msg.error !== 'failed' && msg.error !== 'missing_result' ? msg.error : undefined
  // The server already turns a failure into a plain sentence in production. A text that still reads like developer output (an old
  // job, another backend) is not shown to a person; in development the real text stays, in monospace.
  const dev = isDevMode()
  const detail = raw && (dev || isHumanText(raw)) ? raw : undefined
  return (
    <div role="alert" className="w-full max-w-3xl">
      <p className="flex items-center gap-2 text-prose font-medium text-ink-0"><AlertTriangle size={15} className="shrink-0 text-danger" aria-hidden />{t('chat.error.title')}</p>
      {detail && <p className={dev && !isHumanText(detail) ? 'mt-1.5 break-words font-mono text-label text-danger' : 'mt-1.5 break-words text-label text-ink-2'}>{detail}</p>}
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
    <div data-testid="chat-reply" className="max-w-3xl space-y-3">
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

/** Under a failed or stopped answer: run the same message again. */
function RetryButton({ onRetry }: { onRetry?: () => void }) {
  const { t } = useT()
  if (!onRetry) return null
  return (
    <button
      type="button"
      data-testid="chat-retry"
      onClick={onRetry}
      className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 text-label font-medium text-ink-0 transition-colors hover:border-accent-line hover:bg-white/[0.09]"
    >
      <RotateCcw size={13} aria-hidden /> {t('chat.retry')}
    </button>
  )
}

function AssistantBody({ msg, artifact, chips, onSuggest, onRetry }: {
  msg: ChatAssistantMessage; artifact: Artifact | null; chips: boolean; onSuggest?: (s: ChatSuggestion) => void; onRetry?: () => void
}) {
  const { t } = useT()
  const lostJobId = useChat((s) => s.pollLostJobId)
  const retryPolling = useChat((s) => s.retryPolling)
  const actionError = useChat((s) => s.actionError)

  // A plain reply has no steps and no video: typing while it is written, the words when it is done.
  if (msg.kind === 'chat') {
    if (msg.status === 'complete') return <ChatReply msg={msg} chips={chips} onSuggest={onSuggest} />
    if (msg.status === 'queued' || msg.status === 'running') return lostJobId === msg.jobId ? <ErrorCard msg={{ ...msg, error: null }} /> : <Typing />
  }
  if (msg.status === 'complete' && msg.kind === 'clips') {
    return (
      <div className="space-y-3">
        <ThinkingTrail msg={msg} />
        {msg.reply && <ReplyText text={msg.reply} />}
        {artifact && <ArtifactChip artifact={artifact} />}
      </div>
    )
  }
  if (msg.status === 'complete') {
    return (
      <div className="space-y-3">
        <ThinkingTrail msg={msg} />
        {msg.result ? (
          <div className="w-full max-w-3xl animate-rise space-y-3">
            <ReplyText text={splitReply(msg.reply).text || t('chat.result.ready')} />
            {artifact && <ArtifactChip artifact={artifact} />}
          </div>
        ) : msg.reply && msg.reply.trim() ? (
          // The edit answered with words, not a video (e.g. it asks what the video should be about): a reply to answer.
          <ChatReply msg={msg} chips={chips} onSuggest={onSuggest} />
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
      <div className="space-y-3">
        <ThinkingTrail msg={msg} />
        <p className="text-prose text-ink-3">{t('chat.stopped')}</p>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }
  if (msg.status === 'failed') {
    return (
      <div className="space-y-3">
        <ThinkingTrail msg={msg} />
        <ErrorCard msg={msg} />
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }
  if (lostJobId === msg.jobId) {
    return (
      <div className="w-full max-w-3xl space-y-1 rounded-2xl border border-warning/25 bg-warning-soft p-4">
        <p className="text-body text-ink-0">{t('chat.lost')}</p>
        <InlineError error={actionError} onRetry={retryPolling} />
      </div>
    )
  }
  // Still running: the thinking (the AI's thoughts and the tools it runs, live), then the look choice when it asks for one.
  return (
    <div className="space-y-3">
      <ThinkingTrail msg={msg} />
      {artifact && <ArtifactChip artifact={artifact} />}
    </div>
  )
}

/** The person's message; the last one can be changed in place (Save sends it again, the edit starts over from it). */
function UserBubble({ msg, onEdit }: { msg: ChatMessage & { role: 'user' }; onEdit?: (text: string) => Promise<string | null> }) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(msg.text)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const open = () => {
    setDraft(msg.text)
    setProblem(null)
    setEditing(true)
  }
  const save = async () => {
    if (!onEdit || saving) return
    setSaving(true)
    const why = await onEdit(draft)
    setSaving(false)
    if (why) setProblem(why)
    else setEditing(false)
  }
  if (editing && onEdit) {
    return (
      <li data-testid={`chat-message-${msg.id}`} className="flex animate-rise justify-end">
        <form
          className="w-full max-w-[min(100%,34rem)] space-y-2 rounded-2xl bg-white/[0.07] p-3 ring-1 ring-accent-line"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <textarea
            data-testid="chat-edit-input"
            aria-label={t('chat.edit.aria')}
            value={draft}
            autoFocus
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false)
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void save()
              }
            }}
            className="block w-full resize-none bg-transparent text-[16px] leading-[1.5] text-ink-0 focus:!outline-none sm:text-prose"
          />
          {problem && <p role="alert" className="text-label text-danger">{problem}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              data-testid="chat-edit-cancel"
              onClick={() => setEditing(false)}
              className="min-h-[34px] rounded-full px-3.5 text-label font-medium text-ink-2 hover:bg-white/[0.06] hover:text-ink-0"
            >
              {t('chat.edit.cancel')}
            </button>
            <button
              type="submit"
              data-testid="chat-edit-save"
              disabled={saving || !draft.trim()}
              className="min-h-[34px] rounded-full bg-white px-3.5 text-label font-semibold text-black disabled:opacity-40"
            >
              {t('chat.edit.save')}
            </button>
          </div>
        </form>
      </li>
    )
  }
  return (
    <li data-testid={`chat-message-${msg.id}`} className="group flex animate-rise items-start justify-end gap-1.5">
      {onEdit && (
        <button
          type="button"
          data-testid="chat-edit"
          aria-label={t('chat.edit')}
          title={t('chat.edit')}
          onClick={open}
          className="mt-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-3 transition-opacity hover:bg-white/[0.06] hover:text-ink-0 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Pencil size={14} aria-hidden />
        </button>
      )}
      <div className="max-w-[min(88%,48rem)] space-y-1.5 rounded-2xl rounded-br-md bg-white/[0.07] px-4 py-2.5 ring-1 ring-white/10">
        <span className="sr-only">{t('chat.you')}: </span>
        {msg.attachments.length > 0 && (
          <p className="break-words font-mono text-caption text-ink-3">{msg.attachments.join(', ')}</p>
        )}
        <p className="whitespace-pre-wrap break-words text-prose text-ink-0">{msg.text}</p>
        {msg.edited && <p data-testid="chat-edited" className="text-right text-caption text-ink-4">{t('chat.edited')}</p>}
      </div>
    </li>
  )
}

export function Bubble({ msg, artifact, chips = false, onSuggest, onEdit, onRetry }: {
  msg: ChatMessage; artifact?: Artifact | null; chips?: boolean; onSuggest?: (s: ChatSuggestion) => void
  /** Only on the person's last message. */
  onEdit?: (text: string) => Promise<string | null>
  /** Only on the last answer, when it failed or was stopped. */
  onRetry?: () => void
}) {
  const { t } = useT()
  if (msg.role === 'user') return <UserBubble msg={msg} onEdit={onEdit} />
  return (
    <li data-testid={`chat-message-${msg.id}`} className="flex animate-rise justify-start gap-2.5 sm:gap-3">
      <div className="shrink-0">
        {ORB_ENABLED ? (
          <Presence active={msg.status === 'queued' || msg.status === 'running'} idle={chips} />
        ) : (
          <span aria-hidden className="grid h-[52px] w-[52px] place-items-center rounded-xl border border-white/[0.12] bg-white/[0.06]">
            <LogoMark size={16} />
          </span>
        )}
      </div>
      <div className="min-w-0 max-w-full flex-1">
        <span className="sr-only">{t('chat.assistant')}: </span>
        {msg.placementQuestion && (
          <p data-testid="chat-placement-question" className="mb-2 whitespace-pre-wrap break-words text-prose text-ink-0">
            {msg.placementQuestion}
          </p>
        )}
        <AssistantBody msg={msg} artifact={artifact !== undefined ? artifact : (kindOf(msg) ? { id: msg.id, kind: kindOf(msg)!, version: 1, msg } : null)} chips={chips} onSuggest={onSuggest} onRetry={onRetry} />
        {/* The backend's question, whatever the job state: the job waits for the answer. */}
        {msg.question && <QuestionCard msg={msg} />}
      </div>
    </li>
  )
}
