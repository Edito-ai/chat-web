'use client'

import { useSession } from '@/auth/useSession'
import { ChatScreen } from '@/chat/ChatScreen'

/** `/`: the chat for everyone. A visitor can look around; adding a video or sending needs an account. */
export function HomeGate() {
  useSession()
  return <ChatScreen />
}
