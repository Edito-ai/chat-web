'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/auth/useSession'
import { ChatScreen } from '@/chat/ChatScreen'
import { Restoring } from '@/components/Restoring'

/** /chat: shows the chat once a session exists, otherwise sends the visitor to /login. */
export function ChatGate() {
  const status = useSession()
  const router = useRouter()
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])
  return status === 'authenticated' ? <ChatScreen /> : <Restoring />
}
