import { create } from 'zustand'
import { accountApi } from './accountApi'
import type { Entitlement } from './types'

export type AccountDialog = 'usage' | 'billing' | 'help' | 'legal'

interface AccountState {
  entitlement: Entitlement | null
  /** `loading` only until the first answer; a later failed refresh keeps the plan we already know. */
  status: 'idle' | 'loading' | 'loaded' | 'error'
  dialog: AccountDialog | null
  /** Scroll/focus target inside the billing dialog (the "Pricing / Upgrade" entry). */
  billingFocus: 'plans' | null
  refresh: () => Promise<void>
  openDialog: (d: AccountDialog, opts?: { focus?: 'plans' }) => void
  closeDialog: () => void
  reset: () => void
}

export const useAccount = create<AccountState>()((set, get) => ({
  entitlement: null,
  status: 'idle',
  dialog: null,
  billingFocus: null,
  refresh: async () => {
    if (get().status !== 'loaded') set({ status: 'loading' })
    try {
      set({ entitlement: await accountApi().entitlement(), status: 'loaded' })
    } catch {
      set((s) => ({ status: s.status === 'loaded' ? 'loaded' : 'error' }))
    }
  },
  openDialog: (dialog, opts) => set({ dialog, billingFocus: opts?.focus ?? null }),
  closeDialog: () => set({ dialog: null, billingFocus: null }),
  reset: () => set({ entitlement: null, status: 'idle', dialog: null, billingFocus: null }),
}))
