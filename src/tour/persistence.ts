import { apiClient } from '@/lib/apiClient'
import { useAuth, type AuthUser } from '@/auth/authStore'

/**
 * Seen-the-tour is kept in two places: the account (`tourCompletedAt`, the source of truth) and this browser. The browser flag
 * is only written when the tour was finished or skipped HERE, so it covers the moment before the account call lands (or when
 * that call failed). It is never copied from the account: clearing the account flag must bring the tour back.
 * v2: v1 also copied the account flag into the browser, which kept the tour away after the account flag was cleared.
 */
export const tourKey = (userId: string) => `edito.chat-web.tour.v2.${userId}`

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

/** A tour finished in this browser whose account call failed is sent up again. */
export function syncTour(user: Pick<AuthUser, 'id' | 'tourCompletedAt'>): Promise<void> {
  if (!user.tourCompletedAt && seenLocally(user.id)) return tellServer()
  return Promise.resolve()
}
