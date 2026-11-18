import { create } from 'zustand'

/** Parts of the screen the tour opens while it points at them. ChatScreen, AttachMenu and ProfileMenu follow these. */
export interface TourUi {
  /** Mobile: the sidebar drawer. */
  drawer: boolean
  /** Desktop: show the sidebar even when the person collapsed it (not saved). */
  sidebar: boolean
  attachMenu: boolean
  profileMenu: boolean
}

export const CLOSED_UI: TourUi = { drawer: false, sidebar: false, attachMenu: false, profileMenu: false }

export type TourEnd = 'done' | 'skip'

interface TourState {
  active: boolean
  index: number
  /** Which way the last move went, so a step whose target is missing is skipped in the same direction. */
  dir: 1 | -1
  ui: TourUi
  /** Called once when the tour ends (done or skipped): saves that it was seen. Set by the component that mounts it. */
  onEnd: ((reason: TourEnd) => void) | null
  /** Set by the onboarding screen's last button: the chat starts the tour as soon as it opens (see useAutoStartTour). */
  queued: boolean
  queue: () => void
  /** `from` 1 skips the welcome card (right after onboarding, which already said welcome). */
  start: (from?: number) => void
  next: (count: number) => void
  back: () => void
  finish: (reason: TourEnd) => void
  setUi: (ui: Partial<TourUi>) => void
  setOnEnd: (fn: ((reason: TourEnd) => void) | null) => void
}

export const useTour = create<TourState>((set, get) => ({
  active: false,
  index: 0,
  dir: 1,
  ui: CLOSED_UI,
  onEnd: null,
  queued: false,
  queue: () => set({ queued: true }),
  start: (from = 0) => set({ active: true, index: from, dir: 1, ui: CLOSED_UI, queued: false }),
  next: (count) => {
    const { index } = get()
    if (index >= count - 1) return get().finish('done')
    set({ index: index + 1, dir: 1 })
  },
  back: () => set((s) => ({ index: Math.max(0, s.index - 1), dir: -1 })),
  finish: (reason) => {
    if (!get().active) return
    set({ active: false, index: 0, dir: 1, ui: CLOSED_UI })
    get().onEnd?.(reason)
  },
  setUi: (ui) => set({ ui: { ...CLOSED_UI, ...ui } }),
  setOnEnd: (onEnd) => set({ onEnd }),
}))

/** True while the tour is running and wants `part` open. */
export const useTourWants = (part: keyof TourUi) => useTour((s) => s.active && s.ui[part])

/** Clicks inside the tour (its card and its backdrop) must not count as "outside" for menus the tour opened. */
export const isInsideTour = (target: EventTarget | null) => target instanceof Element && target.closest('[data-tour-root]') !== null
