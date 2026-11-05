'use client'

import { useState } from 'react'
import { Download, MinusCircle } from 'lucide-react'
import { useT } from '@/i18n'
import { formatElapsed, splitReply } from './activity'
import type { ChatAssistantMessage } from './chatTypes'

/** The finished video: player, the assistant's sentence, what the draft leaves out (chips), Download. */
export function ResultCard({ msg }: { msg: ChatAssistantMessage & { result: NonNullable<ChatAssistantMessage['result']> } }) {
  const { t } = useT()
  const { result } = msg
  const { text, notIncluded } = splitReply(msg.reply)
  const [duration, setDuration] = useState<number | null>(null)
  return (
    <div className="w-full max-w-xl animate-rise overflow-hidden rounded-2xl border border-line-strong bg-surface-1 shadow-lift">
      <video
        data-testid="chat-video"
        aria-label={t('chat.result.aria')}
        src={result.videoUrl}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          setDuration(Number.isFinite(d) && d > 0 ? d : null)
        }}
        className="max-h-[62vh] w-full bg-black"
      />
      <div className="space-y-3 p-4">
        <p className="text-prose text-ink-0">{text || t('chat.result.ready')}</p>

        {(duration !== null || result.fileName) && (
          <ul className="flex flex-wrap items-center gap-1.5">
            {result.fileName && (
              <li className="max-w-full truncate rounded-md bg-white/[0.05] px-2 py-1 font-mono text-caption text-ink-2">
                {result.fileName}
              </li>
            )}
            {duration !== null && (
              <li className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-caption tabular-nums text-ink-2">
                {t('chat.result.duration', { time: formatElapsed(duration * 1000) })}
              </li>
            )}
          </ul>
        )}

        {notIncluded.length > 0 && (
          <div data-testid="chat-not-included" className="space-y-1.5">
            <p className="text-label text-ink-3">{t('chat.result.notIncluded')}</p>
            <ul className="flex flex-wrap gap-1.5">
              {notIncluded.map((item) => (
                <li
                  key={item}
                  className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning-soft px-2.5 py-1 text-label text-warning"
                >
                  <MinusCircle size={11} aria-hidden /> {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <a
            data-testid="chat-download"
            href={result.downloadUrl ?? result.videoUrl}
            download={result.fileName ?? 'edited.mp4'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] px-4 text-body font-semibold text-white shadow-[0_8px_22px_-10px_rgb(255_90_80/0.8)] transition-all hover:-translate-y-px hover:brightness-110 active:translate-y-0 active:scale-[0.98]"
          >
            <Download size={15} strokeWidth={2} aria-hidden /> {t('chat.download')}
          </a>
        </div>
      </div>
    </div>
  )
}
