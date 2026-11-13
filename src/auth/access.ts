import { create } from 'zustand'
import { ApiError, apiClient, setAccessPendingHandler } from '@/lib/apiClient'

/** Who to ask for access. The server sends its own copy (`/access`); this one is shown until it answers. */
export interface AccessContact {
  email: string
  phone: string
}
export const DEFAULT_CONTACT: AccessContact = { email: 'hello@trybroll.com', phone: '8595051170' }

/** `unknown` = not asked yet (or the server could not say: the server enforces access either way). */
export type AccessStatus = 'unknown' | 'approved' | 'pending'

interface AccessState {
  status: AccessStatus
  contact: AccessContact
  /** The first check of this sign-in has finished (whatever it said), so the screen can stop waiting for it. */
  checked: boolean
  check: () => Promise<void>
  markPending: (contact?: Partial<AccessContact>) => void
  reset: () => void
}

const INITIAL = { status: 'unknown' as AccessStatus, contact: DEFAULT_CONTACT, checked: false }

function contactOf(raw: unknown): AccessContact {
  const c = (raw ?? {}) as Partial<AccessContact>
  return {
    email: typeof c.email === 'string' && c.email ? c.email : DEFAULT_CONTACT.email,
    phone: typeof c.phone === 'string' && c.phone ? c.phone : DEFAULT_CONTACT.phone,
  }
}

/**
 * Whether the signed-in account has been approved by an admin yet (backend `GET /access`). A server that has no such route
 * (the first backend before this feature) means "no approval step": the person is let through.
 */
export const useAccess = create<AccessState>()((set) => ({
  ...INITIAL,
  check: async () => {
    try {
      const raw = (await apiClient.get('/access')) as { approved?: boolean; contact?: unknown }
      set(raw.approved === false ? { status: 'pending', contact: contactOf(raw.contact), checked: true } : { status: 'approved', checked: true })
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) set({ status: 'approved', checked: true })
      // pending (403) is handled by the handler below; anything else (network, 5xx) says nothing about the account
      else set({ checked: true })
    }
  },
  markPending: (contact) => set((s) => ({ status: 'pending', contact: contactOf({ ...s.contact, ...contact }), checked: true })),
  reset: () => set({ ...INITIAL }),
}))

// Any request the server refuses with `access_pending` (an approval revoked while the page was open) sends the person to the same screen.
setAccessPendingHandler((contact) => useAccess.getState().markPending(contact as Partial<AccessContact>))
