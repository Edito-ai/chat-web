import { create } from 'zustand'
import type { HelpTab } from './accountStore'

/** What the Help dialog starts with when something else (the "stuck" nudge) opens it. */
export interface HelpPrefill {
  subject?: string
  message?: string
  /** Stored on the ticket next to the browser details (job id, stage ...), so support can find the run. */
  context?: Record<string, unknown>
}

interface HelpState {
  open: { tab: HelpTab; prefill?: HelpPrefill } | null
  show: (tab: HelpTab, prefill?: HelpPrefill) => void
  hide: () => void
}

/** The one Help dialog of the chat screen: the always-visible button and the stuck nudge both open it from here. */
export const useHelp = create<HelpState>()((set) => ({
  open: null,
  show: (tab, prefill) => set({ open: { tab, prefill } }),
  hide: () => set({ open: null }),
}))
