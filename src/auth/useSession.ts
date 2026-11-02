'use client'

import { useEffect } from 'react'
import { useAuth } from './authStore'

/** Restores the stored session once after mount (never during server render) and returns the auth status. */
export function useSession() {
  const status = useAuth((s) => s.status)
  useEffect(() => {
    void useAuth.getState().restoreSession()
  }, [])
  return status
}
