import type { Metadata } from 'next'
import { ClipStudio } from '@/chat/ClipStudio'

export const metadata: Metadata = { title: 'Clip studio', robots: { index: false } }

/** One clip of a stream: captions, music and sound effects (see ClipStudio). */
export default async function ClipStudioPage({ params }: { params: Promise<{ jobId: string; clipId: string }> }) {
  const { jobId, clipId } = await params
  return <ClipStudio jobId={decodeURIComponent(jobId)} clipId={decodeURIComponent(clipId)} />
}
