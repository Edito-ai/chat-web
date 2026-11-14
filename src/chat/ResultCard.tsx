'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { Download, MinusCircle } from 'lucide-react'
import { useT } from '@/i18n'
import { formatElapsed, splitReply } from './activity'
import { boldRuns, replyBlocks } from './replyText'
import type { ChatAnalysis, ChatAssistantMessage } from './chatTypes'

/** One line of reply text, with **bold** runs. Only text is ever rendered: no markup from a reply is interpreted. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {boldRuns(text).map((r, i) => (r.bold ? <strong key={i} className="font-semibold">{r.text}</strong> : <span key={i}>{r.text}</span>))}
    </>
  )
}

/** The reply as plain chat text: paragraphs and "- " lists. */
export function ReplyText({ text }: { text: string }) {
  return (
    <div className="space-y-2.5">
      {replyBlocks(text).map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i} className="list-disc space-y-1 pl-5 text-prose text-ink-0 marker:text-ink-4">
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-wrap break-words text-prose text-ink-0">
            <Inline text={b.text} />
          </p>
        ),
      )}
    </div>
  )
}

/** The footage before the edit and the finished edit, as frame sheets, side by side by a toggle. No card around them. */
export function SeenFrames({ analysis }: { analysis: ChatAnalysis }) {
  const { t } = useT()
  const sheets = [
    { id: 'before', label: t('chat.saw.before'), url: analysis.beforeSheet },
    // the final look stops mattering once the real after-sheet is there
    { id: 'planned', label: t('chat.saw.planned'), url: analysis.afterSheet ? null : analysis.plannedSheet },
    { id: 'after', label: t('chat.saw.after'), url: analysis.afterSheet },
  ].filter((s): s is { id: string; label: string; url: string } => !!s.url)
  // the newest sheet shows by itself as it arrives, until the person picks one
  const [pick, setPick] = useState<string | null>(null)
  if (sheets.length === 0) return null
  const current = sheets.find((s) => s.id === pick) ?? sheets[sheets.length - 1]!
  return (
    <section data-testid="chat-frames" aria-label={t('chat.saw.title')} className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-label text-ink-3">{t('chat.saw.title')}</span>
        {sheets.length > 1 &&
          sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setPick(s.id)}
              aria-pressed={current.id === s.id}
              className={clsx('text-label transition-colors', current.id === s.id ? 'text-ink-0 underline underline-offset-4' : 'text-ink-3 hover:text-ink-1')}
            >
              {s.label}
            </button>
          ))}
      </div>
      <a href={current.url} target="_blank" rel="noopener noreferrer" title={t('chat.saw.open')} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- a server-made contact sheet, not a static asset */}
        <img src={current.url} alt={current.label} loading="lazy" className="w-full rounded-xl" />
      </a>
    </section>
  )
}

/** The finished video, flat in the chat: the player, then the assistant's words, what was left out, and Download. */
export function ResultCard({ msg }: { msg: ChatAssistantMessage & { result: NonNullable<ChatAssistantMessage['result']> } }) {
  const { t } = useT()
  const { result } = msg
  const { text, notIncluded } = splitReply(msg.reply)
  const [duration, setDuration] = useState<number | null>(null)
  return (
    <div className="w-full max-w-xl animate-rise space-y-4">
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
        className="max-h-[62vh] w-auto max-w-full rounded-xl bg-black"
      />

      <ReplyText text={text || t('chat.result.ready')} />

      {notIncluded.length > 0 && (
        <div data-testid="chat-not-included" className="space-y-1.5">
          <p className="text-label text-ink-3">{t('chat.result.notIncluded')}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {notIncluded.map((item) => (
              <li key={item} className="inline-flex items-center gap-1 text-label text-warning">
                <MinusCircle size={11} aria-hidden /> {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <a
          data-testid="chat-download"
          href={result.downloadUrl ?? result.videoUrl}
          download={result.fileName ?? 'edited.mp4'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-full bg-ink-0 px-4 text-label font-semibold text-surface-0 transition-opacity hover:opacity-90"
        >
          <Download size={14} strokeWidth={2} aria-hidden /> {t('chat.download')}
        </a>
        {(duration !== null || result.fileName) && (
          <span className="font-mono text-caption tabular-nums text-ink-4">
            {[result.fileName, duration !== null ? t('chat.result.duration', { time: formatElapsed(duration * 1000) }) : null].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {msg.analysis && <SeenFrames analysis={msg.analysis} />}
    </div>
  )
}
