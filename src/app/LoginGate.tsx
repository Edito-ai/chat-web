'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/auth/useSession'
import { AuthScreen } from '@/auth/AuthScreen'
import { Restoring } from '@/components/Restoring'

/** /login: login / signup / emailed code. An existing session goes straight on to /chat. */
export function LoginGate() {
  const status = useSession()
  const router = useRouter()
  useEffect(() => {
    if (status === 'authenticated') router.replace('/chat')
  }, [status, router])
  return status === 'unauthenticated' ? <AuthScreen /> : <Restoring />
}
