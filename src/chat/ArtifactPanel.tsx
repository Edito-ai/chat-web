'use client'

import clsx from 'clsx'
import { useCallback, useEffect, useState, type PointerEvent as RPointerEvent } from 'react'
import { X } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { IconButton } from '@/components/ui'
import { useArtifactPanel } from './artifactStore'
import { versionsOf, type Artifact, type ArtifactKind } from './artifacts'
import { ResultCard, SeenFrames } from './ResultCard'
import { ClipsBoard } from './ClipsBoard'
import { FramesReview } from './FramesReview'
import { LookChoice } from './LookChoice'

const TITLE: Record<ArtifactKind, MessageKey> = {
  video: 'artifact.video',
  clips: 'artifact.clips',
  look: 'artifact.look',
  frames: 'artifact.frames',
  seen: 'artifact.seen',
}

function Body({ artifact }: { artifact: Artifact }) {
  const { msg } = artifact
  switch (artifact.kind) {
    case 'look':
      return <LookChoice msg={msg} />
    case 'frames':
      return <FramesReview msg={msg} />
    case 'clips':
      return <ClipsBoard msg={msg} />
    case 'video':
      return msg.result ? <ResultCard msg={{ ...msg, result: msg.result }} /> : null
    case 'seen':
      return msg.analysis ? <SeenFrames analysis={msg.analysis} /> : null
  }
}

/**
 * The preview panel beside the chat: whatever the chat made (finished video, clips, the look and frames to choose from, what was
 * seen), one version at a time, with a switcher between versions. A column on a wide screen, the whole screen on a phone.
 */
const W_KEY = 'edito.chat.panelWidth'
const W_MIN = 320
const clampW = (w: number) => Math.round(Math.min(Math.max(w, W_MIN), Math.max(W_MIN, window.innerWidth * 0.75)))

/** The width of the side panel: drag its left edge (or use the arrow keys on it); remembered between visits. */
function usePanelWidth() {
  const [w, setW] = useState(560)
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(W_KEY))
      if (v > 0) setW(clampW(v))
    } catch {
      // not remembered
    }
  }, [])
  const save = useCallback((v: number) => {
    try {
      localStorage.setItem(W_KEY, String(v))
    } catch {
      // not remembered
    }
  }, [])
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = w
    let last = w
    const move = (ev: PointerEvent) => {
      last = clampW(startW + (startX - ev.clientX))
      setW(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      save(last)
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = clampW(w + (e.key === 'ArrowLeft' ? 40 : -40))
    setW(next)
    save(next)
  }
  return { w, onPointerDown, onKeyDown, reset: () => { setW(560); save(560) } }
}

export function ArtifactPanel({ artifacts }: { artifacts: readonly Artifact[] }) {
  const { t } = useT()
  const openId = useArtifactPanel((s) => s.openId)
  const { open, close } = useArtifactPanel.getState()
  const size = usePanelWidth()
  const current = artifacts.find((a) => a.id === openId)
  if (!current) return null
  const versions = versionsOf(artifacts, current.kind)
  return (
    <aside
      style={{ ['--panel-w' as string]: `${size.w}px` }}
      data-testid="chat-artifact-panel"
      aria-label={t('artifact.panel')}
      className={clsx(
        'z-30 flex min-h-0 flex-col bg-surface-1 animate-fade-in',
        'fixed inset-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]',
        'md:relative md:inset-auto md:w-[var(--panel-w)] md:max-w-[75%] md:shrink-0 md:border-l md:border-white/[0.08] md:p-0',
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize preview"
        tabIndex={0}
        data-testid="chat-artifact-resize"
        onPointerDown={size.onPointerDown}
        onKeyDown={size.onKeyDown}
        onDoubleClick={size.reset}
        className="group absolute inset-y-0 -left-1 z-40 hidden w-2 cursor-col-resize touch-none md:block"
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-white/40 group-focus-visible:bg-white/60 group-active:bg-white/60" />
      </div>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.08] px-3 sm:px-4">
        <h2 className="min-w-0 flex-1 truncate font-display text-body font-medium text-ink-0">{t(TITLE[current.kind])}</h2>
        {versions.length > 1 && (
          <div role="group" aria-label={t('artifact.versions')} className="flex items-center gap-1 rounded-full bg-white/[0.05] p-1">
            {versions.map((v) => (
              <button
                key={v.id}
                type="button"
                data-testid={`chat-artifact-version-${v.version}`}
                aria-pressed={v.id === current.id}
                onClick={() => open(v.id)}
                className={clsx(
                  'h-7 min-w-[2rem] rounded-full px-2 font-mono text-caption tabular-nums transition-colors',
                  v.id === current.id ? 'bg-ink-0 text-surface-0' : 'text-ink-3 hover:text-ink-0',
                )}
              >
                {t('artifact.version', { n: v.version })}
              </button>
            ))}
          </div>
        )}
        <IconButton data-testid="chat-artifact-close" icon={X} aria-label={t('artifact.close')} onClick={close} />
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <Body key={current.id} artifact={current} />
      </div>
    </aside>
  )
}
