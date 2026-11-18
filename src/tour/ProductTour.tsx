'use client'

import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useT } from '@/i18n'
import { Confetti } from '@/auth/Confetti'
import { place, type Box, type Placement } from './place'
import { TOUR_STEPS, targetOf } from './steps'
import { useTour } from './tourStore'

const PAD = 8
const CARD_W = 368
/** How long a step waits for its target (a menu or the drawer opening) before it is skipped. */
const FIND_MS = 1500

function useMedia(query: string): boolean {
  const [hit, setHit] = useState(false)
  useEffect(() => {
    const m = window.matchMedia?.(query)
    if (!m) return
    const on = () => setHit(m.matches)
    on()
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [query])
  return hit
}

/** The first match that is actually on screen: the sidebar is rendered twice (rail and drawer), one of them hidden. */
function visible(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && el.getClientRects().length > 0) return el
  }
  return null
}

const sameBox = (a: Box | null, b: Box) => a !== null && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5

/**
 * The first-run product tour: dims the app, cuts a glowing window around one part of the screen at a time and explains it in
 * a glass card next to it (a sheet at the top or bottom on phones). It opens the attach menu, the drawer and the account menu
 * itself when a step needs them. Keys: → / Enter next, ← back, Esc skip.
 */
export function ProductTour() {
  const { t } = useT()
  const active = useTour((s) => s.active)
  const index = useTour((s) => s.index)
  const mobile = useMedia('(max-width: 767px)')
  const small = useMedia('(max-width: 639px)')
  const [mounted, setMounted] = useState(false)
  const [rect, setRect] = useState<Box | null>(null)
  const [radius, setRadius] = useState(16)
  const [ready, setReady] = useState(false)
  const [card, setCard] = useState({ width: CARD_W, height: 260 })
  const [vp, setVp] = useState({ width: 1280, height: 800 })
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const steps = TOUR_STEPS
  const step = steps[Math.min(index, steps.length - 1)]
  const first = index === 0
  const last = index === steps.length - 1
  const selector = active ? targetOf(step, mobile) : null

  useEffect(() => setMounted(true), [])

  // Viewport size, for the centred cards and for placement.
  useEffect(() => {
    if (!active) return
    const on = () => setVp((v) => (v.width === window.innerWidth && v.height === window.innerHeight ? v : { width: window.innerWidth, height: window.innerHeight }))
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [active])

  // Remember where focus was, give it back at the end.
  useEffect(() => {
    if (active) returnFocus.current = document.activeElement as HTMLElement | null
    else returnFocus.current?.focus?.({ preventScroll: true })
  }, [active])

  // Open what this step needs (the drawer, a menu), close the rest.
  useEffect(() => {
    if (active) useTour.getState().setUi(step.ui?.(mobile) ?? {})
  }, [active, step, mobile])

  // Follow the target every frame: menus rise, the drawer slides in, the composer moves when the window resizes.
  useEffect(() => {
    if (!active) return
    setReady(false)
    if (!selector) {
      setRect(null)
      setReady(true)
      return
    }
    const startedAt = performance.now()
    let found = false
    let raf = 0
    const tick = () => {
      const el = visible(selector)
      if (el) {
        if (!found) {
          el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
          const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12
          setRadius(Math.min(r + PAD, 40))
          found = true
          setReady(true)
        }
        // Padded, but kept 4px inside the window so the glowing edge is never cut off (the sidebar touches the left edge).
        const r = el.getBoundingClientRect()
        const left = Math.max(4, r.left - PAD)
        const top = Math.max(4, r.top - PAD)
        const right = Math.min(window.innerWidth - 4, r.right + PAD)
        const bottom = Math.min(window.innerHeight - 4, r.bottom + PAD)
        const next = { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
        setRect((prev) => (sameBox(prev, next) ? prev : next))
      } else if (!found && performance.now() - startedAt > FIND_MS) {
        // Not on this screen (signed out, an older backend without the feature): go on without it.
        const s = useTour.getState()
        if (s.dir === -1 && s.index > 0) s.back()
        else s.next(steps.length)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, index, selector, steps.length])

  // Card size for placement.
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const measure = () => setCard((c) => (c.width === el.offsetWidth && c.height === el.offsetHeight ? c : { width: el.offsetWidth, height: el.offsetHeight }))
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [active, index])

  // The card's main button takes focus once the step is in place (a menu that just opened focuses its own first item).
  useEffect(() => {
    if (active && ready) {
      const id = requestAnimationFrame(() => primaryRef.current?.focus({ preventScroll: true }))
      return () => cancelAnimationFrame(id)
    }
  }, [active, ready, index])

  // Keys win over the app while the tour runs (capture phase), so Enter never presses a menu item behind the card.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const s = useTour.getState()
      if (e.key === 'Escape') s.finish('skip')
      else if (e.key === 'ArrowRight') s.next(steps.length)
      else if (e.key === 'ArrowLeft') s.back()
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement && cardRef.current?.contains(e.target))) s.next(steps.length)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, steps.length])

  if (!mounted || !active) return null

  const { next, back, finish } = useTour.getState()
  const centred = rect === null
  const Icon = step.icon

  // Where the card goes.
  let cardStyle: CSSProperties
  let side: Placement | null = null
  let arrow: number | null = null
  if (centred) {
    cardStyle = { top: Math.max(16, (vp.height - card.height) / 2), left: Math.max(16, (vp.width - card.width) / 2) }
  } else if (small) {
    const roomAbove = rect.top
    const roomBelow = vp.height - (rect.top + rect.height)
    cardStyle = roomBelow >= roomAbove ? { bottom: 'max(12px, env(safe-area-inset-bottom))', left: 12, right: 12 } : { top: 'max(12px, env(safe-area-inset-top))', left: 12, right: 12 }
  } else {
    const p = place(rect, card, vp, step.placement ?? 'bottom')
    side = p.side
    cardStyle = { top: p.top, left: p.left }
    arrow =
      side === 'top' || side === 'bottom'
        ? Math.min(Math.max(rect.left + rect.width / 2 - p.left, 24), card.width - 24)
        : Math.min(Math.max(rect.top + rect.height / 2 - p.top, 24), card.height - 24)
  }

  // The lit window: zero size in the middle of the screen for the centred cards, so the whole app is dimmed.
  const hole: CSSProperties = rect
    ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height, borderRadius: radius }
    : { top: vp.height / 2, left: vp.width / 2, width: 0, height: 0, borderRadius: 999 }

  return createPortal(
    <div data-tour-root className="fixed inset-0 z-[90]" data-testid="tour">
      {/* Catches clicks so the app behind stays as the tour left it. */}
      <div aria-hidden className="absolute inset-0" onMouseDown={(e) => e.preventDefault()} />

      <div
        aria-hidden
        data-testid="tour-spotlight"
        className="tour-hole pointer-events-none absolute transition-[top,left,width,height,border-radius] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={hole}
      >
        {rect && <span className="tour-ring absolute inset-0 rounded-[inherit]" />}
      </div>

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        data-testid="tour-card"
        data-step={step.id}
        className={clsx(
          'absolute overflow-visible rounded-[1.4rem] border border-white/[0.14] bg-[linear-gradient(160deg,rgb(30_34_70/0.94),rgb(14_16_34/0.96))] text-ink-1 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.85),0_0_0_1px_rgb(255_158_140/0.06)_inset] backdrop-blur-2xl',
          'transition-[top,left,bottom,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          small && !centred ? '' : 'w-[min(23rem,calc(100vw-2rem))]',
          ready ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={cardStyle}
      >
        {side && arrow !== null && <Arrow side={side} at={arrow} />}

        {/* soft coral glow in the corner */}
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#FF7A5C]/20 blur-3xl" />

        <div key={step.id} className="relative animate-rise p-4 sm:p-6">
          <div className="mb-3 flex items-center gap-3 sm:mb-4">
            <span className={clsx('grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] text-white shadow-[0_10px_26px_-10px_rgb(255_90_80/0.9)]', centred ? 'h-12 w-12' : 'h-10 w-10')}>
              <Icon size={centred ? 22 : 18} strokeWidth={1.9} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 font-mono text-caption uppercase tracking-[0.14em] text-accent">
              {first ? t('tour.eyebrow.welcome') : last ? t('tour.eyebrow.done') : t('tour.eyebrow.step', { n: index, total: steps.length - 2 })}
            </span>
            {!last && (
              <button
                type="button"
                data-testid="tour-close"
                aria-label={t('tour.skip')}
                onClick={() => finish('skip')}
                className="-mr-2 -mt-2 grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-white/[0.08] hover:text-ink-0"
              >
                <X size={16} aria-hidden />
              </button>
            )}
          </div>

          <h2 id="tour-title" className={clsx('font-display font-semibold leading-tight tracking-tight text-ink-0', centred ? 'text-heading' : 'text-title')}>
            {t(step.title)}
          </h2>
          <p id="tour-body" aria-live="polite" className="mt-2 text-body leading-relaxed text-ink-2">
            {t(step.body)}
          </p>

          {step.points && (
            <ul className="mt-3 space-y-1.5 sm:mt-3.5 sm:space-y-2">
              {step.points.map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-label leading-snug text-ink-1">
                  <span aria-hidden className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                    <Check size={10} strokeWidth={3} />
                  </span>
                  {t(k)}
                </li>
              ))}
            </ul>
          )}

          {!first && !last && (
            <div className="mt-4 flex gap-1 sm:mt-5" aria-hidden>
              {steps.slice(1, -1).map((s, i) => (
                <span key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <span className={clsx('block h-full rounded-full bg-gradient-to-r from-[#D8264A] to-[#FF7A5C] transition-[width] duration-500', i + 1 <= index ? 'w-full' : 'w-0')} />
                </span>
              ))}
            </div>
          )}

          <div className={clsx('flex items-center gap-2', first || last ? 'mt-6' : 'mt-4')}>
            {first ? (
              <button type="button" data-testid="tour-skip" onClick={() => finish('skip')} className="h-10 rounded-xl px-3 text-body font-medium text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink-0">
                {t('tour.skip')}
              </button>
            ) : !last ? (
              <button
                type="button"
                data-testid="tour-back"
                onClick={back}
                aria-label={t('tour.back')}
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.12] text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink-0"
              >
                <ArrowLeft size={16} aria-hidden />
              </button>
            ) : null}
            <button
              ref={primaryRef}
              type="button"
              data-testid="tour-next"
              onClick={() => next(steps.length)}
              className="group ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] px-4 text-body font-semibold text-white shadow-[0_10px_26px_-10px_rgb(255_90_80/0.9)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
            >
              {t(first ? 'tour.start' : last ? 'tour.finish' : index === steps.length - 2 ? 'tour.lastNext' : 'tour.next')}
              <ArrowRight size={16} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
          {first && <p className="mt-3 text-center text-caption text-ink-4 max-sm:hidden">{t('tour.keys')}</p>}
        </div>
      </div>

      {last && <Confetti count={56} />}
    </div>,
    document.body,
  )
}

/** The small diamond that points from the card to the lit part. */
function Arrow({ side, at }: { side: Placement; at: number }) {
  const base = 'absolute h-3.5 w-3.5 rotate-45 border-white/[0.14] bg-[rgb(24_27_56)]'
  const style: CSSProperties =
    side === 'top'
      ? { bottom: -7, left: at - 7 }
      : side === 'bottom'
        ? { top: -7, left: at - 7 }
        : side === 'left'
          ? { right: -7, top: at - 7 }
          : { left: -7, top: at - 7 }
  const border = side === 'top' ? 'border-b border-r' : side === 'bottom' ? 'border-l border-t' : side === 'left' ? 'border-r border-t' : 'border-b border-l'
  return <span aria-hidden className={clsx(base, border)} style={style} />
}
