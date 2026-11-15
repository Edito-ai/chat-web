'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Captions, Check, Download, Loader2, Music, Pause, Play, Sparkles, Upload, VolumeX } from 'lucide-react'
import { Button, InlineError } from '@/components/ui'
import { useSession } from '@/auth/useSession'
import { useT } from '@/i18n'
import { uploadVideo } from './chatUploads'
import { useChat } from './chatStore'
import { clock, getClipsApi, sameLook, type CaptionTemplate, type StudioLook, type StudioState } from './clips'
import { looksLikeAudio, probeAudio } from './music'

export const STUDIO_POLL_MS = 2000
const pct = (v: number) => Math.round(v * 100)

/**
 * The clip studio (a page of its own): one clip of a stream with captions in a chosen style, background music (three
 * suggestions, or the person's own file) and sound effects the model places by itself. Apply renders it on the server;
 * the page follows the render and then plays and downloads the result. Only clipping chats lead here.
 */
export function ClipStudio({ jobId, clipId }: { jobId: string; clipId: string }) {
  const { t } = useT()
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const status = useSession()
  const [state, setState] = useState<StudioState | null>(null)
  const [draft, setDraft] = useState<StudioLook | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const take = useCallback(
    (st: StudioState, resetDraft: boolean) => {
      setState(st)
      if (resetDraft) setDraft(st.look)
      useChat.getState().patchClip(jobId, st.clip) // the chat behind this page shows the same clip
    },
    [jobId],
  )

  // First read, once signed in.
  useEffect(() => {
    if (status === 'unauthenticated') {
      routerRef.current.replace('/login')
      return
    }
    if (status !== 'authenticated') return
    const ctl = new AbortController()
    getClipsApi()
      .studio(jobId, clipId, ctl.signal)
      .then((st) => !ctl.signal.aborted && take(st, true))
      .catch((e) => !ctl.signal.aborted && setLoadError(e))
    return () => ctl.abort()
  }, [status, jobId, clipId, take])

  // Follow a render until it is done.
  const rendering = state?.clip.styled?.state === 'rendering'
  useEffect(() => {
    if (!rendering) return
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      getClipsApi()
        .studio(jobId, clipId, ctl.signal)
        .then((st) => !ctl.signal.aborted && take(st, false))
        .catch(() => undefined) // the next tick tries again
    }, STUDIO_POLL_MS)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [rendering, state, jobId, clipId, take])

  useEffect(
    () => () => {
      audioRef.current?.pause()
      audioRef.current = null
    },
    [],
  )

  if (loadError) {
    return (
      <Shell back={t('chat.studio.back')}>
        <InlineError error={loadError} />
      </Shell>
    )
  }
  if (!state || !draft) {
    return (
      <Shell back={t('chat.studio.back')}>
        <p className="flex items-center gap-2 text-label text-ink-3">
          <Loader2 size={14} className="animate-spin" aria-hidden /> {t('chat.studio.loading')}
        </p>
      </Shell>
    )
  }

  const { clip } = state
  const styled = clip.styled
  const showStyled = styled?.state !== 'failed' && !!styled?.videoUrl
  const videoUrl = showStyled ? styled!.videoUrl! : clip.videoUrl
  const saved = state.look
  const dirty = !sameLook(draft, saved) || styled?.state === 'failed'
  const nothing = !draft.captions.on && draft.music.source === 'none' && !draft.sfx.on
  const busy = applying || rendering || uploading || clip.state !== 'ready'

  const set = (patch: (d: StudioLook) => StudioLook) => {
    setProblem(null)
    setDraft((d) => (d ? patch(d) : d))
  }

  const apply = async () => {
    setProblem(null)
    setApplying(true)
    try {
      take(await getClipsApi().setLook(jobId, clipId, draft), false)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }

  const listen = (id: string, url: string) => {
    if (playing === id) {
      audioRef.current?.pause()
      return setPlaying(null)
    }
    const a = audioRef.current ?? (audioRef.current = new Audio())
    a.src = url
    a.onended = () => setPlaying(null)
    a.onerror = () => setPlaying(null)
    setPlaying(id)
    void a.play().catch(() => setPlaying(null))
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setProblem(null)
    if (!looksLikeAudio(file)) return setProblem(t('chat.music.notAudio'))
    if (file.size > state.maxUploadBytes) return setProblem(t('chat.music.tooBig', { mb: Math.round(state.maxUploadBytes / 1_000_000) }))
    setUploading(true)
    try {
      const duration = await probeAudio(file).catch(() => 0)
      const uploadId = await uploadVideo(state.projectId || 'music', file, { duration, width: null, height: null, hasAudio: true })
      setState((s) => (s ? { ...s, uploads: [{ id: uploadId, name: file.name, durationSec: duration }, ...s.uploads] } : s))
      set((d) => ({ ...d, music: { ...d.music, source: 'upload', uploadId, trackId: undefined } }))
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Shell back={t('chat.studio.back')}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-black">
            {videoUrl ? (
              <video
                key={videoUrl}
                data-testid="studio-video"
                src={videoUrl}
                poster={clip.thumbUrl ?? undefined}
                controls
                playsInline
                className={clsx('max-h-[70vh] w-full object-contain', rendering && 'opacity-50')}
              />
            ) : (
              <div className="grid aspect-video place-items-center text-label text-ink-3">{t('chat.clips.cutting')}</div>
            )}
            {rendering && (
              <span className="absolute inset-0 grid place-items-center">
                <span className="inline-flex items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-label text-white">
                  <Loader2 size={14} className="animate-spin" aria-hidden /> {t('chat.studio.rendering')}
                </span>
              </span>
            )}
          </div>
          <div>
            <h1 className="font-display text-heading font-bold text-ink-0">{clip.title}</h1>
            <p className="font-mono text-caption tabular-nums text-ink-3">
              {state.sourceTitle ? `${state.sourceTitle} · ` : ''}
              {t('chat.clips.at', { t: clock(clip.start) })} · {clip.durationSec.toFixed(0)} s
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showStyled && styled?.state === 'ready' && styled.downloadUrl && (
              <a
                href={styled.downloadUrl}
                download={styled.downloadFilename}
                data-testid="studio-download-styled"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] px-4 text-body font-semibold text-white hover:brightness-110"
              >
                <Download size={15} aria-hidden /> {t('chat.studio.download')}
              </a>
            )}
            {clip.downloadUrl && (
              <a
                href={clip.downloadUrl}
                download={clip.downloadFilename}
                data-testid="studio-download-raw"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-3 px-4 text-body font-semibold text-ink-0 hover:bg-surface-4"
              >
                <Download size={15} aria-hidden /> {t('chat.studio.downloadRaw')}
              </a>
            )}
          </div>
          {styled?.state === 'failed' && (
            <p role="alert" className="text-label text-danger">
              {t('chat.studio.failed')} {styled.error ?? ''}
            </p>
          )}
          {styled?.state === 'ready' && styled.noWords && saved.captions.on && (
            <p className="text-label text-ink-3">{t('chat.clips.noWords')}</p>
          )}
        </section>

        <aside className="space-y-4">
          {/* captions */}
          <Panel icon={<Captions size={15} aria-hidden />} title={t('chat.studio.captions')}>
            <Toggle
              testId="studio-captions-toggle"
              on={draft.captions.on}
              label={t('chat.studio.captionsOn')}
              onChange={(on) => set((d) => ({ ...d, captions: { ...d.captions, on } }))}
            />
            <ul className={clsx('grid grid-cols-1 gap-2 sm:grid-cols-2', !draft.captions.on && 'opacity-40')}>
              {state.templates.map((tp) => (
                <li key={tp.id}>
                  <TemplateCard
                    tp={tp}
                    selected={draft.captions.template === tp.id}
                    onPick={() => set((d) => ({ ...d, captions: { on: true, template: tp.id } }))}
                  />
                </li>
              ))}
            </ul>
          </Panel>

          {/* music */}
          <Panel icon={<Music size={15} aria-hidden />} title={t('chat.studio.music')}>
            <ul className="space-y-1.5">
              <li>
                <Choice
                  testId="studio-music-none"
                  selected={draft.music.source === 'none'}
                  onPick={() => set((d) => ({ ...d, music: { source: 'none', volume: d.music.volume } }))}
                  icon={<VolumeX size={14} aria-hidden />}
                  label={t('chat.studio.noMusic')}
                />
              </li>
              {state.tracks.slice(0, 3).map((tr, i) => (
                <li key={tr.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={t(playing === tr.id ? 'chat.music.pause' : 'chat.music.listen', { title: tr.title })}
                    onClick={() => listen(tr.id, tr.previewUrl)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-ink-0 hover:bg-white/[0.12]"
                  >
                    {playing === tr.id ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
                  </button>
                  <Choice
                    testId={`studio-track-${tr.id}`}
                    selected={draft.music.source === 'library' && draft.music.trackId === tr.id}
                    onPick={() => set((d) => ({ ...d, music: { source: 'library', trackId: tr.id, volume: d.music.volume } }))}
                    label={tr.title}
                    sub={[i === 0 ? t('chat.studio.bestFit') : null, tr.artist, tr.mood].filter(Boolean).join(' · ')}
                  />
                </li>
              ))}
              {state.uploads.slice(0, 5).map((u) => (
                <li key={u.id}>
                  <Choice
                    testId={`studio-upload-${u.id}`}
                    selected={draft.music.source === 'upload' && draft.music.uploadId === u.id}
                    onPick={() => set((d) => ({ ...d, music: { source: 'upload', uploadId: u.id, volume: d.music.volume } }))}
                    icon={<Music size={13} aria-hidden />}
                    label={u.name}
                    sub={t('chat.studio.yourMusic')}
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" icon={uploading ? Loader2 : Upload} disabled={busy} onClick={() => fileRef.current?.click()} data-testid="studio-upload">
                {uploading ? t('chat.music.uploading') : t('chat.music.upload')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus"
                data-testid="studio-file"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  void onFile(f)
                }}
              />
            </div>
            {draft.music.source !== 'none' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-label text-ink-3">
                  <label htmlFor="studio-volume">{t('chat.music.volume')}</label>
                  <span className="font-mono tabular-nums text-ink-2">{pct(draft.music.volume)}%</span>
                </div>
                <input
                  id="studio-volume"
                  data-testid="studio-volume"
                  type="range"
                  min={0.02}
                  max={state.volume.max}
                  step={0.01}
                  value={draft.music.volume}
                  onChange={(e) => {
                    const volume = Number(e.target.value)
                    set((d) => ({ ...d, music: { ...d.music, volume } }))
                  }}
                  className="h-1.5 w-full cursor-pointer accent-[#FF7A5C]"
                />
              </div>
            )}
          </Panel>

          {/* sound effects */}
          <Panel icon={<Sparkles size={15} aria-hidden />} title={t('chat.studio.sfx')}>
            <Toggle
              testId="studio-sfx-toggle"
              on={draft.sfx.on}
              label={t('chat.studio.sfxOn')}
              onChange={(on) => set((d) => ({ ...d, sfx: { on } }))}
            />
            <p className="text-caption text-ink-4">{t('chat.studio.sfxHint')}</p>
          </Panel>

          {problem && (
            <p role="alert" className="text-label text-danger">
              {problem}
            </p>
          )}
          <Button
            variant="primary"
            className="h-11 w-full"
            data-testid="studio-apply"
            disabled={busy || !dirty}
            onClick={() => void apply()}
          >
            {applying || rendering ? t('chat.studio.rendering') : nothing ? t('chat.studio.applyPlain') : t('chat.studio.apply')}
          </Button>
        </aside>
      </div>
    </Shell>
  )
}

function Shell({ back, children }: { back: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-surface-0 px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <Link href="/" data-testid="studio-back" className="inline-flex items-center gap-2 text-label text-ink-2 hover:text-ink-0">
          <ArrowLeft size={15} aria-hidden /> {back}
        </Link>
        {children}
      </div>
    </main>
  )
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface-1 p-4">
      <h2 className="flex items-center gap-2 font-display text-body font-semibold text-ink-0">
        <span className="text-accent">{icon}</span> {title}
      </h2>
      {children}
    </section>
  )
}

function Toggle({ on, label, onChange, testId }: { on: boolean; label: string; onChange: (on: boolean) => void; testId: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-label text-ink-1">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        data-testid={testId}
        onClick={() => onChange(!on)}
        className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-white/[0.15]')}
      >
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', on ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

function Choice({ selected, onPick, label, sub, icon, testId }: {
  selected: boolean; onPick: () => void; label: string; sub?: string; icon?: React.ReactNode; testId: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onPick}
      className={clsx(
        'flex w-full min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
        selected ? 'border-accent-line bg-accent/15' : 'border-line bg-white/[0.03] hover:bg-white/[0.06]',
      )}
    >
      {icon && <span className="shrink-0 text-ink-2">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-ink-0">{label}</span>
        {sub && <span className="block truncate text-caption text-ink-3">{sub}</span>}
      </span>
      {selected && <Check size={14} className="shrink-0 text-accent" aria-hidden />}
    </button>
  )
}

/** A caption style, shown as a small sample of how a line will look. */
function TemplateCard({ tp, selected, onPick }: { tp: CaptionTemplate; selected: boolean; onPick: () => void }) {
  const words = ['this', 'is', 'how', 'it', 'looks']
  const say = (w: string) => (tp.upper ? w.toUpperCase() : w)
  const shadow = tp.style.glow ? `0 0 6px ${tp.style.glow}, 0 0 2px ${tp.style.glow}` : '0 1px 2px #000, 0 0 2px #000'
  return (
    <button
      type="button"
      data-testid={`studio-template-${tp.id}`}
      aria-pressed={selected}
      title={tp.desc}
      onClick={onPick}
      className={clsx(
        'flex h-full w-full flex-col gap-1.5 rounded-xl border p-2 text-left transition-colors',
        selected ? 'border-accent-line bg-accent/15' : 'border-line bg-white/[0.03] hover:bg-white/[0.06]',
      )}
    >
      <span className="grid h-12 place-items-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 px-1">
        <span
          className="truncate px-1.5 py-0.5 text-[11px] font-bold leading-tight"
          style={{ color: tp.style.color, textShadow: shadow, background: tp.style.bg ?? undefined, borderRadius: 4 }}
        >
          {words.map((w, i) => (
            <span key={w} style={i === 2 ? { color: tp.style.accent } : undefined}>
              {say(w)}{i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </span>
      </span>
      <span className="flex items-center justify-between gap-1 text-caption text-ink-1">
        {tp.name} {selected && <Check size={12} className="text-accent" aria-hidden />}
      </span>
    </button>
  )
}
