'use client'

import { useEffect } from 'react'
import { useSession } from '@/auth/useSession'
import { useAuth } from '@/auth/authStore'
import { Onboarding } from '@/auth/Onboarding'
import { useAccess } from '@/auth/access'
import { AccessPending } from '@/auth/AccessPending'
import { Restoring } from '@/components/Restoring'
import { ChatScreen } from '@/chat/ChatScreen'

/**
 * `/`: the chat for everyone. A visitor can look around; adding a video or sending needs an account, and a new account
 * needs an admin's approval: until then it sees how to get access instead of the chat.
 */
export function HomeGate() {
  const status = useSession()
  const access = useAccess((s) => s.status)
  const checked = useAccess((s) => s.checked)
  const signedIn = status === 'authenticated'
  // An account that never did the onboarding (or has no phone yet) does it once, before anything else. Finishing it approves
  // the account, so the access check below is asked again the moment it is done.
  const needsOnboarding = useAuth((s) => s.user?.needsOnboarding === true)
  const celebrating = useAuth((s) => s.celebration !== null)
  useEffect(() => {
    if (signedIn) void useAccess.getState().check()
    else if (status === 'unauthenticated') useAccess.getState().reset()
  }, [signedIn, status, needsOnboarding])
  if (signedIn && (needsOnboarding || celebrating)) return <Onboarding />
  if (signedIn && !checked) return <Restoring />
  if (signedIn && access === 'pending') return <AccessPending />
  return <ChatScreen />
}
