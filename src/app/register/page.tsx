import type { Metadata } from 'next'
import { LoginGate } from '../LoginGate'

export const metadata: Metadata = { title: 'Register', robots: { index: false, follow: false } }

export default function RegisterPage() {
  return <LoginGate initialMode="signup" />
}
