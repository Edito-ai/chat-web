import { create } from 'zustand'
import { accountApi } from './accountApi'
import { clearDismissed, readDismissed, writeDismissed, type CreditLoad } from './lib/freeCredit'
import { CheckoutDismissed } from './lib/razorpayCheckout'
import { userMessage } from '@/lib/friendlyError'
import type { CardVerifyStatus, Entitlement, FreeCreditStatus, TokenUsage } from './types'

export type AccountDialog = 'usage' | 'billing' | 'help' | 'legal'

/** The card / UPI verification claim: `done` carries the server's answer in `result`, `error` a sentence for the person. */
export interface CardClaim {
  phase: 'idle' | 'opening' | 'verifying' | 'done' | 'error'
  result: string | null
  error: string | null
}

const NO_CLAIM: CardClaim = { phase: 'idle', result: null, error: null }

interface AccountState {
  entitlement: Entitlement | null
  /** The token allowance (a plan's, or the starter credit); read with the plan so the profile menu can show the credit left. */
  tokenUsage: TokenUsage | null
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
  /** The card / UPI verification credit (India only). `eligible` comes from the server; null until loaded or when it failed. */
  cardVerify: CardVerifyStatus | null
  cardVerifyLoad: CreditLoad
  cardClaim: CardClaim
  loadCardVerify: (force?: boolean) => Promise<void>
  /** Order -> Razorpay modal -> confirm. Closing the modal is not an error; a failure leaves a sentence in `cardClaim.error`. */
  claimWithCard: (email?: string | null) => Promise<void>
  clearCardClaim: () => void
  openDialog: (d: AccountDialog, opts?: { focus?: 'plans' }) => void
  closeDialog: () => void
  reset: () => void
}

export const useAccount = create<AccountState>()((set, get) => ({
  entitlement: null,
  tokenUsage: null,
  status: 'idle',
  dialog: null,
  billingFocus: null,
  credit: null,
  creditLoad: 'idle',
  creditDismissed: false,
  cardVerify: null,
  cardVerifyLoad: 'idle',
  cardClaim: NO_CLAIM,
  loadCardVerify: async (force = false) => {
    const { cardVerifyLoad } = get()
    if (cardVerifyLoad === 'loading' || (cardVerifyLoad === 'loaded' && !force)) return
    set({ cardVerifyLoad: 'loading' })
    try {
      set({ cardVerify: await accountApi().cardVerifyStatus(), cardVerifyLoad: 'loaded' })
    } catch {
      set({ cardVerify: null, cardVerifyLoad: 'error' }) // never blocks anything: the button just stays hidden
    }
  },
  claimWithCard: async (email) => {
    const { phase } = get().cardClaim
    if (phase === 'opening' || phase === 'verifying') return
    set({ cardClaim: { phase: 'opening', result: null, error: null } })
    try {
      const order = await accountApi().cardVerifyOrder()
      const paid = await accountApi().openCardCheckout({ order, email })
      set({ cardClaim: { phase: 'verifying', result: null, error: null } })
      const out = await accountApi().cardVerifyConfirm(paid)
      set({ cardClaim: { phase: 'done', result: out.status, error: null } })
      void get().loadCardVerify(true)
      void get().refresh()
    } catch (e) {
      if (e instanceof CheckoutDismissed) {
        set({ cardClaim: NO_CLAIM })
        return
      }
      set({ cardClaim: { phase: 'error', result: null, error: userMessage(e, 'We could not verify your card. Please try again.') } })
    }
  },
  clearCardClaim: () => set({ cardClaim: NO_CLAIM }),
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
      accountApi().tokenUsage().then((tokenUsage) => set({ tokenUsage })).catch(() => undefined) // the badge works without it
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
  reset: () => set({ entitlement: null, tokenUsage: null, status: 'idle', dialog: null, billingFocus: null, credit: null, creditLoad: 'idle', creditDismissed: false, cardVerify: null, cardVerifyLoad: 'idle', cardClaim: NO_CLAIM }),
}))
