'use client'

import { useRef, useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { Check, Link2, Loader2, Sparkles, Upload } from 'lucide-react'
import { useT } from '@/i18n'
import { looksLikeLink, useChat } from './chatStore'
import type { ChatAssistantMessage, QuestionAnswer } from './chatTypes'

const ACCEPT = 'video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v,image/*,.jpg,.jpeg,.png,.webp'

/**
 * The backend's question: it asked instead of guessing, and the job waits for the answer. Option buttons (one click
 * answers, or checkboxes + Confirm when `multi`), plus a text box, an upload and a link when the question allows them.
 * Shown whenever the message carries a question, whatever the job state; never for a read-only (remote) chat.
 */
export function QuestionCard({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const remote = useChat((s) => s.remote)
  const q = msg.question
  const [checked, setChecked] = useState<string[]>([])
  const [text, setText] = useState('')
  const [link, setLink] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  if (!q || remote) return null
  const busy = sending !== null

  const submit = async (key: string, body: Partial<QuestionAnswer>, label?: string) => {
    if (busy) return
    setSending(key)
    setError(null)
    const problem = await useChat.getState().answerQuestion(
      msg.jobId, { questionId: q.id, optionIds: [], text: null, videoId: null, link: null, ...body }, label,
    )
    setSending(null)
    if (problem && problem !== 'stale') setError(problem)
  }

  const onOption = (id: string) => {
    if (busy) return
    if (q.multi) setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
    else void submit(`o:${id}`, { optionIds: [id] })
  }
  const onText = (e: FormEvent) => {
    e.preventDefault()
    const v = text.trim()
    if (v) void submit('text', { text: v }, v)
  }
  const onLink = (e: FormEvent) => {
    e.preventDefault()
    const v = link.trim()
    if (looksLikeLink(v)) void submit('link', { link: v })
  }
  const onFile = async (file: File | undefined) => {
    if (!file || busy) return
    setSending('upload')
    setPct(0)
    setError(null)
    try {
      const videoId = await useChat.getState().uploadForAnswer(file, (f) => setPct(Math.round(f * 100)))
      setSending(null)
      await submit('upload', { videoId })
    } catch (e) {
      setSending(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const field = 'flex h-10 min-w-0 flex-1 basis-56 items-center gap-2 rounded-full border border-white/15 bg-surface-1 px-3 focus-within:border-accent-line'
  const withImages = q.options.some((o) => o.imageUrl)
  return (
    <div data-testid="chat-question" data-kind={q.kind} role="group" aria-label={q.text} aria-busy={busy} className="mt-4 w-full max-w-xl border-t border-white/10 pt-4">
      <p data-testid="chat-question-text" className="whitespace-pre-wrap break-words text-prose text-ink-0">{q.text}</p>

      {q.options.length > 0 && (
        <ul className={clsx('mt-3 gap-2', withImages ? 'grid grid-cols-2 sm:grid-cols-3' : 'flex flex-col')}>
          {q.options.map((o) => {
            const on = checked.includes(o.id)
            const mine = sending === `o:${o.id}`
            return (
              <li key={o.id} className="min-w-0">
                <button
                  type="button"
                  data-testid={`chat-question-option-${o.id}`}
                  disabled={busy}
                  role={q.multi ? 'checkbox' : undefined}
                  aria-checked={q.multi ? on : undefined}
                  onClick={() => onOption(o.id)}
                  className={clsx(
                    'relative flex w-full min-h-[44px] overflow-hidden rounded-xl border bg-surface-1 text-left transition-all focus-visible:outline-2 disabled:opacity-60',
                    withImages ? 'flex-col' : 'items-center gap-3 px-3.5 py-2.5',
                    on ? 'border-accent ring-2 ring-accent' : 'border-white/15 hover:border-accent-line',
                  )}
                >
                  {o.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.imageUrl} alt="" className="aspect-video w-full object-cover" loading="eager" />
                  )}
                  <span className={clsx('min-w-0 flex-1', withImages && 'px-2.5 py-2')}>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-label font-medium text-ink-0">{o.label}</span>
                      {o.recommended && (
                        <span data-testid={`chat-question-recommended-${o.id}`} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-caption font-semibold text-white">
                          <Sparkles size={10} aria-hidden />
                          {t('chat.question.recommended')}
                        </span>
                      )}
                    </span>
                    {o.hint && <span className="mt-0.5 block text-caption leading-snug text-ink-3">{o.hint}</span>}
                  </span>
                  {mine && <Loader2 size={15} className="mr-3 shrink-0 animate-spin text-ink-2" aria-hidden />}
                  {q.multi && (
                    <span aria-hidden className={clsx('mr-3 grid h-5 w-5 shrink-0 place-items-center rounded-md border', on ? 'border-accent bg-accent text-white' : 'border-white/30')}>
                      {on && <Check size={13} />}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {q.multi && q.options.length > 0 && (
        <button
          type="button"
          data-testid="chat-question-confirm"
          disabled={busy || checked.length === 0}
          onClick={() => void submit('confirm', { optionIds: q.options.map((o) => o.id).filter((id) => checked.includes(id)) })}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-label font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {sending === 'confirm' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />}
          {t('chat.question.confirm')}
        </button>
      )}

      {q.allowText && (
        <form onSubmit={onText} className="mt-3 flex flex-wrap items-center gap-2">
          <label className={field}>
            <input
              data-testid="chat-question-text-input"
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('chat.question.textPlaceholder')}
              aria-label={t('chat.question.textPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[16px] text-ink-0 placeholder:text-ink-4 focus:!outline-none sm:text-label"
            />
          </label>
          <button
            type="submit"
            data-testid="chat-question-text-send"
            disabled={busy || !text.trim()}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-label font-medium text-white transition-opacity disabled:opacity-40"
          >
            {sending === 'text' && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {t('chat.question.send')}
          </button>
        </form>
      )}

      {q.allowLink && (
        <form onSubmit={onLink} className="mt-3 flex flex-wrap items-center gap-2">
          <label className={field}>
            <Link2 size={15} className="shrink-0 text-ink-3" aria-hidden />
            <input
              data-testid="chat-question-link-input"
              type="url"
              inputMode="url"
              value={link}
              disabled={busy}
              onChange={(e) => setLink(e.target.value)}
              placeholder={t('chat.question.linkPlaceholder')}
              aria-label={t('chat.question.linkPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[16px] text-ink-0 placeholder:text-ink-4 focus:!outline-none sm:text-label"
            />
          </label>
          <button
            type="submit"
            data-testid="chat-question-link-send"
            disabled={busy || !looksLikeLink(link)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-label font-medium text-white transition-opacity disabled:opacity-40"
          >
            {sending === 'link' && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {t('chat.question.linkUse')}
          </button>
        </form>
      )}

      {q.allowUpload && (
        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            hidden
            data-testid="chat-question-file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              void onFile(file)
            }}
          />
          <button
            type="button"
            data-testid="chat-question-upload"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-surface-1 px-4 text-label font-medium text-ink-0 transition-colors hover:border-accent-line disabled:opacity-60"
          >
            {sending === 'upload' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} aria-hidden />}
            {sending === 'upload' ? t('chat.upload.uploading', { pct }) : t('chat.question.upload')}
          </button>
        </div>
      )}

      {error && (
        <p data-testid="chat-question-error" role="alert" className="mt-2 break-words text-label text-danger">{error}</p>
      )}
    </div>
  )
}
