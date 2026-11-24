'use client'

import clsx from 'clsx'
import { Film, Grid2x2, Images, Layers, Palette, ChevronRight } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { useArtifactPanel } from './artifactStore'
import type { Artifact, ArtifactKind } from './artifacts'

const ICON = { video: Film, clips: Layers, look: Palette, frames: Images, seen: Grid2x2 } as const
const LABEL: Record<ArtifactKind, MessageKey> = {
  video: 'artifact.video',
  clips: 'artifact.clips',
  look: 'artifact.look',
  frames: 'artifact.frames',
  seen: 'artifact.seen',
}

/** The one small button a chat message keeps for what it made: click it and the thing opens in the side panel. */
export function ArtifactChip({ artifact }: { artifact: Artifact }) {
  const { t } = useT()
  const openId = useArtifactPanel((s) => s.openId)
  const { open, close } = useArtifactPanel.getState()
  const active = openId === artifact.id
  const Icon = ICON[artifact.kind]
  const waiting = artifact.kind === 'look' || artifact.kind === 'frames'
  const versioned = artifact.kind === 'video' || artifact.kind === 'clips'
  return (
    <button
      type="button"
      data-testid={`chat-artifact-${artifact.kind}`}
      aria-pressed={active}
      onClick={() => (active ? close() : open(artifact.id))}
      className={clsx(
        'group inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3.5 text-label font-medium transition-all',
        active ? 'border-accent-line bg-white/[0.1] text-ink-0' : 'border-white/15 bg-white/[0.05] text-ink-1 hover:-translate-y-px hover:border-accent-line hover:bg-white/[0.09]',
      )}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden className="text-accent" />
      {t(LABEL[artifact.kind])}
      {versioned && <span className="font-mono text-caption tabular-nums text-ink-3">{t('artifact.version', { n: artifact.version })}</span>}
      {waiting && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-caption text-ink-0">{t('artifact.waiting')}</span>}
      <ChevronRight size={13} aria-hidden className={clsx('text-ink-3 transition-transform', active && 'rotate-180')} />
    </button>
  )
}
