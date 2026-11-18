'use client'

import { useEffect } from 'react'
import { useAuth } from '@/auth/authStore'
import { hasSeenTour, markTourDone, syncTour } from './persistence'
import { useTour } from './tourStore'

/** Lets the chat screen settle (its rise animation) before the tour dims it. */
const START_DELAY_MS = 700

/**
 * Starts the tour once, the first time a signed-in, onboarded account opens the chat. Finishing or skipping it saves that in
 * this browser and on the account, so it does not come back. It can always be replayed from the account menu.
 */
export function useAutoStartTour() {
  const authed = useAuth((s) => s.status === 'authenticated')
  const userId = useAuth((s) => s.user?.id ?? null)
  const serverDone = useAuth((s) => s.user?.tourCompletedAt ?? null)
  const needsOnboarding = useAuth((s) => s.user?.needsOnboarding === true)

  useEffect(() => {
    useTour.getState().setOnEnd(() => {
      const user = useAuth.getState().user
      if (user) void markTourDone(user)
    })
    return () => {
      useTour.getState().setOnEnd(null)
      useTour.getState().finish('skip')
    }
  }, [])

  useEffect(() => {
    if (!authed || !userId || needsOnboarding) return
    const user = { id: userId, tourCompletedAt: serverDone }
    void syncTour(user)
    if (hasSeenTour(user)) return
    const timer = setTimeout(() => {
      if (!useTour.getState().active) useTour.getState().start()
    }, START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [authed, userId, serverDone, needsOnboarding])
}
