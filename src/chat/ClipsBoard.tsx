'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, Minus, Plus, Scissors } from 'lucide-react'
import { Button } from '@/components/ui'
import { useT } from '@/i18n'
import { useChat } from './chatStore'
import { clock, getClipsApi, type ClipLine } from './clips'
import type { ChatAssistantMessage, ClipItem } from './chatTypes'

const MIN_LEN = 3
const AROUND = 30

/** The finished clipping chat: the assistant's sentence, then every clip (best first) with play, trim and download. */
export function ClipsBoard({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const clips = msg.clips ?? []
  const source = msg.source ?? null
  return (
    <div data-testid="chat-clips" className="w-full max-w-3xl space-y-3">
      <div className="space-y-1">
        {msg.reply && <p className="text-prose text-ink-0">{msg.reply}</p>}
        <p className="text-label text-ink-3">
          {clips.length === 1 ? t('chat.clips.foundOne') : t('chat.clips.found', { n: clips.length })}
          {source?.title ? ` · ${t('chat.clips.from', { title: source.title })}` : ''}
          {source?.durationSec ? ` · ${clock(source.durationSec)}` : ''}
        </p>
      </div>
      {clips.length === 0 ? (
        <p className="text-label text-ink-3">{t('chat.clips.empty')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {clips.map((c, i) => (
            <ClipCard key={c.id} jobId={msg.jobId} clip={c} rank={i + 1} sourceSec={source?.durationSec ?? null} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ClipCard({ jobId, clip, rank, sourceSec }: { jobId: string; clip: ClipItem; rank: number; sourceSec: number | null }) {
  const { t } = useT()
  const [trimming, setTrimming] = useState(false)
  const cutting = clip.state === 'cutting'
  return (
    <li
      data-testid={`chat-clip-${clip.id}`}
      className="overflow-hidden rounded-2xl border border-line-strong bg-surface-1 shadow-lift animate-rise"
    >
      <div className="relative bg-black">
        {clip.videoUrl ? (
          <video
            key={clip.videoUrl}
            data-testid={`chat-clip-video-${clip.id}`}
            aria-label={t('chat.clips.play', { title: clip.title })}
            src={clip.videoUrl}
            poster={clip.thumbUrl ?? undefined}
            controls
            playsInline
            preload="none"
            className={clsx('aspect-video w-full object-contain', cutting && 'opacity-40')}
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center px-4 text-center text-label text-ink-3">
            {clip.state === 'failed' ? t('chat.clips.failed') : t('chat.clips.cutting')}
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 font-mono text-caption text-white">#{rank}</span>
        {clip.score !== null && (
          <span
            className={clsx(
              'absolute right-2 top-2 rounded-full px-2 py-0.5 font-mono text-caption tabular-nums',
              clip.score >= 70 ? 'bg-accent text-white' : 'bg-black/70 text-white',
            )}
          >
            {t('chat.clips.score', { n: clip.score })}
          </span>
        )}
        {cutting && (
          <span className="absolute inset-0 grid place-items-center text-label text-white">
            <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1">
              <Loader2 size={14} className="animate-spin" aria-hidden /> {t('chat.clips.cutting')}
            </span>
          </span>
        )}
      </div>

      <div className="space-y-2 p-3">
        <p className="line-clamp-2 font-display text-body font-semibold text-ink-0">{clip.title}</p>
        {clip.reason && <p className="line-clamp-2 text-label text-ink-3">{clip.reason}</p>}
        <p className="font-mono text-caption tabular-nums text-ink-3">
          {t('chat.clips.at', { t: clock(clip.start) })} · {clip.durationSec.toFixed(0)} s
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {clip.downloadUrl && !cutting && (
            <a
              href={clip.downloadUrl}
              download={clip.downloadFilename}
              data-testid={`chat-clip-download-${clip.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] px-3 text-label font-semibold text-white transition-all hover:brightness-110"
            >
              <Download size={14} aria-hidden /> {t('chat.clips.download')}
            </a>
          )}
          {clip.state !== 'failed' && (
            <Button
              variant="secondary"
              icon={Scissors}
              disabled={cutting}
              aria-expanded={trimming}
              data-testid={`chat-clip-trim-${clip.id}`}
              onClick={() => setTrimming((v) => !v)}
            >
              {t('chat.clips.trim')}
            </Button>
          )}
        </div>
        {trimming && !cutting && (
          <ClipTrim jobId={jobId} clip={clip} sourceSec={sourceSec} onDone={() => setTrimming(false)} />
        )}
      </div>
    </li>
  )
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** New start / end (and title) for one clip: two sliders, ±1 s steps, and the lines said around it to snap to. */
export function ClipTrim({ jobId, clip, sourceSec, onDone }: { jobId: string; clip: ClipItem; sourceSec: number | null; onDone: () => void }) {
  const { t } = useT()
  const lo = Math.max(0, Math.floor(clip.start - AROUND))
  const hi = sourceSec ? Math.min(sourceSec, Math.ceil(clip.end + AROUND)) : Math.ceil(clip.end + AROUND)
  const [start, setStart] = useState(clip.start)
  const [end, setEnd] = useState(clip.end)
  const [title, setTitle] = useState(clip.title)
  const [lines, setLines] = useState<ClipLine[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const firstInside = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    getClipsApi()
      .lines(jobId, clip.id, ctl.signal)
      .then((r) => !ctl.signal.aborted && setLines(r.lines))
      .catch(() => !ctl.signal.aborted && setLines([])) // the lines only help: the sliders work without them
    return () => ctl.abort()
  }, [jobId, clip.id])

  // The list starts 30 s before the clip: show the clip's own first line, not the lead-in, when it arrives.
  useEffect(() => {
    const el = firstInside.current
    const box = el?.parentElement
    if (el && box) box.scrollTop = Math.max(0, el.offsetTop - box.offsetTop - 8)
  }, [lines])

  const put = (which: 'start' | 'end', v: number) => {
    setProblem(null)
    const x = round1(Math.min(hi, Math.max(lo, v)))
    if (which === 'start') setStart(Math.min(x, end - MIN_LEN))
    else setEnd(Math.max(x, start + MIN_LEN))
  }

  const changed = Math.abs(start - clip.start) > 0.05 || Math.abs(end - clip.end) > 0.05
  const renamed = title.trim() !== '' && title.trim() !== clip.title

  const apply = async () => {
    if (end - start < MIN_LEN) return setProblem(t('chat.clips.tooShort'))
    if (!changed && !renamed) return onDone()
    setSaving(true)
    const why = await useChat
      .getState()
      .trimClip(jobId, clip.id, { ...(changed ? { start, end } : {}), ...(renamed ? { title: title.trim() } : {}) })
    setSaving(false)
    if (why) setProblem(why)
    else onDone()
  }

  const row = (which: 'start' | 'end', value: number) => {
    const label = t(which === 'start' ? 'chat.clips.start' : 'chat.clips.end')
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`clip-${clip.id}-${which}`} className="text-label text-ink-3">
            {label}
          </label>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('chat.clips.earlier', { what: label })}
              onClick={() => put(which, value - 1)}
              className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06] text-ink-1 hover:bg-white/[0.12]"
            >
              <Minus size={12} aria-hidden />
            </button>
            <span className="w-16 text-center font-mono text-caption tabular-nums text-ink-1">{clock(value)}.{Math.floor((value % 1) * 10)}</span>
            <button
              type="button"
              aria-label={t('chat.clips.later', { what: label })}
              onClick={() => put(which, value + 1)}
              className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06] text-ink-1 hover:bg-white/[0.12]"
            >
              <Plus size={12} aria-hidden />
            </button>
          </span>
        </div>
        <input
          id={`clip-${clip.id}-${which}`}
          data-testid={`chat-clip-${which}-${clip.id}`}
          type="range"
          min={lo}
          max={hi}
          step={0.1}
          value={value}
          onChange={(e) => put(which, Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer accent-[#FF7A5C]"
        />
      </div>
    )
  }

  return (
    <div data-testid={`chat-clip-trimmer-${clip.id}`} className="space-y-3 rounded-xl border border-line bg-white/[0.03] p-3">
      {row('start', start)}
      {row('end', end)}
      <p className="font-mono text-caption tabular-nums text-ink-3">{(end - start).toFixed(1)} s</p>

      <div className="space-y-1">
        <label htmlFor={`clip-${clip.id}-title`} className="text-label text-ink-3">
          {t('chat.clips.title')}
        </label>
        <input
          id={`clip-${clip.id}-title`}
          data-testid={`chat-clip-title-${clip.id}`}
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-body text-ink-0 focus:border-accent-line"
        />
      </div>

      <div className="space-y-1">
        <p className="text-label text-ink-3">{t('chat.clips.lines')}</p>
        {lines === null ? (
          <p className="text-caption text-ink-4">{t('chat.clips.loadingLines')}</p>
        ) : (
          <ul className="scroll-thin max-h-48 space-y-1 overflow-y-auto pr-1">
            {lines.map((l, i) => {
              const inside = l.e > start && l.s < end
              const first = l.e > clip.start && !lines.slice(0, i).some((p) => p.e > clip.start)
              return (
                <li key={`${l.s}-${i}`} ref={first ? firstInside : undefined} className={clsx('rounded-lg px-2 py-1 text-caption', inside ? 'bg-white/[0.06] text-ink-1' : 'text-ink-3')}>
                  <span className="font-mono tabular-nums text-ink-4">{clock(l.s)} </span>
                  {l.text}
                  <span className="ml-1 inline-flex gap-1 align-middle">
                    <button type="button" onClick={() => put('start', l.s - 0.25)} className="rounded px-1 text-accent hover:underline">
                      {t('chat.clips.setStart')}
                    </button>
                    <button type="button" onClick={() => put('end', l.e + 0.45)} className="rounded px-1 text-accent hover:underline">
                      {t('chat.clips.setEnd')}
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {problem && (
        <p role="alert" className="text-label text-danger">
          {problem}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button variant="primary" disabled={saving} data-testid={`chat-clip-apply-${clip.id}`} onClick={() => void apply()}>
          {saving ? t('chat.clips.cutting') : t('chat.clips.apply')}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onDone}>
          {t('chat.clips.cancel')}
        </Button>
      </div>
    </div>
  )
}
