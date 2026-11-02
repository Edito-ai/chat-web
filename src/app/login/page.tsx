import type { Metadata } from 'next'
import { LoginGate } from '../LoginGate'

export const metadata: Metadata = { title: 'Log in', robots: { index: false, follow: false } }

export default function LoginPage() {
  return <LoginGate />
}
