'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Music, Pause, Play, Upload, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui'
import { useT } from '@/i18n'
import { uploadVideo } from './chatUploads'
import { useChat } from './chatStore'
import { getMusicApi, looksLikeAudio, probeAudio, type MusicChoice, type MusicState, type MusicTrack } from './music'

const pct = (v: number): number => Math.round(v * 100)

/**
 * The music card of a finished video: what plays now, three suggested tracks to listen to and pick, the person's own audio
 * file, a volume slider, and "no music". A change is a new turn of the chat (the sound is re-mixed, the picture is not
 * re-made), so it shows up as a message with the updated video. Hidden when the backend has no music card.
 */
export function MusicPanel({ jobId, turn }: { jobId: string; turn: number }) {
  const { t } = useT()
  const busy = useChat((s) => s.busy)
  const [state, setState] = useState<MusicState | null | undefined>(undefined)
  const [open, setOpen] = useState(true)
  const [volume, setVolume] = useState(0.1)
  const [playing, setPlaying] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Read the card for this video; again after every music change (a new turn).
  useEffect(() => {
    const ctl = new AbortController()
    getMusicApi()
      .get(jobId, ctl.signal)
      .then((st) => {
        if (ctl.signal.aborted) return
        setState(st)
        if (st) setVolume(st.current.volume)
      })
      .catch(() => {
        if (!ctl.signal.aborted) setState(null) // music is optional: a failed read hides the card instead of breaking the result
      })
    return () => ctl.abort()
  }, [jobId, turn])

  const stop = () => {
    audioRef.current?.pause()
    setPlaying(null)
  }
  useEffect(
    () => () => {
      audioRef.current?.pause()
      audioRef.current = null
    },
    [],
  )
  useEffect(() => {
    if (!open) {
      audioRef.current?.pause()
      setPlaying(null)
    }
  }, [open])

  if (!state) return null

  const disabled = busy || uploading || !state.canChange
  const dirty = state.current.enabled && Math.abs(volume - state.current.volume) > 0.004
  const maxMb = Math.round(state.limits.maxBytes / 1_000_000)

  const change = (choice: MusicChoice, label: string) => {
    stop()
    setProblem(null)
    void useChat.getState().changeMusic(choice, label)
  }

  const listen = (track: MusicTrack) => {
    if (playing === track.id) return stop()
    const a = audioRef.current ?? (audioRef.current = new Audio())
    a.src = track.previewUrl
    a.onended = () => setPlaying(null)
    a.onerror = () => setPlaying(null)
    setPlaying(track.id)
    void a.play().catch(() => setPlaying(null))
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setProblem(null)
    if (!looksLikeAudio(file)) return setProblem(t('chat.music.notAudio'))
    if (file.size > state.limits.maxBytes) return setProblem(t('chat.music.tooBig', { mb: maxMb }))
    setUploading(true)
    try {
      const duration = await probeAudio(file).catch(() => 0)
      const uploadId = await uploadVideo(useChat.getState().projectId ?? 'music', file, { duration, width: null, height: null, hasAudio: true })
      change({ source: 'upload', uploadId, ...(dirty ? { volume } : {}) }, t('chat.music.turn.upload', { name: file.name.replace(/\.[^.]+$/, '') }))
    } catch (e) {
      useChat.setState({ actionError: e })
    } finally {
      setUploading(false)
    }
  }

  const nowPlaying = state.current.enabled
    ? [state.current.title, state.current.artist].filter(Boolean).join(' · ')
    : null

  return (
    <div data-testid="chat-music" className="border-t border-line">
      <button
        type="button"
        data-testid="chat-music-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-label text-ink-1 transition-colors hover:bg-white/[0.04]"
      >
        <Music size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-ink-0">{t('chat.music.title')}</span>
          <span className="text-ink-3"> · {nowPlaying ?? t('chat.music.none')}</span>
        </span>
        <ChevronDown size={14} aria-hidden className={clsx('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-4 px-4 pb-4">
          {!state.canChange && <p className="text-label text-ink-3">{t('chat.music.wait')}</p>}

          {state.suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-label text-ink-3">{t('chat.music.suggested')}</p>
              <ul className="space-y-1.5">
                {state.suggestions.map((track) => (
                  <li
                    key={track.id}
                    data-testid={`chat-music-track-${track.id}`}
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-white/[0.03] p-2"
                  >
                    <button
                      type="button"
                      aria-label={t(playing === track.id ? 'chat.music.pause' : 'chat.music.listen', { title: track.title })}
                      onClick={() => listen(track)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-ink-0 transition-colors hover:bg-white/[0.12]"
                    >
                      {playing === track.id ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink-0">{track.title}</span>
                      <span className="block truncate text-caption text-ink-3">
                        {[track.artist, track.mood].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {track.selected ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.07] px-2.5 py-1 text-caption text-ink-1">
                        <Check size={12} aria-hidden /> {t('chat.music.inUse')}
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={disabled}
                        data-testid={`chat-music-use-${track.id}`}
                        onClick={() =>
                          change({ source: 'library', trackId: track.id, ...(dirty ? { volume } : {}) }, t('chat.music.turn.library', { title: track.title }))
                        }
                      >
                        {t('chat.music.use')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-label text-ink-3">{t('chat.music.yours')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" icon={Upload} disabled={disabled} onClick={() => fileRef.current?.click()} data-testid="chat-music-upload">
                {uploading ? t('chat.music.uploading') : t('chat.music.upload')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus"
                data-testid="chat-music-file"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  void onFile(f)
                }}
              />
              <span className="text-caption text-ink-4">{t('chat.music.uploadHint', { mb: maxMb })}</span>
            </div>
            {state.uploads.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {state.uploads.slice(0, 5).map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        change({ source: 'upload', uploadId: u.id, ...(dirty ? { volume } : {}) }, t('chat.music.turn.upload', { name: u.name.replace(/\.[^.]+$/, '') }))
                      }
                      className="inline-flex max-w-[16rem] items-center gap-1.5 truncate rounded-full border border-line bg-white/[0.04] px-3 py-1 text-caption text-ink-1 transition-colors hover:bg-white/[0.09] disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Music size={11} aria-hidden className="shrink-0" /> <span className="truncate">{u.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {problem && (
              <p role="alert" className="text-label text-danger">
                {problem}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`music-volume-${jobId}`} className="text-label text-ink-3">
                {t('chat.music.volume')}
              </label>
              <span className="font-mono text-caption tabular-nums text-ink-2">{pct(volume)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id={`music-volume-${jobId}`}
                data-testid="chat-music-volume"
                type="range"
                min={state.volume.min}
                max={state.volume.max}
                step={0.01}
                value={volume}
                disabled={disabled || !state.current.enabled}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#FF7A5C] disabled:cursor-not-allowed disabled:opacity-40"
              />
              {dirty && (
                <Button
                  variant="primary"
                  disabled={disabled}
                  data-testid="chat-music-apply"
                  onClick={() => change({ source: 'keep', volume }, t('chat.music.turn.volume', { pct: pct(volume) }))}
                >
                  {t('chat.music.apply')}
                </Button>
              )}
            </div>
          </div>

          {state.current.enabled && (
            <Button
              variant="ghost"
              icon={VolumeX}
              disabled={disabled}
              data-testid="chat-music-none"
              onClick={() => change({ source: 'none' }, t('chat.music.turn.none'))}
            >
              {t('chat.music.remove')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
