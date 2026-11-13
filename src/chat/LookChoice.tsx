'use client'

import { useRef, useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { Check, Link2, Loader2, Sparkles, Upload } from 'lucide-react'
import { useT } from '@/i18n'
import { useNow } from './ActivityPanel'
import { looksLikeLink, useChat } from './chatStore'
import type { ChatAssistantMessage } from './chatTypes'

/**
 * The template chooser. Up to three templates from the shared stock, each a still of the user's own footage, the
 * recommended one tagged "Best"; under them a box to copy a NEW template from a link (Instagram, YouTube ...) or from an
 * uploaded video. The server waits for the answer and then takes the best template, so the countdown is the real
 * deadline; it is put on hold while a link is being fetched or a file is uploading.
 */
export function LookChoice({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const { chooseLook, lookFromLink, lookFromFile } = useChat.getState()
  const [picked, setPicked] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'link' | 'upload' | null>(null)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lc = msg.lookChoice
  const now = useNow(!!lc, 500)
  if (!lc || !lc.open) return null
  const left = Math.max(0, Math.ceil(lc.secondsLeft - (now - lc.receivedAt) / 1000))
  const locked = picked !== null || busy !== null
  const pick = (id: string | null) => {
    if (locked) return
    setPicked(id ?? 'none')
    void chooseLook(msg.jobId, id)
  }
  const copyLink = async (e: FormEvent) => {
    e.preventDefault()
    if (locked || !looksLikeLink(url)) return
    setBusy('link')
    setError(null)
    const problem = await lookFromLink(msg.jobId, url)
    setBusy(null)
    if (problem) setError(problem)
    else setPicked('reference')
  }
  const copyFile = async (file: File | undefined) => {
    if (!file || locked) return
    setBusy('upload')
    setPct(0)
    setError(null)
    const problem = await lookFromFile(msg.jobId, file, (f) => setPct(Math.round(f * 100)))
    setBusy(null)
    if (problem) setError(problem)
    else setPicked('reference')
  }
  const status = picked
    ? t('chat.look.picked')
    : busy === 'link'
      ? t('chat.look.fetching')
      : busy === 'upload'
        ? t('chat.upload.uploading', { pct })
        : lc.options.length > 0
          ? t('chat.look.auto', { n: left })
          : t('chat.look.autoNone', { n: left })
  return (
    <div data-testid="chat-look-choice" role="group" aria-label={t('chat.look.title')} className="mt-4 border-t border-white/10 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body font-semibold text-ink-0">{t('chat.look.title')}</p>
        <p data-testid="chat-look-timer" aria-live="off" className="font-mono text-caption tabular-nums text-ink-3">
          {status}
        </p>
      </div>
      {lc.options.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2.5">
          {lc.options.map((o) => {
            const on = picked === o.id
            return (
              <li key={o.id} className="min-w-0">
                <button
                  type="button"
                  data-testid={`chat-look-${o.id}`}
                  disabled={locked}
                  onClick={() => pick(o.id)}
                  aria-pressed={on}
                  className={clsx(
                    'group relative block w-full overflow-hidden rounded-xl border bg-surface-1 text-left transition-all',
                    on ? 'border-accent ring-2 ring-accent' : 'border-white/15 hover:-translate-y-px hover:border-accent-line',
                    locked && !on && 'opacity-50',
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
      )}

      {/* a new template: from a link, or from an uploaded video */}
      <p className="mt-4 text-label text-ink-1">{t('chat.look.copyTitle')}</p>
      <form onSubmit={copyLink} className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 basis-56 items-center gap-2 rounded-full border border-white/15 bg-surface-1 px-3 focus-within:border-accent-line">
          <Link2 size={15} className="shrink-0 text-ink-3" aria-hidden />
          <input
            data-testid="chat-look-link"
            type="url"
            inputMode="url"
            value={url}
            disabled={locked}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
            // typing a link takes longer than the countdown allows: ask the server to wait
            onFocus={() => void useChat.getState().holdLook(msg.jobId)}
            placeholder={t('chat.look.linkPlaceholder')}
            aria-label={t('chat.look.linkPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-label text-ink-0 placeholder:text-ink-4 focus:!outline-none"
          />
        </label>
        <button
          type="submit"
          data-testid="chat-look-link-use"
          disabled={locked || !looksLikeLink(url)}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-label font-medium text-white transition-opacity disabled:opacity-40"
        >
          {busy === 'link' && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {t('chat.look.linkUse')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,.mp4,.mov,.mkv,.webm,.m4v"
          className="hidden"
          data-testid="chat-look-file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            void copyFile(file)
          }}
        />
        <button
          type="button"
          data-testid="chat-look-upload"
          disabled={locked}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-4 text-label text-ink-1 transition-colors hover:border-accent-line hover:text-ink-0 disabled:opacity-40"
        >
          {busy === 'upload' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />}
          {t('chat.look.upload')}
        </button>
      </form>
      {error && (
        <p role="alert" data-testid="chat-look-error" className="mt-2 text-caption text-danger">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="text-caption text-ink-3">{t('chat.look.copyHint')}</p>
        <button
          type="button"
          data-testid="chat-look-skip"
          disabled={locked}
          onClick={() => pick(null)}
          className="shrink-0 text-caption text-ink-3 underline-offset-2 hover:text-ink-1 hover:underline disabled:opacity-40"
        >
          {t('chat.look.skip')}
        </button>
      </div>
    </div>
  )
}
