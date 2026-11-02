import { redirect } from 'next/navigation'

/** The chat lives at `/` now; keep old links working. */
export default function ChatPage() {
  redirect('/')
}
