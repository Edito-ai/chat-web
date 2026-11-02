'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/auth/useSession'
import { AuthScreen } from '@/auth/AuthScreen'
import { Restoring } from '@/components/Restoring'

/** /login: login / signup / emailed code. A session goes straight back to the chat at /. */
export function LoginGate({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const status = useSession()
  const router = useRouter()
  useEffect(() => {
    if (status === 'authenticated') router.replace('/')
  }, [status, router])
  return status === 'unauthenticated' ? <AuthScreen initialMode={initialMode} /> : <Restoring />
}
