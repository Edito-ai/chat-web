import { apiClient } from '@/lib/apiClient'
import { useAuth, type AuthUser } from '@/auth/authStore'

/** Seen-the-tour is kept in two places: this browser (instant, works offline) and the account (`tourCompletedAt`). */
export const tourKey = (userId: string) => `edito.chat-web.tour.v1.${userId}`

export function seenLocally(userId: string): boolean {
  try {
    return localStorage.getItem(tourKey(userId)) === 'done'
  } catch {
    return false
  }
}

function rememberLocally(userId: string): void {
  try {
    localStorage.setItem(tourKey(userId), 'done')
  } catch {
    // storage blocked: the account flag still covers it
  }
}

export const hasSeenTour = (user: Pick<AuthUser, 'id' | 'tourCompletedAt'>): boolean => Boolean(user.tourCompletedAt) || seenLocally(user.id)

/** Tells the account. A failure is fine: `syncTour` tries again on the next visit (the browser flag already hides the tour). */
async function tellServer(): Promise<void> {
  try {
    const data = (await apiClient.patch('/auth/tour', { completed: true })) as { user?: Partial<AuthUser> }
    const tourCompletedAt = data.user?.tourCompletedAt ?? new Date().toISOString()
    useAuth.setState((s) => (s.user ? { user: { ...s.user, tourCompletedAt } } : {}))
  } catch {
    // offline, or a backend without the route yet
  }
}

/** The tour was finished or skipped: never start it on its own again. */
export function markTourDone(user: Pick<AuthUser, 'id' | 'tourCompletedAt'>): Promise<void> {
  rememberLocally(user.id)
  return user.tourCompletedAt ? Promise.resolve() : tellServer()
}

/** Brings the two flags together: the account's flag is copied to this browser, and a browser-only one is sent up. */
export function syncTour(user: Pick<AuthUser, 'id' | 'tourCompletedAt'>): Promise<void> {
  const local = seenLocally(user.id)
  if (user.tourCompletedAt && !local) rememberLocally(user.id)
  if (!user.tourCompletedAt && local) return tellServer()
  return Promise.resolve()
}
