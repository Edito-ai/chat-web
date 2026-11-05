import { create } from 'zustand'
import { accountApi } from './accountApi'
import { clearDismissed, readDismissed, writeDismissed, type CreditLoad } from './lib/freeCredit'
import type { Entitlement, FreeCreditStatus } from './types'

export type AccountDialog = 'usage' | 'billing' | 'help' | 'legal'

interface AccountState {
  entitlement: Entitlement | null
  /** `loading` only until the first answer; a later failed refresh keeps the plan we already know. */
  status: 'idle' | 'loading' | 'loaded' | 'error'
  dialog: AccountDialog | null
  /** Scroll/focus target inside the billing dialog (the "Pricing / Upgrade" entry). */
  billingFocus: 'plans' | null
  /** Starter-credit offer, fetched once after login; never blocks anything. */
  credit: FreeCreditStatus | null
  creditLoad: CreditLoad
  /** Closed for this session (sessionStorage); the Usage dialog's Claim button brings it back. */
  creditDismissed: boolean
  dismissCredit: () => void
  showCredit: () => void
  refresh: () => Promise<void>
  loadFreeCredit: () => Promise<void>
  /** Throws on failure so the form can show why; on success updates the offer and the plan. */
  claimFreeCredit: (phone: string) => Promise<FreeCreditStatus>
  openDialog: (d: AccountDialog, opts?: { focus?: 'plans' }) => void
  closeDialog: () => void
  reset: () => void
}

export const useAccount = create<AccountState>()((set, get) => ({
  entitlement: null,
  status: 'idle',
  dialog: null,
  billingFocus: null,
  credit: null,
  creditLoad: 'idle',
  creditDismissed: false,
  dismissCredit: () => {
    writeDismissed()
    set({ creditDismissed: true })
  },
  showCredit: () => {
    clearDismissed()
    set({ creditDismissed: false })
  },
  refresh: async () => {
    if (get().status !== 'loaded') set({ status: 'loading' })
    try {
      set({ entitlement: await accountApi().entitlement(), status: 'loaded' })
    } catch {
      set((s) => ({ status: s.status === 'loaded' ? 'loaded' : 'error' }))
    }
  },
  loadFreeCredit: async () => {
    if (get().creditLoad === 'loading') return
    set({ creditLoad: 'loading', creditDismissed: readDismissed() })
    try {
      set({ credit: await accountApi().freeCredit(), creditLoad: 'loaded' })
    } catch {
      set({ credit: null, creditLoad: 'error' })
    }
  },
  claimFreeCredit: async (phone) => {
    const credit = await accountApi().claimFreeCredit(phone)
    set({ credit, creditLoad: 'loaded' })
    void get().refresh()
    return credit
  },
  openDialog: (dialog, opts) => set({ dialog, billingFocus: opts?.focus ?? null }),
  closeDialog: () => set({ dialog: null, billingFocus: null }),
  reset: () => set({ entitlement: null, status: 'idle', dialog: null, billingFocus: null, credit: null, creditLoad: 'idle', creditDismissed: false }),
}))
