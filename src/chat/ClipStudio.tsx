'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Captions, Check, CheckCircle2, Download, Eye, Film, Languages, Loader2, Music, Pause, Play, Scissors, Sparkles, Upload, VolumeX, Wand2 } from 'lucide-react'
import { Button, InlineError } from '@/components/ui'
import { useSession } from '@/auth/useSession'
import { useT } from '@/i18n'
import { userMessage } from '@/lib/friendlyError'
import { uploadVideo } from './chatUploads'
import { useChat } from './chatStore'
import { clock, getClipsApi, sameLook, type CaptionTemplate, type ClipCaptions, type StudioLook, type StudioState } from './clips'
import { CaptionOverlay } from './CaptionOverlay'
import { ClipTrim } from './ClipsBoard'
import { checkLanguage, type LangCheck } from './langs'
import { useMusicPreview } from './useMusicPreview'
import { looksLikeAudio, probeAudio } from './music'

export const STUDIO_POLL_MS = 2000
const pct = (v: number) => Math.round(v * 100)

/**
 * The clip studio (a page of its own): one clip of a stream with captions in a chosen style, background music (three
 * suggestions, or the person's own file) and sound effects the model places by itself. Every choice plays at once in a live
 * preview in the browser (captions drawn over the clip, the track playing along). Apply makes the final file on the server
 * (captions burned in, music mixed); the page follows that render and then plays and downloads the result. A sticky bar
 * always shows where things stand and holds Apply. Only clipping chats lead here.
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
  /** The clip's words for the live caption preview: loading, there, or not available (the overlay is then left out). */
  const [captions, setCaptions] = useState<ClipCaptions | null>(null)
  const [captionsState, setCaptionsState] = useState<'loading' | 'ready' | 'none'>('loading')
  /** The <video> on screen (it is re-created when its file changes): the overlay and the music follow it. */
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  /** What the person chose to watch; null = automatic (the final file once it matches the choices, else the live preview). */
  const [viewPick, setViewPick] = useState<'preview' | 'final' | null>(null)
  /** Why the preview has no captions in the chosen language (the translation failed), shown under the player. */
  const [captionsProblem, setCaptionsProblem] = useState<string | null>(null)
  /** Captions already fetched, per clip version and language: switching back is instant. */
  const captionCache = useRef(new Map<string, ClipCaptions>())
  /** The trim panel under the player. */
  const [trimming, setTrimming] = useState(false)

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

  // The words for the live preview: once per clip version (a trim makes new ones). The first time the server works them out.
  // In another language the server translates them once (a few seconds), then they are kept.
  const clipVersion = state?.clip.version
  const clipReady = state?.clip.state === 'ready'
  const captionLang = draft?.captions.on ? draft.captions.lang : 'original'
  useEffect(() => {
    if (clipVersion === undefined || !clipReady) return
    const api = getClipsApi()
    if (!api.captions) return setCaptionsState('none')
    setCaptionsProblem(null)
    const key = `${clipVersion}:${captionLang}`
    const hit = captionCache.current.get(key)
    if (hit) {
      setCaptions(hit)
      setCaptionsState(hit.words.length ? 'ready' : 'none')
      return
    }
    const ctl = new AbortController()
    setCaptionsState('loading')
    api
      .captions(jobId, clipId, captionLang, ctl.signal)
      .then((c) => {
        if (ctl.signal.aborted) return
        captionCache.current.set(key, c)
        setCaptions(c)
        setCaptionsState(c.words.length ? 'ready' : 'none')
      })
      .catch((e) => {
        if (ctl.signal.aborted) return
        setCaptionsState('none')
        if (captionLang !== 'original') setCaptionsProblem(userMessage(e))
      })
    return () => ctl.abort()
  }, [jobId, clipId, clipVersion, clipReady, captionLang])

  // Follow a render until it is done.
  const rendering = state?.clip.styled?.state === 'rendering'
  const cutting = !!state && state.clip.state !== 'ready'
  useEffect(() => {
    if (!rendering && !cutting) return
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
  }, [rendering, cutting, state, jobId, clipId, take])

  // A render that just finished is shown (automatic view again).
  const styledVersion = state?.clip.styled?.state === 'ready' ? state.clip.styled.version : null
  useEffect(() => {
    if (styledVersion !== null) setViewPick(null)
  }, [styledVersion])

  useEffect(
    () => () => {
      audioRef.current?.pause()
      audioRef.current = null
    },
    [],
  )

  const styled = state?.clip.styled
  const finalReady = styled?.state === 'ready' && !!styled.videoUrl
  const dirty = !!state && !!draft && (!sameLook(draft, state.look) || styled?.state === 'failed')
  const view: 'preview' | 'final' = finalReady && (viewPick ?? (dirty ? 'preview' : 'final')) === 'final' ? 'final' : 'preview'
  const previewTrack = draft?.music.source === 'library' ? state?.tracks.find((tr) => tr.id === draft.music.trackId) ?? null : null
  useMusicPreview(view === 'preview' ? video : null, previewTrack?.previewUrl ?? null, draft?.music.volume ?? 0)

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
  const videoUrl = view === 'final' ? styled!.videoUrl! : clip.videoUrl
  const saved = state.look
  const nothing = !draft.captions.on && draft.music.source === 'none' && !draft.sfx.on
  const busy = applying || rendering || uploading || clip.state !== 'ready'
  const template = state.templates.find((tp) => tp.id === draft.captions.template) ?? state.templates[0]
  const showOverlay = view === 'preview' && draft.captions.on && captionsState === 'ready' && !!captions && !!template && captions.lang === captionLang
  const langName = (id: string) => state.languages.main.find((l) => l.id === id)?.name ?? state.languages.other.find((n) => n.toLowerCase() === id) ?? id
  const afterTrim = async () => {
    setTrimming(false)
    try {
      take(await getClipsApi().studio(jobId, clipId), false) // the clip is being cut again: follow it
    } catch {
      // the poll picks it up
    }
  }

  const set = (patch: (d: StudioLook) => StudioLook) => {
    setProblem(null)
    setViewPick(null) // a new choice is watched in the live preview
    setDraft((d) => (d ? patch(d) : d))
  }

  const apply = async () => {
    setProblem(null)
    setApplying(true)
    try {
      take(await getClipsApi().setLook(jobId, clipId, draft), false)
    } catch (e) {
      setProblem(userMessage(e))
    } finally {
      setApplying(false)
    }
  }

  const stopListening = () => {
    audioRef.current?.pause()
    setPlaying(null)
  }

  const listen = (id: string, url: string) => {
    if (playing === id) return stopListening()
    video?.pause() // one sound at a time
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
      setProblem(userMessage(e))
    } finally {
      setUploading(false)
    }
  }

  // The action bar: what state the clip is in, and the one thing to do next.
  const working = applying || rendering
  const bar = cutting
    ? { tone: 'working' as const, title: t('chat.studio.bar.cutting'), sub: t('chat.studio.bar.cuttingSub') }
    : styled?.state === 'failed' && !working
      ? { tone: 'failed' as const, title: t('chat.studio.failed'), sub: styled.error ?? '' }
      : working
        ? { tone: 'working' as const, title: t('chat.studio.bar.rendering'), sub: t('chat.studio.bar.renderingSub') }
        : dirty
          ? { tone: 'changes' as const, title: t('chat.studio.bar.changes'), sub: t('chat.studio.bar.changesSub') }
          : finalReady
            ? { tone: 'done' as const, title: t('chat.studio.bar.applied'), sub: t('chat.studio.bar.appliedSub') }
            : { tone: 'idle' as const, title: t('chat.studio.bar.idle'), sub: t('chat.studio.bar.idleSub') }

  return (
    <Shell back={t('chat.studio.back')}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-3">
          {/* Live preview / final file */}
          <div className="flex items-center justify-between gap-3">
            <div role="tablist" aria-label={t('chat.studio.view.label')} className="inline-flex rounded-xl border border-line bg-surface-1 p-1">
              {(['preview', 'final'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  data-testid={`studio-view-${v}`}
                  aria-selected={view === v}
                  disabled={v === 'final' && !finalReady}
                  onClick={() => setViewPick(v)}
                  className={clsx(
                    'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-label font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    view === v ? 'bg-white/[0.1] text-ink-0' : 'text-ink-3 hover:text-ink-1',
                  )}
                >
                  {v === 'preview' ? <Eye size={14} aria-hidden /> : <Film size={14} aria-hidden />}
                  {t(v === 'preview' ? 'chat.studio.view.preview' : 'chat.studio.view.final')}
                </button>
              ))}
            </div>
            {view === 'preview' && (
              <span className="inline-flex items-center gap-1.5 text-caption text-ink-3">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                {t('chat.studio.view.live')}
              </span>
            )}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-black">
            {videoUrl ? (
              <video
                key={videoUrl}
                ref={setVideo}
                data-testid="studio-video"
                src={videoUrl}
                poster={clip.thumbUrl ?? undefined}
                controls
                playsInline
                onPlay={() => playing && stopListening()}
                className="mx-auto block aspect-[9/16] max-h-[72vh] w-auto bg-black object-contain"
              />
            ) : (
              <div className="mx-auto grid aspect-[9/16] max-h-[72vh] place-items-center text-label text-ink-3">{t('chat.clips.cutting')}</div>
            )}
            {showOverlay && <CaptionOverlay video={video} captions={captions!} template={template!} />}
            {view === 'preview' && draft.captions.on && captionsState === 'loading' && (
              <span className="pointer-events-none absolute inset-x-0 bottom-[22%] flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-caption text-white backdrop-blur">
                  <Loader2 size={13} className="animate-spin" aria-hidden />{' '}
                  {captionLang === 'original' ? t('chat.studio.preview.preparing') : t('chat.studio.lang.translating', { name: langName(captionLang) })}
                </span>
              </span>
            )}
            {cutting && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
                <span className="inline-flex items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-label text-white">
                  <Scissors size={14} aria-hidden /> {t('chat.studio.bar.cutting')}
                </span>
              </span>
            )}
            {working && (
              <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-caption text-white backdrop-blur">
                <Loader2 size={12} className="animate-spin" aria-hidden /> {t('chat.studio.rendering')}
              </span>
            )}
          </div>
          {view === 'preview' && draft.captions.on && captionsState === 'none' && (
            <p role={captionsProblem ? 'alert' : undefined} className={clsx('text-caption', captionsProblem ? 'text-danger' : 'text-ink-3')}>
              {captionsProblem ?? t('chat.studio.preview.unavailable')}
            </p>
          )}
          {view === 'preview' && draft.music.source === 'upload' && (
            <p className="text-caption text-ink-3">{t('chat.studio.preview.uploadMusic')}</p>
          )}
          <div>
            <h1 className="font-display text-heading font-bold text-ink-0">{clip.title}</h1>
            <p className="font-mono text-caption tabular-nums text-ink-3">
              {state.sourceTitle ? `${state.sourceTitle} · ` : ''}
              {t('chat.clips.at', { t: clock(clip.start) })} · {clip.durationSec.toFixed(0)} s
            </p>
          </div>
          <div className="space-y-2">
            <Button
              variant="secondary"
              icon={Scissors}
              data-testid="studio-trim"
              aria-expanded={trimming}
              disabled={cutting || working}
              onClick={() => setTrimming((v) => !v)}
            >
              {t('chat.studio.trim')}
            </Button>
            {trimming && !cutting && (
              <div className="space-y-2">
                <p className="text-caption text-ink-3">{t('chat.studio.trimHint')}</p>
                <ClipTrim jobId={jobId} clip={clip} sourceSec={state.sourceSec} onDone={() => void afterTrim()} />
              </div>
            )}
          </div>
          {styled?.state === 'ready' && styled.noWords && saved.captions.on && (
            <p className="text-label text-ink-3">{t('chat.clips.noWords')}</p>
          )}
        </section>

        <aside className="scroll-thin space-y-4 lg:sticky lg:top-5 lg:max-h-[calc(100dvh-9rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {/* captions */}
          <Panel icon={<Captions size={15} aria-hidden />} title={t('chat.studio.captions')}>
            <Toggle
              testId="studio-captions-toggle"
              on={draft.captions.on}
              label={t('chat.studio.captionsOn')}
              onChange={(on) => set((d) => ({ ...d, captions: { ...d.captions, on } }))}
            />
            <LanguagePicker
              value={draft.captions.lang}
              main={state.languages.main}
              other={state.languages.other}
              disabled={!draft.captions.on}
              onPick={(lang) => set((d) => ({ ...d, captions: { ...d.captions, on: true, lang } }))}
            />
            <ul className={clsx('grid grid-cols-1 gap-2 sm:grid-cols-2', !draft.captions.on && 'opacity-40')}>
              {state.templates.map((tp) => (
                <li key={tp.id}>
                  <TemplateCard
                    tp={tp}
                    selected={draft.captions.template === tp.id}
                    onPick={() => set((d) => ({ ...d, captions: { ...d.captions, on: true, template: tp.id } }))}
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
        </aside>
      </div>

      {/* The action bar: always on screen, says where things stand and holds Apply and the downloads. */}
      <div
        data-testid="studio-bar"
        data-tone={bar.tone}
        className="sticky bottom-3 z-30 rounded-2xl border border-line-strong bg-[linear-gradient(160deg,rgb(30_34_70/0.92),rgb(14_16_34/0.95))] p-3 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl sm:p-4"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              aria-hidden
              className={clsx(
                'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                bar.tone === 'changes' && 'bg-accent/20 text-accent',
                bar.tone === 'working' && 'bg-white/[0.08] text-ink-0',
                bar.tone === 'done' && 'bg-success/15 text-success',
                bar.tone === 'failed' && 'bg-danger/15 text-danger',
                bar.tone === 'idle' && 'bg-white/[0.06] text-ink-2',
              )}
            >
              {bar.tone === 'working' ? (
                <Loader2 size={18} className="animate-spin" />
              ) : bar.tone === 'done' ? (
                <CheckCircle2 size={18} />
              ) : bar.tone === 'failed' ? (
                <AlertCircle size={18} />
              ) : bar.tone === 'changes' ? (
                <Wand2 size={18} />
              ) : (
                <Eye size={18} />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-body font-semibold text-ink-0">{bar.title}</p>
              <p className="line-clamp-2 text-caption text-ink-3">{bar.sub}</p>
              {problem && (
                <p role="alert" className="mt-0.5 text-caption text-danger">
                  {problem}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
            {clip.downloadUrl && (
              <a
                href={clip.downloadUrl}
                download={clip.downloadFilename}
                data-testid="studio-download-raw"
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line bg-surface-3 px-3.5 text-label font-semibold text-ink-1 hover:bg-surface-4 md:flex-none"
              >
                <Download size={15} aria-hidden /> {t('chat.studio.downloadRaw')}
              </a>
            )}
            {finalReady && styled?.downloadUrl && (
              <a
                href={styled.downloadUrl}
                download={styled.downloadFilename}
                data-testid="studio-download-styled"
                className={clsx(
                  'inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-body font-semibold md:flex-none',
                  dirty ? 'border border-line bg-surface-3 text-ink-0 hover:bg-surface-4' : 'bg-gradient-to-br from-[#D8264A] to-[#FF7A5C] text-white hover:brightness-110',
                )}
              >
                <Download size={15} aria-hidden /> {t('chat.studio.download')}
              </a>
            )}
            <Button
              variant="primary"
              icon={working ? Loader2 : Wand2}
              className={clsx('h-11 w-full whitespace-nowrap px-6 text-body md:w-auto', dirty && !busy && 'studio-apply-ready', working && '[&>svg]:animate-spin')}
              data-testid="studio-apply"
              disabled={busy || !dirty}
              onClick={() => void apply()}
            >
              {working ? t('chat.studio.rendering') : nothing ? t('chat.studio.applyPlain') : t('chat.studio.apply')}
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  )
}

/**
 * The caption language: As spoken / Hindi / English / Hinglish as buttons, or "Other" to type one. A typed name is checked
 * against the languages the server knows: a near miss asks "Did you mean ...?" before anything changes.
 */
function LanguagePicker({ value, main, other, disabled, onPick }: {
  value: string; main: { id: string; name: string }[]; other: string[]; disabled: boolean; onPick: (lang: string) => void
}) {
  const { t } = useT()
  const isMain = main.some((l) => l.id === value)
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [check, setCheck] = useState<LangCheck | null>(null)
  const known = [...main.filter((l) => l.id !== 'original').map((l) => l.name), ...other]
  const chip = (on: boolean) =>
    clsx(
      'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-label transition-colors',
      on ? 'border-accent-line bg-accent/15 text-ink-0' : 'border-line bg-white/[0.03] text-ink-2 hover:bg-white/[0.07] hover:text-ink-0',
    )
  const pickName = (name: string) => {
    const m = main.find((l) => l.name.toLowerCase() === name.toLowerCase())
    onPick(m ? m.id : name.toLowerCase())
    setTyping(false)
    setTyped('')
    setCheck(null)
  }
  const submit = () => {
    const c = checkLanguage(typed, known)
    if (c.kind === 'ok') return pickName(c.name)
    setCheck(c)
  }
  const otherName = !isMain ? other.find((n) => n.toLowerCase() === value) ?? value : null

  return (
    <div className={clsx('space-y-2', disabled && 'opacity-40')}>
      <p className="flex items-center gap-1.5 text-label text-ink-3">
        <Languages size={13} aria-hidden /> {t('chat.studio.lang.label')}
      </p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('chat.studio.lang.label')}>
        {main.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={value === l.id}
            data-testid={`studio-lang-${l.id}`}
            onClick={() => {
              setTyping(false)
              setCheck(null)
              onPick(l.id)
            }}
            className={chip(value === l.id)}
          >
            {l.name}
          </button>
        ))}
        {other.length > 0 && (
          <button
            type="button"
            role="radio"
            aria-checked={!isMain}
            data-testid="studio-lang-other"
            onClick={() => setTyping((v) => !v)}
            className={chip(!isMain || typing)}
          >
            {otherName ? otherName : t('chat.studio.lang.other')}
          </button>
        )}
      </div>
      {typing && (
        <form
          className="space-y-2 rounded-xl border border-line bg-white/[0.03] p-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="flex gap-2">
            <input
              autoFocus
              data-testid="studio-lang-input"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value)
                setCheck(null)
              }}
              placeholder={t('chat.studio.lang.placeholder')}
              maxLength={40}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-body text-ink-0 placeholder:text-ink-4 focus:border-accent-line"
            />
            <Button type="submit" variant="secondary" data-testid="studio-lang-use" disabled={!typed.trim()}>
              {t('chat.studio.lang.use')}
            </Button>
          </div>
          {check?.kind === 'suggest' && (
            <div data-testid="studio-lang-suggest" className="space-y-2 rounded-lg bg-accent/10 p-2.5">
              <p className="text-label text-ink-1">{t('chat.studio.lang.didYouMean', { name: check.name })}</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-testid="studio-lang-yes" onClick={() => pickName(check.name)} className={chip(true)}>
                  <Check size={13} aria-hidden /> {t('chat.studio.lang.yes', { name: check.name })}
                </button>
                {check.others.map((n) => (
                  <button key={n} type="button" onClick={() => pickName(n)} className={chip(false)}>
                    {n}
                  </button>
                ))}
                <button type="button" onClick={() => setCheck(null)} className="h-8 px-2 text-label text-ink-3 hover:text-ink-0">
                  {t('chat.studio.lang.retype')}
                </button>
              </div>
            </div>
          )}
          {check?.kind === 'unknown' && (
            <div data-testid="studio-lang-unknown" className="space-y-2">
              <p role="alert" className="text-label text-danger">{t('chat.studio.lang.unknown', { typed: typed.trim() })}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-caption text-ink-3">{t('chat.studio.lang.closest')}</span>
                {check.closest.map((n) => (
                  <button key={n} type="button" onClick={() => pickName(n)} className={chip(false)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      )}
    </div>
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
