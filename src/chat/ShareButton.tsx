'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, Copy, Loader2, Share2 } from 'lucide-react'
import { useT } from '@/i18n'
import { shareChat } from './chatApi'

type State = { s: 'idle' } | { s: 'making' } | { s: 'ready'; url: string } | { s: 'error' }

/**
 * Share: makes a link anyone can open to watch (30 days) and shows it with Copy, and the phone's own share sheet when it has one.
 * `clipId` shares one clip of a clipping chat instead of the chat's finished video.
 */
export function ShareButton({ jobId, clipId, turn, compact = false, testId = 'chat-share' }: { jobId: string; clipId?: string; turn?: number; compact?: boolean; testId?: string }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ s: 'idle' })
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [dx, setDx] = useState(0)

  // keep the whole box on screen, wherever the button sits (the preview panel is narrow and can be dragged)
  useLayoutEffect(() => {
    const el = pop.current
    if (!open || !el) return
    const prev = el.style.transform
    el.style.transform = 'none'
    const r = el.getBoundingClientRect()
    el.style.transform = prev
    const pad = 12
    let d = 0
    if (r.right > window.innerWidth - pad) d = window.innerWidth - pad - r.right
    if (r.left + d < pad) d = pad - r.left
    setDx(d)
  }, [open, state.s])

  // a link made for one video is not the link for another: start over when the thing being shared changes
  useEffect(() => {
    setState({ s: 'idle' })
    setOpen(false)
    setCopied(false)
  }, [jobId, clipId, turn])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = async () => {
    if (open) return setOpen(false)
    setOpen(true)
    if (state.s === 'ready' || state.s === 'making') return
    setState({ s: 'making' })
    try {
      const { url } = await shareChat(jobId, clipId, turn)
      setState({ s: 'ready', url })
    } catch {
      setState({ s: 'error' })
    }
  }

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard blocked: the link is selectable in the box
    }
  }

  const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        data-testid={testId}
        aria-expanded={open}
        onClick={() => void toggle()}
        className={
          compact
            ? 'inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-3 text-label font-medium text-ink-0 transition-colors hover:bg-white/[0.09]'
            : 'inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-4 text-label font-semibold text-ink-0 transition-colors hover:bg-white/[0.09]'
        }
      >
        <Share2 size={14} aria-hidden /> {t('share.button')}
      </button>
      {open && (
        <div
          ref={pop}
          style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
          role="dialog"
          aria-label={t('share.title')}
          className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] space-y-2.5 rounded-2xl border border-white/15 bg-surface-2 p-3 shadow-[0_12px_40px_rgb(0_0_0/0.6)]"
        >
          {state.s === 'making' && (
            <p role="status" className="flex items-center gap-2 text-label text-ink-2">
              <Loader2 size={14} className="animate-spin" aria-hidden /> {t('share.creating')}
            </p>
          )}
          {state.s === 'error' && (
            <p role="alert" className="text-label text-danger">
              {t('share.error')}
            </p>
          )}
          {state.s === 'ready' && (
            <>
              <div className="space-y-2">
                <input
                  readOnly
                  value={state.url}
                  data-testid="chat-share-url"
                  aria-label={t('share.copy')}
                  onFocus={(e) => e.currentTarget.select()}
                  className="block w-full min-w-0 truncate rounded-lg border border-white/10 bg-black px-3 py-2.5 font-mono text-caption text-ink-1 outline-none focus:border-white/30"
                />
                <button
                  type="button"
                  data-testid="chat-share-copy"
                  onClick={() => void copy(state.url)}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-ink-0 px-3 text-label font-semibold text-surface-0 hover:opacity-90"
                >
                  {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                  {copied ? t('share.copied') : t('share.copy')}
                </button>
              </div>
              {canNative && (
                <button
                  type="button"
                  onClick={() => void navigator.share({ url: state.url }).catch(() => undefined)}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/15 text-label font-medium text-ink-0 hover:bg-white/[0.06]"
                >
                  <Share2 size={14} aria-hidden /> {t('share.native')}
                </button>
              )}
              <p className="text-caption text-ink-3">{t('share.note')}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
