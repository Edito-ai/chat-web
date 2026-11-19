'use client'

import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { useT } from '@/i18n'
import { isSlow, megabytes, readPlayerEvent, startMode } from './liveRules'
import type { LivePlayer } from './chatTypes'

type State = 'pending' | 'ask' | 'loading' | 'playing' | 'slow' | 'failed'

/**
 * The edit playing live on this device (backend2 renderer/player in an iframe), above the still frames. Nothing is rendered on
 * the server for it. Low memory / data saver: offered with a tap. Too slow or broken: it steps aside and the frames remain.
 */
export function LivePreview({ player }: { player: LivePlayer }) {
  const { t } = useT()
  const frame = useRef<HTMLIFrameElement>(null)
  // decided on the device, after mount: the server render of this component knows nothing about the phone
  const [state, setState] = useState<State>('pending')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setState(startMode(navigator as never) === 'ask' ? 'ask' : 'loading')
  }, [])

  // a new plan (a change typed on the frames) is a new page: start over, unless this device already proved too slow
  useEffect(() => {
    setProgress(0)
    setState((s) => (s === 'slow' || s === 'ask' || s === 'pending' ? s : 'loading'))
  }, [player.version])

  useEffect(() => {
    let origin = ''
    try {
      origin = new URL(player.url).origin
    } catch {
      return
    }
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== origin || ev.source !== frame.current?.contentWindow) return
      const e = readPlayerEvent(ev.data)
      if (!e) return
      if (e.type === 'loading') setProgress(e.progress)
      else if (e.type === 'ready') setState((s) => (s === 'loading' ? 'playing' : s))
      else if (e.type === 'perf' && isSlow(e)) setState('slow')
      else if (e.type === 'error') setState('failed')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [player.url])

  if (state === 'pending') return <div data-testid="chat-live-preview-pending" className="mt-3" />
  if (state === 'slow' || state === 'failed') {
    return (
      <p data-testid="chat-live-preview-off" className="mt-3 rounded-lg border border-white/10 bg-surface-1 px-3 py-2 text-label text-ink-2">
        {state === 'slow' ? t('chat.live.slow') : t('chat.live.failed')}
      </p>
    )
  }
  if (state === 'ask') {
    return (
      <button
        type="button"
        data-testid="chat-live-preview-ask"
        onClick={() => setState('loading')}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-label font-semibold text-ink-0 transition-colors hover:border-accent-line"
      >
        <Play size={15} aria-hidden />
        {player.bytes ? t('chat.live.askSize', { size: megabytes(player.bytes) }) : t('chat.live.ask')}
      </button>
    )
  }
  return (
    <div data-testid="chat-live-preview" className="mt-3">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-xl border border-white/15 bg-black">
        <iframe
          key={player.version}
          ref={frame}
          src={player.url}
          title={t('chat.live.title')}
          allow="autoplay; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
        {state === 'loading' && progress > 0 && progress < 1 && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-caption tabular-nums text-white">
            {Math.round(progress * 100)}%
          </span>
        )}
      </div>
      <p className="mt-1.5 text-center text-caption text-ink-3">{t('chat.live.hint')}</p>
    </div>
  )
}
