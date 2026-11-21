'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUp, Check, Paperclip, Play } from 'lucide-react'
import { useT } from '@/i18n'
import type { Box } from './place'

/**
 * A scripted, looping demo played on top of the real composer during the tour: a video is dragged in and uploads, a prompt
 * types itself and Send is pressed. Pure decoration over the real box: nothing is uploaded or sent, the chat state is never touched.
 */

const LOOP = 10_500
/** Timeline (ms). Everything on screen is derived from the time, so the demo is the same on every loop. */
const T = {
  drag1: [300, 1300],
  upload1: [1300, 2800],
  type: [3300, 6700],
  clickSend: 7300,
  sent: 7700,
  fade: [9700, 10_500],
} as const

const VIDEO = 'my-vlog.mp4'

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
const span = (t: number, [a, b]: readonly [number, number]) => ease((t - a) / (b - a))
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Time inside a looping demo (ms). With reduced motion: one still frame (`still`). */
function useLoopTime(loop: number, still: number): number {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (reducedMotion()) return void setT(still)
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      setT((now - start) % loop)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [loop, still])
  return t
}

/** A small "video file" thumbnail: a gradient frame with a play mark and a duration. */
function Thumb({ tall, className }: { tall?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-md ring-1 ring-white/20',
        tall ? 'h-7 w-[1.1rem] bg-[linear-gradient(160deg,#7c3aed,#db2777_55%,#f59e0b)]' : 'h-6 w-9 bg-[linear-gradient(160deg,#0ea5e9,#6366f1_45%,#f97316)]',
        className,
      )}
    >
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_30%_120%,rgb(0_0_0/0.55),transparent_70%)]" />
      <Play size={9} className="relative fill-white text-white" />
    </span>
  )
}

/** The file that is "dragged" into the box, with the pointer holding it. */
function DragCard({ name, meta, tall, p }: { name: string; meta: string; tall?: boolean; p: number }) {
  const style: CSSProperties = {
    transform: `translate(${(1 - p) * -40}px, ${(1 - p) * -96}px) rotate(${(1 - p) * -6}deg) scale(${1 - p * 0.15})`,
    opacity: p < 0.85 ? Math.min(1, p * 4) : (1 - p) / 0.15,
  }
  return (
    <div className="pointer-events-none absolute bottom-[calc(100%-2.75rem)] left-6 z-10" style={style}>
      <div className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-surface-3/95 py-2 pl-2 pr-3.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.9)] backdrop-blur">
        <Thumb tall={tall} className={tall ? '!h-10 !w-6' : '!h-9 !w-14'} />
        <span className="leading-tight">
          <span className="block text-label font-medium text-ink-0">{name}</span>
          <span className="block font-mono text-caption text-ink-3">{meta}</span>
        </span>
      </div>
      <Pointer className="absolute -bottom-3 right-1" />
    </div>
  )
}

function Pointer({ className, style, pressed }: { className?: string; style?: CSSProperties; pressed?: boolean }) {
  return (
    <span aria-hidden className={clsx('pointer-events-none absolute z-20 block transition-transform duration-150', pressed && 'scale-90', className)} style={style}>
      <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-[0_3px_6px_rgb(0_0_0/0.6)]">
        <path d="M5 3l14 7.2-6.3 1.6L9.8 18z" fill="white" stroke="#0b0d1c" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {pressed && <span className="absolute -left-2 -top-2 h-7 w-7 animate-ping rounded-full bg-accent/50" />}
    </span>
  )
}

function Ring({ p }: { p: number }) {
  if (p >= 1) return <Check size={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
  const r = 8
  const c = 2 * Math.PI * r
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden className="shrink-0 -rotate-90">
      <circle cx="10" cy="10" r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
      <circle cx="10" cy="10" r={r} fill="none" stroke="rgb(255 158 140)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.04, p))} />
    </svg>
  )
}

function Chip({ show, accent, children }: { show: number; accent?: boolean; children: ReactNode }) {
  return (
    <li
      className={clsx('flex max-w-full items-center gap-2 rounded-xl border bg-surface-2 py-1 pl-2 pr-2.5 text-label transition-[border-color,box-shadow] duration-300', accent ? 'border-accent-line shadow-[0_0_0_3px_rgb(255_158_140/0.12)]' : 'border-line')}
      style={{ opacity: show, transform: `translateY(${(1 - show) * 8}px) scale(${0.94 + show * 0.06})` }}
    >
      {children}
    </li>
  )
}

export function ComposerDemo({ anchor, radius }: { anchor: Box; radius: number }) {
  const { t } = useT()
  // Reduced motion: one still frame with everything filled in, just before Send.
  const now = useLoopTime(LOOP, T.clickSend - 200)
  const box = useRef<HTMLDivElement>(null)
  const sendBtn = useRef<HTMLSpanElement>(null)
  const prompt = t('tour.demo.prompt')

  const up1 = span(now, T.upload1)
  const typed = Math.round(span(now, T.type) * prompt.length)
  const ready = typed > 0
  const sent = now >= T.sent
  const fade = 1 - span(now, T.fade)
  const hasChips = now >= T.drag1[1] && now < T.fade[1] - 40

  // The pointer clicks Send.
  const at = (el: HTMLElement | null, dx = 0.5, dy = 0.6) => {
    const b = box.current?.getBoundingClientRect()
    const r = el?.getBoundingClientRect()
    return b && r ? { left: r.left - b.left + r.width * dx, top: r.top - b.top + r.height * dy } : null
  }
  let pointer: { pos: { left: number; top: number } | null; pressed: boolean } | null = null
  if (now >= T.type[1] && now < T.sent + 400) pointer = { pos: at(sendBtn.current), pressed: now >= T.clickSend && now < T.clickSend + 300 }

  return (
    <div
      aria-hidden
      data-tour-demo
      data-testid="tour-demo"
      className="pointer-events-none fixed"
      style={{ left: anchor.left, width: anchor.width, top: anchor.top + anchor.height, transform: 'translateY(-100%)' }}
    >
      <div ref={box} className="relative border border-white/15 bg-[linear-gradient(180deg,#121633,#0c0f24)] shadow-composer" style={{ borderRadius: Math.max(16, radius) }}>
        {now >= T.drag1[0] && now < T.drag1[1] + 120 && <DragCard name={VIDEO} meta="2:14 · 84 MB" p={span(now, T.drag1)} />}

        {hasChips && (
          <ul className="flex flex-wrap gap-2 px-3 pt-3" style={{ opacity: fade }}>
            <Chip show={span(now, [T.drag1[1] - 100, T.drag1[1] + 250])}>
              <Ring p={up1} />
              <Thumb />
              <span className="min-w-0 truncate text-ink-1">{VIDEO}</span>
              <span className="shrink-0 font-mono text-caption tabular-nums text-ink-3">
                {up1 >= 1 ? t('chat.upload.ready') : t('chat.upload.uploading', { pct: Math.round(up1 * 100) })}
              </span>
            </Chip>
          </ul>
        )}

        <div className="flex items-end gap-1.5 p-2">
          <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors', hasChips ? 'bg-accent/15 text-ink-0' : 'text-ink-3')}>
            <Paperclip size={20} strokeWidth={1.75} />
          </span>
          <span className="min-h-[40px] min-w-0 flex-1 self-center px-1 py-2 text-[15px] leading-[1.5] sm:text-prose" style={{ opacity: fade }}>
            {ready && fade > 0 ? (
              <span className="text-ink-0">
                {prompt.slice(0, typed)}
                {typed < prompt.length && <span className="ml-px inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-pulse rounded bg-accent" />}
              </span>
            ) : (
              <span className="text-ink-4">{t('chat.composer.placeholder')}</span>
            )}
          </span>
          <span
            ref={sendBtn}
            className={clsx(
              'grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all duration-300',
              typed >= prompt.length && fade > 0.5 ? 'bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] text-white shadow-[0_8px_22px_-8px_rgb(255_90_80/0.9)]' : 'bg-white/[0.08] text-ink-3',
              sent && 'scale-90',
            )}
          >
            {sent ? <Check size={18} strokeWidth={2.5} /> : <ArrowUp size={18} strokeWidth={2.25} />}
          </span>
        </div>

        {pointer?.pos && <Pointer style={{ left: pointer.pos.left - 4, top: pointer.pos.top - 2, transition: 'left 500ms cubic-bezier(.22,1,.36,1), top 500ms cubic-bezier(.22,1,.36,1)' }} pressed={pointer.pressed} />}

        {sent && fade > 0 && (
          <span style={{ opacity: fade }} className="absolute -top-9 right-2 animate-rise rounded-full border border-success/30 bg-success/15 px-3 py-1 text-caption font-medium text-success">
            {t('tour.demo.sent')}
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// The Send step: the box already holds a video and a prompt; the pointer presses the arrow.
// ---------------------------------------------------------------------------------------------------------------------

const SEND_LOOP = 8000
const S = {
  aim: [300, 1700],
  click1: 2600,
  sent1: 2800,
  out1: [6200, 7000],
} as const

export function SendDemo({ anchor, radius }: { anchor: Box; radius: number }) {
  const { t } = useT()
  const now = useLoopTime(SEND_LOOP, S.click1 - 300)
  const box = useRef<HTMLDivElement>(null)
  const sendBtn = useRef<HTMLSpanElement>(null)
  const edit = t('tour.demo.prompt')

  const sent = now >= S.sent1
  const pressed = now >= S.click1 && now < S.click1 + 260
  const show = 1 - span(now, S.out1)
  // After Send the box empties, like the real one: the message has gone into the chat.
  const empty = sent
  const aiming = now >= S.aim[0] && now < S.sent1 + 300
  const aimP = span(now, S.aim)
  const callout = !sent

  // The pointer glides in from the left of the box to the send arrow.
  let pointer: CSSProperties | null = null
  if (aiming && box.current && sendBtn.current) {
    const b = box.current.getBoundingClientRect()
    const r = sendBtn.current.getBoundingClientRect()
    const tx = r.left - b.left + r.width * 0.5
    const ty = r.top - b.top + r.height * 0.6
    const fx = b.width * 0.45
    const fy = b.height + 30
    pointer = { left: fx + (tx - fx) * aimP - 4, top: fy + (ty - fy) * aimP - 2 }
  }

  return (
    <div
      aria-hidden
      data-tour-demo
      data-testid="tour-demo-send"
      className="pointer-events-none fixed"
      style={{ left: anchor.left, width: anchor.width, top: anchor.top + anchor.height, transform: 'translateY(-100%)' }}
    >
      <div ref={box} className="relative border border-white/15 bg-[linear-gradient(180deg,#121633,#0c0f24)] shadow-composer" style={{ borderRadius: Math.max(16, radius) }}>
        {!empty && (
          <ul className="flex flex-wrap gap-2 px-3 pt-3" style={{ opacity: show }}>
            <Chip show={1}>
              <Ring p={1} />
              <Thumb />
              <span className="min-w-0 truncate text-ink-1">{VIDEO}</span>
              <span className="shrink-0 font-mono text-caption text-ink-3">{t('chat.upload.ready')}</span>
            </Chip>
          </ul>
        )}

        <div className="flex items-end gap-1.5 p-2">
          <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-full', !empty ? 'bg-accent/15 text-ink-0' : 'text-ink-3')}>
            <Paperclip size={20} strokeWidth={1.75} />
          </span>
          <span className="min-h-[40px] min-w-0 flex-1 self-center px-1 py-2 text-[15px] leading-[1.5] sm:text-prose" style={{ opacity: empty ? 1 : show }}>
            {empty ? <span className="text-ink-4">{t('chat.composer.placeholder')}</span> : <span className="text-ink-0">{edit}</span>}
          </span>
          <span className="relative shrink-0">
            {callout && (
              // Below the box, so it never covers the chips: an arrow bouncing up at the send button.
              <span className="absolute right-0 top-[calc(100%+14px)] flex flex-col items-end" style={{ opacity: show }}>
                <ArrowUp size={18} strokeWidth={2.5} className="tour-bounce-up mb-0.5 mr-2.5 text-[#FF9E8C]" />
                <span className="whitespace-nowrap rounded-full bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] px-2.5 py-1 text-caption font-semibold text-white shadow-[0_8px_20px_-8px_rgb(255_90_80/0.9)]">
                  {t('tour.demo.clickSend')}
                </span>
              </span>
            )}
            <span
              ref={sendBtn}
              className={clsx(
                'grid h-10 w-10 place-items-center rounded-full transition-all duration-200',
                !empty ? 'bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] text-white shadow-[0_8px_22px_-8px_rgb(255_90_80/0.9)]' : 'bg-white/[0.08] text-ink-3',
                callout && 'tour-send-pulse',
                pressed && 'scale-90',
              )}
            >
              {sent ? <Check size={18} strokeWidth={2.5} className="text-success" /> : <ArrowUp size={18} strokeWidth={2.25} />}
            </span>
          </span>
        </div>

        {pointer && <Pointer style={pointer} pressed={pressed} />}

        {sent && show > 0 && (
          <span style={{ opacity: show }} className="absolute -top-9 right-2 inline-flex animate-rise items-center gap-1.5 rounded-full border border-success/30 bg-success/15 px-3 py-1 text-caption font-medium text-success">
            <Check size={12} strokeWidth={3} /> {t('tour.demo.sent')}
          </span>
        )}
      </div>
    </div>
  )
}
