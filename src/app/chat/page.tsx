import type { Metadata } from 'next'
import { ChatGate } from '../ChatGate'

export const metadata: Metadata = { title: 'Chat', robots: { index: false, follow: false } }

export default function ChatPage() {
  return <ChatGate />
}
