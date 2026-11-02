import { notFound } from 'next/navigation'
import { PreviewClient } from './PreviewClient'

/** Dev-only fixtures for looking at logged-in views without an account. 404 in production builds. */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { s } = await searchParams
  return <PreviewClient scenario={s ?? 'history'} />
}
