'use client'

import { useEffect } from 'react'
import { useSession } from '@/auth/useSession'
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
  useEffect(() => {
    if (signedIn) void useAccess.getState().check()
    else if (status === 'unauthenticated') useAccess.getState().reset()
  }, [signedIn, status])
  if (signedIn && !checked) return <Restoring />
  if (signedIn && access === 'pending') return <AccessPending />
  return <ChatScreen />
}
