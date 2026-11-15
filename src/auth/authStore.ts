import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { API_BASE } from '@/lib/env'
import { apiClient, fetchOrExplain } from '@/lib/apiClient'
import { friendlyError, isServerTrouble } from '@/lib/friendlyError'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  emailVerifiedAt?: string | null
  /** From /auth/me; only decides whether the Admin entry shows, the backend re-checks every admin route. */
  isAdmin?: boolean
  /** The phone number, masked by the server (`••••••1234`). Null/absent = never given. */
  phone?: string | null
  /** True until the onboarding screen was completed with a phone number (also for accounts older than the screen). */
  needsOnboarding?: boolean
}

/** An address whose code (or Google account) was confirmed but that has no account yet: onboarding creates it. */
export interface PendingSignup {
  signupToken: string
  email: string
  name: string | null
  via: 'email' | 'google'
}

/** What happened to the starter credit when onboarding was submitted. */
export interface OnboardingCredit {
  status: 'granted' | 'already_claimed' | 'phone_in_use' | 'off'
  usd: number
  tokens: number
}

/** The answers of the onboarding screen, as the backend takes them (`POST /auth/signup/complete`, `PATCH /auth/onboarding`). */
export interface OnboardingPayload {
  name: string
  phone: string
  contentTypes?: string[]
  professionTypes?: string[]
  referralSources?: string[]
  socialPlatforms?: string[]
  socialHandle?: string
  followersCount?: number
}

/** `signedIn`: a session started. `signup`: nobody has this address yet, the onboarding screen comes next. */
export type SignInResult = 'signedIn' | 'signup'

type Status = 'restoring' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: Status
  user: AuthUser | null
  accessToken: string | null
  /** Kept in browser storage and sent in the body of /auth/refresh (no cookies are used). */
  refreshToken: string | null
  loading: boolean
  error: string | null
  /** A confirmed address with no account yet (set by the code step or Google); persisted so a reload does not lose it. */
  pendingSignup: PendingSignup | null
  /** Set when onboarding just finished: the success popup shows until `dismissCelebration`. */
  celebration: OnboardingCredit | null

  /** Sends the sign-in code (an address with no account gets one too: it signs up after onboarding). */
  requestLoginCode: (email: string) => Promise<void>
  loginWithCode: (email: string, code: string) => Promise<SignInResult>
  /** `idToken` is the credential from Google Identity Services. */
  loginWithGoogle: (idToken: string) => Promise<SignInResult>
  /** Creates the account from the onboarding answers (new address) and signs in. */
  completeSignup: (payload: OnboardingPayload, legalConsent?: { termsVersion: string; privacyVersion: string }) => Promise<void>
  /** Onboarding of an account that already exists (it was made before the screen existed). */
  submitOnboarding: (payload: OnboardingPayload) => Promise<void>
  dismissCelebration: () => void
  /** Leave the onboarding screen without finishing: back to the sign-in screen. */
  cancelSignup: () => void
  logout: () => void
  restoreSession: () => Promise<void>
  silentRefresh: () => Promise<boolean>
  clearError: () => void
}

/** An /auth/* failure with the server's status and structured details (login branches on `details.reason`). */
export class AuthApiError extends Error {
  constructor(
    message: string,
    public details?: unknown,
    public status?: number,
    public code?: string,
  ) {
    super(message)
    this.name = 'AuthApiError'
  }
}

/** FastAPI's 422 body is `{ error, details: [{ msg }] }`: prefer the per-field reason. */
function extractErrorMessage(data: any, fallback: string): string {
  const details: { msg?: string }[] | undefined = data?.details
  if (Array.isArray(details) && details.length > 0) {
    const messages = details.map((d) => d.msg?.replace(/^Value error,\s*/, '')).filter((m): m is string => !!m)
    if (messages.length > 0) return messages.join('; ')
  }
  return data?.error ?? fallback
}

async function authFetch(path: string, body: unknown, accessToken?: string | null): Promise<any> {
  const res = await fetchOrExplain(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body),
  })
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json().catch(() => undefined) : undefined
  if (!res.ok) throw new AuthApiError(extractErrorMessage(data, `Request failed (${res.status})`), data?.details, res.status, data?.code)
  return data
}

/** True only when the SERVER said the token is no good. A network blip or 5xx says nothing about it. */
function isDefinitiveRejection(e: unknown): boolean {
  return e instanceof AuthApiError && e.status !== undefined && [400, 401, 403, 404, 422].includes(e.status)
}

/** Seconds until a JWT access token expires (0 when it cannot be read, so such a token is never trusted for the quick path). */
export function secondsLeft(token: string | null): number {
  try {
    const payload = JSON.parse(atob((token ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp - Date.now() / 1000 : 0
  } catch {
    return 0
  }
}

// Refresh rotates the token and the server revokes the whole chain if a stale one is replayed, so concurrent
// callers (StrictMode's double effect, two parallel 401s) must share one in-flight request.
let restorePromise: Promise<void> | null = null
let refreshPromise: Promise<boolean> | null = null

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => {
      const doSilentRefresh = async (): Promise<boolean> => {
        const { refreshToken } = get()
        if (!refreshToken) {
          set({ status: 'unauthenticated', accessToken: null })
          return false
        }
        try {
          const data = await authFetch('/auth/refresh', { refreshToken })
          set({ accessToken: data.accessToken, refreshToken: data.refreshToken, status: 'authenticated' })
          return true
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Your session ended. Sign in again.'
          if (isDefinitiveRejection(e)) {
            set({ user: null, accessToken: null, refreshToken: null, status: 'unauthenticated', error: message })
          } else {
            // Server unreachable or erroring: the session may still be fine, so keep the stored refresh token.
            set({ user: null, accessToken: null, status: 'unauthenticated', error: message })
          }
          return false
        }
      }

      const loadMe = async (): Promise<{ ok: true; user: AuthUser } | { ok: false; unauthorized: boolean }> => {
        try {
          const res = await fetchOrExplain(`${API_BASE}/auth/me`, {
            credentials: 'omit',
            headers: { Authorization: `Bearer ${get().accessToken}` },
          })
          if (res.status === 401) return { ok: false, unauthorized: true }
          if (!res.ok) return { ok: false, unauthorized: false }
          return { ok: true, user: (await res.json()).user as AuthUser }
        } catch {
          return { ok: false, unauthorized: false }
        }
      }

      const doRestore = async (): Promise<void> => {
        // A session that login / the emailed code just started is already good. Going back to 'restoring' here hid the profile
        // (and everything else that waits for 'authenticated') until /auth/me answered, a second or more after signing in.
        if (get().status === 'authenticated' && get().user && get().accessToken) return
        if (!get().refreshToken) {
          set({ status: 'unauthenticated', accessToken: null, user: null })
          return
        }
        // A reload with the stored session: the person and a still-valid token are in browser storage, so show the signed-in
        // screen at once and check with the server in the background (a server that is down must not sign anyone out).
        if (get().user && get().accessToken && secondsLeft(get().accessToken) > 20) {
          set({ status: 'authenticated' })
          const quick = await loadMe()
          if (quick.ok) return void set({ user: quick.user, status: 'authenticated' })
          if (!quick.unauthorized) return
          if (!(await get().silentRefresh())) {
            const err = get().error
            return void set({ error: err && isServerTrouble(err) ? friendlyError(err).message : null })
          }
          const again = await loadMe()
          if (again.ok) return void set({ user: again.user, status: 'authenticated' })
          return void set(
            again.unauthorized
              ? { user: null, accessToken: null, refreshToken: null, status: 'unauthenticated' }
              : { user: null, accessToken: null, status: 'unauthenticated' },
          )
        }
        set({ status: 'restoring' })
        // Try the stored access token first: a refresh rotates the refresh token, and two tabs doing that at
        // once would trip the server's reuse detection.
        if (get().accessToken) {
          const me = await loadMe()
          if (me.ok) return void set({ user: me.user, status: 'authenticated' })
          if (!me.unauthorized) {
            return void set({ status: 'unauthenticated', error: friendlyError(new TypeError('network')).message })
          }
        }
        if (!(await get().silentRefresh())) {
          const err = get().error
          set({ error: err && isServerTrouble(err) ? friendlyError(err).message : null })
          return
        }
        const me = await loadMe()
        if (me.ok) return void set({ user: me.user, status: 'authenticated' })
        set(
          me.unauthorized
            ? { user: null, accessToken: null, refreshToken: null, status: 'unauthenticated' }
            : { user: null, accessToken: null, status: 'unauthenticated' },
        )
      }

      const startSession = (data: { user: AuthUser; accessToken: string; refreshToken: string }) =>
        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          status: 'authenticated',
          loading: false,
          pendingSignup: null,
        })

      /** The answer of the code / Google step: a session, or "nobody has this address yet". */
      const afterIdentity = (data: any): SignInResult => {
        if (data?.needsSignup === true && typeof data.signupToken === 'string') {
          set({
            loading: false,
            pendingSignup: { signupToken: data.signupToken, email: String(data.email ?? ''), name: data.name ?? null, via: data.via === 'google' ? 'google' : 'email' },
          })
          return 'signup'
        }
        startSession(data)
        return 'signedIn'
      }

      /** A rejected sign-up token (too old / tampered) ends the onboarding: back to the sign-in screen with the reason. */
      const signupFailed = (e: unknown, fallback: string) => {
        const expired = e instanceof AuthApiError && e.code === 'signup_expired'
        set({ loading: false, error: e instanceof Error ? e.message : fallback, ...(expired ? { pendingSignup: null } : {}) })
      }

      return {
        status: 'restoring',
        user: null,
        accessToken: null,
        refreshToken: null,
        loading: false,
        error: null,
        pendingSignup: null,
        celebration: null,

        requestLoginCode: async (email) => {
          set({ loading: true, error: null })
          try {
            await authFetch('/auth/otp/request', { email, allowSignup: true })
            set({ loading: false })
          } catch (e) {
            set({ loading: false, error: e instanceof Error ? e.message : 'Failed to send code' })
            throw e
          }
        },

        loginWithCode: async (email, code) => {
          set({ loading: true, error: null })
          try {
            return afterIdentity(await authFetch('/auth/otp/verify', { email, code, allowSignup: true }))
          } catch (e) {
            set({ loading: false, error: e instanceof Error ? e.message : 'Invalid or expired code' })
            throw e
          }
        },

        loginWithGoogle: async (idToken) => {
          set({ loading: true, error: null })
          try {
            return afterIdentity(await authFetch('/auth/google', { idToken }))
          } catch (e) {
            set({ loading: false, error: e instanceof Error ? e.message : 'Google sign-in failed' })
            throw e
          }
        },

        completeSignup: async (payload, legalConsent) => {
          const pending = get().pendingSignup
          if (!pending) throw new Error('Your sign-up expired. Start again.')
          set({ loading: true, error: null })
          try {
            const data = await authFetch('/auth/signup/complete', {
              signupToken: pending.signupToken, ...payload, ...(legalConsent ? { legalConsent } : {}),
            })
            startSession(data)
            set({ celebration: data.credit ?? { status: 'off', usd: 0, tokens: 0 } })
          } catch (e) {
            signupFailed(e, 'Could not create your account')
            throw e
          }
        },

        submitOnboarding: async (payload) => {
          set({ loading: true, error: null })
          try {
            const data = (await apiClient.patch('/auth/onboarding', payload)) as { user?: AuthUser; credit?: OnboardingCredit | null }
            set((s) => ({
              loading: false,
              user: data.user ? { ...(s.user ?? data.user), ...data.user } : s.user,
              celebration: data.credit ?? { status: 'off', usd: 0, tokens: 0 },
            }))
          } catch (e) {
            set({ loading: false, error: e instanceof Error ? e.message : 'Could not save your answers' })
            throw e
          }
        },

        dismissCelebration: () => set({ celebration: null }),

        cancelSignup: () => set({ pendingSignup: null, error: null, loading: false }),

        logout: () => {
          const { refreshToken, accessToken } = get()
          set({ user: null, accessToken: null, refreshToken: null, status: 'unauthenticated', error: null, pendingSignup: null, celebration: null })
          // Best effort: the session is already cleared locally either way.
          if (accessToken) authFetch('/auth/logout', refreshToken ? { refreshToken } : {}, accessToken).catch(() => {})
        },

        restoreSession: () => {
          restorePromise ??= doRestore().finally(() => {
            restorePromise = null
          })
          return restorePromise
        },

        silentRefresh: () => {
          refreshPromise ??= doSilentRefresh().finally(() => {
            refreshPromise = null
          })
          return refreshPromise
        },

        clearError: () => set({ error: null }),
      }
    },
    {
      name: 'edito.chat-web.auth.v1',
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken, pendingSignup: s.pendingSignup }),
    },
  ),
)
