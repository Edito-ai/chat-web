import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { Download, ExternalLink, FilePlus2, Loader2, LogOut, MessageSquarePlus, Send, Square, X } from 'lucide-react'
import { useT, useLocale, type MessageKey } from '@/i18n'
import { Button, IconButton, InlineError, Logo } from '@/components/ui'
import { EDITOR_URL } from '@/lib/env'
import { useAuth } from '@/auth/authStore'
import { useChat, type ChatAttachment, type ChatSendProblem } from './chatStore'
import { activeAssistant, knownStage, lastCompleted } from './chatState'
import type { ChatAssistantMessage, ChatMessage } from './chatTypes'

const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v'

/** One uploaded file waiting to be sent: name + its upload progress. */
function AttachmentChip({ item, onRemove }: { item: ChatAttachment; onRemove: () => void }) {
  const { t } = useT()
  const pct = Math.round(item.progress * 100)
  return (
    <li
      data-testid={`chat-attachment-${item.id}`}
      className="flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface-2 py-1 pl-2.5 pr-1 text-label"
    >
      <span className="min-w-0 truncate text-ink-1">{item.name}</span>
      <span className={item.state === 'failed' ? 'shrink-0 text-danger' : 'shrink-0 text-ink-3'}>
        {item.state === 'failed'
          ? t('chat.upload.failed')
          : item.state === 'ready'
            ? t('chat.upload.ready')
            : t('chat.upload.uploading', { pct })}
      </span>
      <IconButton icon={X} size="sm" aria-label={t('chat.remove', { name: item.name })} onClick={onRemove} />
    </li>
  )
}

function ProgressLine({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const stage = knownStage(msg.stage)
  const label = msg.message ?? t(stage ? (`chat.stage.${stage}` as MessageKey) : 'chat.stage.working')
  const pct = msg.progress === null ? null : Math.round(msg.progress * 100)
  return (
    <div data-testid="chat-progress" className="space-y-2">
      <p className="flex items-center gap-2 text-body text-ink-1">
        <Loader2 size={14} className="shrink-0 animate-spin text-ink-3" aria-hidden />
        <span>{label}</span>
      </p>
      <div
        role="progressbar"
        aria-label={t('chat.progress.aria')}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(pct !== null ? { 'aria-valuenow': pct } : {})}
        className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/[0.08]"
      >
        <div
          className={pct === null ? 'h-full w-1/3 animate-pulse rounded-full bg-ink-2' : 'h-full rounded-full bg-ink-1 transition-[width] duration-500'}
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function AssistantBubble({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const lostJobId = useChat((s) => s.pollLostJobId)
  const retryPolling = useChat((s) => s.retryPolling)
  const actionError = useChat((s) => s.actionError)

  if (msg.status === 'complete' && msg.result) {
    const { result } = msg
    return (
      <div className="space-y-3">
        <p className="text-body text-ink-1">{msg.reply ?? t('chat.result.ready')}</p>
        <video
          data-testid="chat-video"
          aria-label={t('chat.result.aria')}
          src={result.videoUrl}
          controls
          playsInline
          preload="metadata"
          className="max-h-[70vh] w-full max-w-xl rounded-xl border border-line bg-black"
        />
        <div className="flex flex-wrap gap-2">
          <a
            data-testid="chat-download"
            href={result.downloadUrl ?? result.videoUrl}
            download={result.fileName ?? 'edited.mp4'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink-0 px-3.5 text-body font-semibold text-surface-0 hover:bg-white"
          >
            <Download size={15} strokeWidth={1.75} aria-hidden /> {t('chat.download')}
          </a>
          {EDITOR_URL && (
            <a
              data-testid="chat-open-editor"
              href={EDITOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-line bg-surface-3 px-3.5 text-body font-semibold text-ink-0 hover:bg-surface-4"
            >
              <ExternalLink size={15} strokeWidth={1.75} aria-hidden /> {t('chat.openEditor')}
            </a>
          )}
        </div>
      </div>
    )
  }
  if (msg.status === 'cancelled') return <p className="text-body text-ink-3">{t('chat.stopped')}</p>
  if (msg.status === 'failed') {
    return (
      <div className="space-y-1">
        <p className="text-body text-ink-1">{t('chat.failed')}</p>
        <InlineError message={msg.error && msg.error !== 'failed' && msg.error !== 'missing_result' ? msg.error : undefined} />
      </div>
    )
  }
  if (lostJobId === msg.jobId) {
    return (
      <div className="space-y-1">
        <p className="text-body text-ink-1">{t('chat.lost')}</p>
        <InlineError error={actionError} onRetry={retryPolling} />
      </div>
    )
  }
  return <ProgressLine msg={msg} />
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const { t } = useT()
  if (msg.role === 'user') {
    return (
      <li data-testid={`chat-message-${msg.id}`} className="flex justify-end">
        <div className="max-w-[85%] space-y-1.5 rounded-2xl rounded-br-md bg-surface-3 px-3.5 py-2.5">
          <span className="sr-only">{t('chat.you')}: </span>
          {msg.attachments.length > 0 && <p className="break-words text-caption text-ink-3">{msg.attachments.join(', ')}</p>}
          <p className="whitespace-pre-wrap break-words text-body text-ink-0">{msg.text}</p>
        </div>
      </li>
    )
  }
  return (
    <li data-testid={`chat-message-${msg.id}`} className="flex justify-start">
      <div className="min-w-0 max-w-full space-y-1.5">
        <span className="sr-only">{t('chat.assistant')}: </span>
        <AssistantBubble msg={msg} />
      </div>
    </li>
  )
}

const PROBLEM_KEY: Record<ChatSendProblem, MessageKey> = {
  noVideo: 'chat.problem.noVideo',
  noPrompt: 'chat.problem.noPrompt',
  uploading: 'chat.problem.uploading',
  uploadFailed: 'chat.problem.uploadFailed',
}

/**
 * Chat-style edit screen: add footage, describe the edit, watch progress, get the video back with a player and
 * Download, then send follow-ups. No timeline.
 */
export function ChatScreen() {
  const { t, locale } = useT()
  const setLocale = useLocale((s) => s.setLocale)
  const messages = useChat((s) => s.messages)
  const attachments = useChat((s) => s.attachments)
  const busy = useChat((s) => s.busy)
  const actionError = useChat((s) => s.actionError)
  const lostJobId = useChat((s) => s.pollLostJobId)
  const userName = useAuth((s) => s.user?.name ?? s.user?.email ?? '')
  const { attach, removeAttachment, send, cancel, resume, newChat, clearActionError } = useChat.getState()
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<ChatSendProblem | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const running = activeAssistant(messages) !== null
  const hasVideo = lastCompleted(messages) !== null
  const uploading = attachments.some((a) => a.state === 'uploading')

  // Re-attach to a job that was running when the tab was closed.
  useEffect(() => {
    void resume()
  }, [resume])

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages, attachments.length])

  const submit = async () => {
    if (running || busy) return
    const prompt = text
    const p = await send(prompt)
    setProblem(p)
    if (p === null && prompt.trim()) setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (running) return
    void attach(Array.from(e.dataTransfer.files))
  }

  const sendDisabled = busy || running || uploading
  const showTopError = actionError !== null && lostJobId === null

  return (
    <div
      data-testid="chat-screen"
      className="app-shell relative flex h-full w-full flex-col overflow-hidden text-ink-1"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-3 sm:gap-2 sm:px-4">
        <div className="hidden sm:block">
          <Logo />
        </div>
        <h1 className="min-w-0 flex-1 truncate text-title font-semibold text-ink-0">{t('chat.title')}</h1>
        <Button data-testid="chat-new" variant="ghost" icon={MessageSquarePlus} disabled={busy} onClick={() => void newChat()}>
          <span className="hidden sm:inline">{t('chat.new')}</span>
          <span className="sr-only sm:hidden">{t('chat.new')}</span>
        </Button>
        <select
          aria-label={t('lang.switch')}
          value={locale}
          onChange={(e) => setLocale(e.target.value === 'hi' ? 'hi' : 'en')}
          className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-label text-ink-1"
        >
          <option value="en">EN</option>
          <option value="hi">हिं</option>
        </select>
        <IconButton
          data-testid="chat-sign-out"
          icon={LogOut}
          aria-label={`${t('auth.signOut')}${userName ? ` (${userName})` : ''}`}
          title={t('auth.signOut')}
          onClick={() => {
            useChat.getState().reset()
            useAuth.getState().logout()
          }}
        />
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="grid place-items-center py-16 text-center">
              <div className="max-w-md space-y-2">
                <h2 className="text-heading font-semibold text-ink-0">{t('chat.empty.title')}</h2>
                <p className="text-body text-ink-3">{t('chat.empty.sub')}</p>
              </div>
            </div>
          ) : (
            <ol data-testid="chat-log" role="log" aria-live="polite" aria-label={t('chat.log.aria')} className="space-y-5">
              {messages.map((m) => (
                <Bubble key={m.id} msg={m} />
              ))}
            </ol>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-surface-0/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {showTopError && (
            <div className="flex items-start justify-between gap-2">
              <InlineError error={actionError} />
              <IconButton size="sm" icon={X} aria-label={t('common.close')} onClick={clearActionError} />
            </div>
          )}
          {problem && <InlineError message={t(PROBLEM_KEY[problem])} />}
          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <AttachmentChip key={a.id} item={a} onRemove={() => removeAttachment(a.id)} />
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface-1 p-2 focus-within:border-line-strong">
            <input
              ref={fileRef}
              data-testid="chat-file-input"
              type="file"
              multiple
              accept={VIDEO_ACCEPT}
              hidden
              onChange={(e) => {
                if (e.target.files) void attach(Array.from(e.target.files))
                e.target.value = ''
              }}
            />
            <IconButton
              data-testid="chat-attach"
              icon={busy && attachments.length === 0 ? Loader2 : FilePlus2}
              size="lg"
              aria-label={t('chat.attach')}
              disabled={busy || running}
              onClick={() => fileRef.current?.click()}
            />
            <textarea
              data-testid="chat-input"
              aria-label={t('chat.composer.aria')}
              value={text}
              rows={1}
              onChange={(e) => {
                setText(e.target.value)
                if (problem) setProblem(null)
              }}
              onKeyDown={onKeyDown}
              placeholder={t(hasVideo ? 'chat.composer.placeholderFollowUp' : 'chat.composer.placeholder')}
              className="scroll-thin max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-body text-ink-0 placeholder:text-ink-4 focus:outline-none"
            />
            {running ? (
              <Button data-testid="chat-stop" variant="secondary" icon={Square} className="h-10" onClick={() => void cancel()}>
                {t('chat.stop')}
              </Button>
            ) : (
              <Button data-testid="chat-send" variant="primary" icon={Send} className="h-10" disabled={sendDisabled} onClick={() => void submit()}>
                {t('chat.send')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-surface-0/80 text-heading font-semibold text-ink-0">
          {t('chat.dropHint')}
        </div>
      )}
    </div>
  )
}
