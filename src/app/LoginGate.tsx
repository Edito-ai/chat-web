'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/auth/useSession'
import { AuthScreen } from '@/auth/AuthScreen'
import { useAuth } from '@/auth/authStore'
import { Onboarding } from '@/auth/Onboarding'
import { Restoring } from '@/components/Restoring'

/**
 * /login: Google or an emailed code, then (for a new person) the onboarding screen that creates the account. A session goes
 * straight back to the chat at /, once the party popup of a just-finished onboarding was closed.
 */
export function LoginGate({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const status = useSession()
  const router = useRouter()
  const pending = useAuth((s) => s.pendingSignup)
  const celebrating = useAuth((s) => s.celebration !== null)
  useEffect(() => {
    if (status === 'authenticated' && !celebrating) router.replace('/')
  }, [status, celebrating, router])
  if (pending && status !== 'authenticated') return <Onboarding />
  if (celebrating && status === 'authenticated') return <Onboarding />
  return status === 'unauthenticated' ? <AuthScreen initialMode={initialMode} /> : <Restoring />
}
