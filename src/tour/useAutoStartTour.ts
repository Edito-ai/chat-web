'use client'

import { useEffect } from 'react'
import { useAuth } from '@/auth/authStore'
import { hasSeenTour, markTourDone, syncTour } from './persistence'
import { useTour } from './tourStore'

/** Lets the chat screen settle (its rise animation) before the tour dims it. */
const START_DELAY_MS = 700
/** After onboarding the chat is fresh on screen: a short beat so the composer has landed. */
const QUEUED_DELAY_MS = 450

/**
 * Starts the tour once, the first time a signed-in, onboarded account opens the chat. Finishing or skipping it saves that in
 * this browser and on the account, so it does not come back. It can always be replayed from the account menu.
 */
export function useAutoStartTour() {
  const authed = useAuth((s) => s.status === 'authenticated')
  const userId = useAuth((s) => s.user?.id ?? null)
  const serverDone = useAuth((s) => s.user?.tourCompletedAt ?? null)
  const needsOnboarding = useAuth((s) => s.user?.needsOnboarding === true)
  const queued = useTour((s) => s.queued)

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

  // Signed out mid-tour: stop it (nothing is saved, there is no account to save it on).
  useEffect(() => {
    if (!authed && useTour.getState().active) useTour.getState().finish('skip')
  }, [authed])

  // Right after onboarding: straight into the tour, past the welcome card (the onboarding screen just said welcome).
  useEffect(() => {
    if (!queued || !authed || !userId || needsOnboarding) return
    const timer = setTimeout(() => {
      if (!useTour.getState().active) useTour.getState().start(1)
    }, QUEUED_DELAY_MS)
    return () => clearTimeout(timer)
  }, [queued, authed, userId, needsOnboarding])

  useEffect(() => {
    if (queued || !authed || !userId || needsOnboarding) return
    const user = { id: userId, tourCompletedAt: serverDone }
    void syncTour(user)
    if (hasSeenTour(user)) return
    const timer = setTimeout(() => {
      if (!useTour.getState().active) useTour.getState().start()
    }, START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [queued, authed, userId, serverDone, needsOnboarding])
}
