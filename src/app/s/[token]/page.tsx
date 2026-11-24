import type { Metadata } from 'next'
import { SharedView } from './SharedView'

export const metadata: Metadata = { title: 'Shared video', robots: { index: false, follow: false } }

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SharedView token={token} />
}
