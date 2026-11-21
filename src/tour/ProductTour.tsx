'use client'

import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useT } from '@/i18n'
import { Confetti } from '@/auth/Confetti'
import { ComposerDemo, SendDemo } from './ComposerDemo'
import { place, type Box, type Placement } from './place'
import { TOUR_STEPS, targetOf, type TourStep } from './steps'
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
 * a glass card next to it (a sheet at the top or bottom on phones). It opens the drawer and the account menu
 * itself when a step needs them. The lit part stays live (it can be clicked and typed in) while the tour goes on; an app
 * dialog opened from it pauses the tour. Keys (outside text fields): → / Enter next, ← back, Esc skip.
 */
export function ProductTour() {
  const { t } = useT()
  const active = useTour((s) => s.active)
  const index = useTour((s) => s.index)
  const mobile = useMedia('(max-width: 767px)')
  const small = useMedia('(max-width: 639px)')
  const [mounted, setMounted] = useState(false)
  const [rect, setRect] = useState<Box | null>(null)
  /** The target itself (unpadded): where a step's demo is drawn. */
  const [anchor, setAnchor] = useState<Box | null>(null)
  const [radius, setRadius] = useState(16)
  const [ready, setReady] = useState(false)
  const [card, setCard] = useState({ width: CARD_W, height: 260 })
  const [vp, setVp] = useState({ width: 1280, height: 800 })
  /** The person touched the real composer: the demo steps aside so they can use the real box. */
  const [demoOff, setDemoOff] = useState(false)
  /** An app dialog (usage, billing, help ...) opened from the lit part is on top: the tour waits behind it. */
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  pausedRef.current = paused
  /** Bumped on a click outside the lit part: the card gives a small nudge ("the tour is still here"). */
  const [nudge, setNudge] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const steps = TOUR_STEPS
  const step = steps[Math.min(index, steps.length - 1)]
  const first = index === 0
  const last = index === steps.length - 1
  const selector = active ? targetOf(step, mobile) : null
  const hasDemo = step.demo !== undefined && !demoOff
  const hasDemoRef = useRef(hasDemo)
  hasDemoRef.current = hasDemo

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
    let lostSince: number | null = null
    let raf = 0
    const tick = () => {
      const el = visible(selector)
      const pops = openPopups()
      if (!el && found && !pausedRef.current) {
        if (pops.length > 0) {
          // The person went somewhere inside a menu (a menu line opened its own page): light that menu so it stays usable.
          lostSince = null
          const next = litBox(unionOf(pops))
          setRect((prev) => (sameBox(prev, next) ? prev : next))
        } else {
          // The person closed what the tour opened (picked a menu line, closed the drawer): open it again, the tour goes on.
          const now = performance.now()
          if (lostSince === null) lostSince = now
          else if (now - lostSince > 700) {
            lostSince = now
            reopen(step, mobile)
          }
        }
      }
      if (el) {
        lostSince = null
        if (!found) {
          el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
          const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12
          setRadius(Math.min(r + PAD, 40))
          found = true
          setReady(true)
        }
        // A step with a demo plays it over its target: the lit window follows the demo (it grows as chips appear).
        const own = el.getBoundingClientRect()
        const a = { top: own.top, left: own.left, width: own.width, height: own.height }
        setAnchor((prev) => (sameBox(prev, a) ? prev : a))
        const demo = hasDemoRef.current ? document.querySelector<HTMLElement>('[data-tour-demo] > div') : null
        // Padded, but kept 4px inside the window so the glowing edge is never cut off (the sidebar touches the left edge).
        const base = demo ? demo.getBoundingClientRect() : own
        // A menu the person opened from the lit part (the paperclip menu from the composer, a chat's ... menu) joins the lit
        // window, so its lines take real clicks instead of landing on the dimmed backdrop.
        // A menu the target sits in (a line of the paperclip menu) is not added: only that one line is lit.
        const next = litBox(unionOf([base, ...pops.filter((pop) => !holds(pop, own))]))
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
  }, [active, index, selector, steps.length, step, mobile])

  // A new step starts with its demo playing.
  useEffect(() => setDemoOff(false), [index])

  // The demo keeps playing until the person clicks or types in the box. It never takes clicks itself (pointer-events: none),
  // so that first click already lands on the REAL composer: paperclip, text box, send. The tour stays on the step.
  // (Not on hover: the pointer is often resting over the box when the step starts, which would hide the demo at once.)
  useEffect(() => {
    if (!active || !hasDemo || !selector) return
    const inside = (x: number, y: number) => {
      const boxes = [visible(selector), document.querySelector<HTMLElement>('[data-tour-demo] > div')]
      return boxes.some((el) => {
        const r = el?.getBoundingClientRect()
        return r && x >= r.left - PAD && x <= r.right + PAD && y >= r.top - PAD && y <= r.bottom + PAD
      })
    }
    const onPointer = (e: PointerEvent) => {
      if (inside(e.clientX, e.clientY)) setDemoOff(true)
    }
    const onFocus = (e: FocusEvent) => {
      const el = visible(selector)
      if (el && e.target instanceof Node && el.contains(e.target)) setDemoOff(true)
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('focusin', onFocus, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('focusin', onFocus, true)
    }
  }, [active, hasDemo, selector])

  // An app dialog on top (opened from the lit part): hide the tour until it closes, then put the step back as it was.
  useEffect(() => {
    if (!active) return
    const check = () => setPaused(document.querySelector('[data-dialog-body]') !== null)
    check()
    const mo = new MutationObserver(check)
    mo.observe(document.body, { childList: true })
    return () => mo.disconnect()
  }, [active])
  const wasPaused = useRef(false)
  useEffect(() => {
    if (wasPaused.current && !paused && active) reopen(step, mobile)
    wasPaused.current = paused
  }, [paused, active, step, mobile])

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

  // The card's main button takes focus when a step is in place (a menu that just opened focuses its own first item), but
  // never away from a field the person is typing in: the lit part is real and theirs to use.
  useEffect(() => {
    if (active && ready && !paused) {
      const id = requestAnimationFrame(() => {
        if (!isTyping(document.activeElement)) primaryRef.current?.focus({ preventScroll: true })
      })
      return () => cancelAnimationFrame(id)
    }
  }, [active, ready, index, paused])

  // Keys win over the app while the tour runs (capture phase), so Enter never presses a menu item behind the card.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      // The lit part is live: typing in it (the composer, a field) keeps its keys. A dialog on top keeps them too.
      if (pausedRef.current || isTyping(e.target) || inApp(e.target)) return
      // An app menu is open: Esc is for closing it, not the tour.
      if (e.key === 'Escape' && openPopups().length > 0) return
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
    // Decided from the target itself, not the lit window: a demo grows upward, and the sheet must not jump while it plays.
    const base = anchor ?? rect
    const roomAbove = base.top
    const roomBelow = vp.height - (base.top + base.height)
    const below = hasDemo ? roomBelow >= 200 || roomBelow >= roomAbove : roomBelow >= roomAbove
    cardStyle = below ? { bottom: 'max(12px, env(safe-area-inset-bottom))', left: 12, right: 12 } : { top: 'max(12px, env(safe-area-inset-top))', left: 12, right: 12 }
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
    <div data-tour-root className={clsx('pointer-events-none fixed inset-0 z-[90] transition-opacity duration-200', paused && 'invisible opacity-0')} data-testid="tour" data-paused={paused || undefined}>
      {/* Clicks outside the lit part are caught (the card nudges); the lit part itself stays live and clickable. */}
      {blockers(rect, vp).map((b, i) => (
        <div
          key={i}
          aria-hidden
          data-testid="tour-blocker"
          className="pointer-events-auto absolute"
          style={b}
          onMouseDown={(e) => {
            e.preventDefault()
            setNudge((n) => n + 1)
            cardRef.current?.animate?.(
              [{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }],
              { duration: 380, easing: 'ease-out' },
            )
          }}
        />
      ))}

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
          'pointer-events-auto absolute z-10 overflow-visible rounded-[1.4rem] border border-white/[0.14] bg-[linear-gradient(160deg,rgb(30_34_70/0.94),rgb(14_16_34/0.96))] text-ink-1 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.85),0_0_0_1px_rgb(255_158_140/0.06)_inset] backdrop-blur-2xl',
          'transition-[top,left,bottom,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          small && !centred ? '' : 'w-[min(23rem,calc(100vw-2rem))]',
          ready ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={cardStyle}
      >
        {side && arrow !== null && <Arrow side={side} at={arrow} />}
        {nudge > 0 && <span key={nudge} aria-hidden className="tour-nudge pointer-events-none absolute inset-0 rounded-[inherit]" />}

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
            <ul className={clsx("mt-3 space-y-1.5 sm:mt-3.5 sm:space-y-2", hasDemo && "max-sm:hidden")}>
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
            <p className="mt-3 flex items-center gap-2 text-caption text-ink-3">
              <span aria-hidden className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              {t(hasDemo ? 'tour.live.demo' : 'tour.live')}
            </p>
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

      {/* A step that points at one line: an arrow beside it, nudging toward it (like a hand-drawn arrow). */}
      {step.point && rect && ready && !small && rect.left > 72 && (
        <span
          aria-hidden
          data-testid="tour-pointer"
          className="tour-pointer pointer-events-none absolute flex items-center transition-[top,left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ left: rect.left - 64, top: rect.top + rect.height / 2 - 14 }}
        >
          <svg width="56" height="28" viewBox="0 0 56 28" fill="none">
            <defs>
              <linearGradient id="tour-pointer-g" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#FF7A5C" stopOpacity="0" />
                <stop offset="1" stopColor="#FF9E8C" />
              </linearGradient>
            </defs>
            <path d="M2 14 C 18 6, 32 22, 46 14" stroke="url(#tour-pointer-g)" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M40 7 L 50 14 L 40 21" stroke="#FF9E8C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}

      {hasDemo && anchor && ready && step.demo === 'composer' && <ComposerDemo anchor={anchor} radius={radius - PAD} />}
      {hasDemo && anchor && ready && step.demo === 'send' && <SendDemo anchor={anchor} radius={radius - PAD} />}

      {last && <Confetti count={56} />}
    </div>,
    document.body,
  )
}

type Edges = { left: number; top: number; right: number; bottom: number }

const unionOf = (boxes: Edges[]): Edges =>
  boxes.reduce((a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }))

/** `outer` contains `inner` (a menu that contains the lit line). */
const holds = (outer: Edges, inner: Edges) =>
  outer.left <= inner.left + 1 && outer.top <= inner.top + 1 && outer.right >= inner.right - 1 && outer.bottom >= inner.bottom - 1

/** The lit window for a box: padded, but kept 4px inside the window so the glowing edge is never cut off. */
function litBox(r: Edges): Box {
  const left = Math.max(4, r.left - PAD)
  const top = Math.max(4, r.top - PAD)
  const right = Math.min(window.innerWidth - 4, r.right + PAD)
  const bottom = Math.min(window.innerHeight - 4, r.bottom + PAD)
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** App menus open right now (outside the tour): the account menu, a chat row's menu. */
function openPopups(): DOMRect[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]'))
    .filter((el) => !el.closest('[data-tour-root]') && el.getClientRects().length > 0)
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
}

/**
 * Focus is on something real in the app (a menu line, a button in the lit part): its keys are its own, so Enter presses it
 * and Esc closes its menu. The tour's keys work from the card, or when nothing in particular has focus.
 */
function inApp(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement) || t === document.body || t === document.documentElement) return false
  return !t.closest('[data-tour-root]')
}

/** Typing somewhere: the tour leaves that key alone. */
function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
}

/** Opens again what a step wants open (flips the parts closed for a frame, so the menus see a change and open). */
function reopen(step: TourStep, mobile: boolean) {
  const s = useTour.getState()
  if (!s.active) return
  s.setUi({})
  requestAnimationFrame(() => {
    if (useTour.getState().active) useTour.getState().setUi(step.ui?.(mobile) ?? {})
  })
}

/** Four click-catchers around the lit window (one over everything when nothing is lit). */
function blockers(rect: Box | null, vp: { width: number; height: number }): CSSProperties[] {
  if (!rect) return [{ inset: 0 }]
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  return [
    { left: 0, top: 0, width: vp.width, height: Math.max(0, rect.top) },
    { left: 0, top: bottom, width: vp.width, height: Math.max(0, vp.height - bottom) },
    { left: 0, top: rect.top, width: Math.max(0, rect.left), height: rect.height },
    { left: right, top: rect.top, width: Math.max(0, vp.width - right), height: rect.height },
  ]
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
