'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { useT } from '@/i18n'
import { Logo } from '@/components/ui'
import { fetchShared, type SharedVideo } from '@/chat/chatApi'

/** The public page behind a share link: the video, its Download, and a way into the app. No sign-in. */
export function SharedView({ token }: { token: string }) {
  const { t } = useT()
  const [video, setVideo] = useState<SharedVideo | null | undefined>(undefined)
  useEffect(() => {
    const stop = new AbortController()
    void fetchShared(token, stop.signal).then((v) => !stop.signal.aborted && setVideo(v))
    return () => stop.abort()
  }, [token])
  return (
    <main className="app-shell flex min-h-full w-full flex-col items-center gap-6 px-4 py-6 text-ink-1">
      <header className="flex w-full max-w-3xl items-center justify-between">
        <Logo />
        <Link href="/" className="text-label text-ink-3 hover:text-ink-0">
          {t('share.page.try')}
        </Link>
      </header>
      {video === undefined ? null : video === null ? (
        <p role="alert" data-testid="share-gone" className="mt-16 text-prose text-ink-2">
          {t('share.page.gone')}
        </p>
      ) : (
        <section className="flex w-full max-w-xl flex-col items-center gap-4">
          <h1 className="w-full truncate font-display text-heading text-ink-0">{video.title}</h1>
          <video data-testid="share-video" src={video.videoUrl} controls playsInline preload="metadata" className="max-h-[70vh] w-auto max-w-full rounded-xl bg-black" />
          <a
            href={video.downloadUrl}
            download={video.fileName ?? 'video.mp4'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-ink-0 px-4 text-label font-semibold text-surface-0 hover:opacity-90"
          >
            <Download size={14} aria-hidden /> {t('chat.download')}
          </a>
          <p className="text-caption text-ink-4">{t('share.page.made')}</p>
        </section>
      )}
    </main>
  )
}
