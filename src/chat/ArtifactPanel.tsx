'use client'

import clsx from 'clsx'
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
export function ArtifactPanel({ artifacts }: { artifacts: readonly Artifact[] }) {
  const { t } = useT()
  const openId = useArtifactPanel((s) => s.openId)
  const { open, close } = useArtifactPanel.getState()
  const current = artifacts.find((a) => a.id === openId)
  if (!current) return null
  const versions = versionsOf(artifacts, current.kind)
  return (
    <aside
      data-testid="chat-artifact-panel"
      aria-label={t('artifact.panel')}
      className={clsx(
        'z-30 flex min-h-0 flex-col bg-[#0c0d11] animate-fade-in',
        'fixed inset-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]',
        'md:static md:inset-auto md:w-[min(34rem,45%)] md:shrink-0 md:border-l md:border-white/[0.08] md:p-0',
      )}
    >
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
