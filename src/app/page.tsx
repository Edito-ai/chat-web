import type { Metadata } from 'next'
import { HomeGate } from './HomeGate'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'

export const metadata: Metadata = { title: { absolute: `${SITE_NAME}: edit a video by chatting` }, description: SITE_DESCRIPTION, alternates: { canonical: '/' } }

export default function HomePage() {
  return <HomeGate />
}
