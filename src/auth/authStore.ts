import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { API_BASE } from '@/lib/env'
import { fetchOrExplain } from '@/lib/apiClient'
import { friendlyError, isServerTrouble } from '@/lib/friendlyError'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  emailVerifiedAt?: string | null
  /** From /auth/me; only decides whether the Admin entry shows, the backend re-checks every admin route. */
  isAdmin?: boolean
}

type Status = 'restoring' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: Status
  user: AuthUser | null
  accessToken: string | null
  /** Kept in browser storage and sent in the body of /auth/refresh (no cookies are used). */
  refreshToken: string | null
  loading: boolean
  error: string | null
  /** Set when a correct password hit an unverified account; the backend has already mailed a code. */
  verificationEmail: string | null

  signup: (
    email: string,
    password: string,
    name: string,
    legalConsent?: { termsVersion: string; privacyVersion: string },
  ) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  loginWithCode: (email: string, code: string) => Promise<void>
  requestLoginCode: (email: string) => Promise<void>
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
  if (!res.ok) throw new AuthApiError(extractErrorMessage(data, `Request failed (${res.status})`), data?.details, res.status)
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
          verificationEmail: null,
        })

      return {
        status: 'restoring',
        user: null,
        accessToken: null,
        refreshToken: null,
        loading: false,
        error: null,
        verificationEmail: null,

        signup: async (email, password, name, legalConsent) => {
          set({ loading: true, error: null })
          try {
            // No tokens come back: the account stays signed out until the emailed code is redeemed.
            await authFetch('/auth/signup', { email, password, name, ...(legalConsent ? { legalConsent } : {}) })
            set({ loading: false })
          } catch (e) {
            set({ loading: false, error: e instanceof Error ? e.message : 'Sign up failed' })
            throw e
          }
        },

        login: async (email, password) => {
          set({ loading: true, error: null, verificationEmail: null })
          try {
            startSession(await authFetch('/auth/login', { email, password }))
          } catch (e) {
            const reason = e instanceof AuthApiError ? (e.details as { reason?: string } | undefined)?.reason : undefined
            if (reason === 'email_not_verified') set({ loading: false, error: null, verificationEmail: email })
            else set({ loading: false, error: e instanceof Error ? e.message : 'Log in failed' })
            throw e
          }
        },

        requestLoginCode: async (email) => {
          set({ loading: true, error: null })
          try {
            await authFetch('/auth/otp/request', { email })
            set({ loading: false })
          } catch (e) {
            set({ loading: false, error: e instanceof Error ? e.message : 'Failed to send code' })
            throw e
          }
        },

        loginWithCode: async (email, code) => {
          set({ loading: true, error: null })
          try {
            startSession(await authFetch('/auth/otp/verify', { email, code }))
          } catch (e) {
            set({ loading: false, error: e instanceof Error ? e.message : 'Invalid or expired code' })
            throw e
          }
        },

        logout: () => {
          const { refreshToken, accessToken } = get()
          set({ user: null, accessToken: null, refreshToken: null, status: 'unauthenticated', error: null, verificationEmail: null })
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
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }),
    },
  ),
)
