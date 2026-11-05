'use client'

import { Lightbulb, Terminal } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { formatElapsed } from './activity'
import { ToolsFold } from './ToolsFold'
import { TID } from './testIds'
import type { Transcript } from './buildTranscript'

/** Fixed labels the backend writes under a stable id, translated here. Dynamic ones (the Director's own step
 *  labels, "Reading your footage (1/2)") show the backend's text as sent. */
const FIXED: Record<string, MessageKey> = {
  'thought:review': 'chat.act.thought.review',
  'thought:plan': 'chat.act.thought.plan',
  'thought:change': 'chat.act.thought.change',
  'tool:save': 'chat.act.tool.save',
  'tool:render': 'chat.act.tool.render',
  'tool:polish': 'chat.act.tool.polish',
  'tool:followup': 'chat.act.tool.followup',
  'tool:refine': 'chat.act.tool.refine',
}

export function useActTitle(): (item: { id: string; title: string }) => string {
  const { t } = useT()
  return (item) => {
    const key = FIXED[item.id]
    return key ? t(key) : item.title
  }
}

/** The linear transcript: thought line, narration, folded tools, and while running the "Executing ..." line. */
export function TranscriptView({ data, showLive = true }: { data: Transcript; showLive?: boolean }) {
  const { t } = useT()
  const titleOf = useActTitle()
  return (
    <div data-testid={TID.transcript} role="group" aria-label={t('chat.transcript.label')} className="w-full max-w-lg space-y-2.5">
      {data.blocks.map((b) => {
        if (b.type === 'thought') {
          return (
            <p key={b.id} data-testid={TID.thought} className="flex items-center gap-2 text-label text-ink-3">
              <Lightbulb size={14} aria-hidden className="shrink-0 text-warning" />
              <span>{titleOf({ id: b.id, title: b.title })}</span>
            </p>
          )
        }
        if (b.type === 'say') {
          return (
            <p key={b.id} data-testid={TID.say} className="text-prose text-ink-0">
              {b.text}
            </p>
          )
        }
        return <ToolsFold key={b.id} tools={b.tools} titleOf={(tool) => titleOf(tool)} />
      })}
      {showLive && <LiveLine data={data} />}
    </div>
  )
}

/** `aria-live=polite` region: announces the current action, not every tick of its timer. */
function LiveLine({ data }: { data: Transcript }) {
  const { t } = useT()
  const titleOf = useActTitle()
  const what = data.live ? titleOf(data.live) : t('chat.live.waiting')
  return (
    <div data-testid={TID.live} className="flex items-center gap-2 rounded-xl border border-line bg-surface-1/70 px-3 py-2">
      <Terminal size={14} aria-hidden className="shrink-0 text-ink-3" />
      <p role="status" aria-live="polite" className="min-w-0 flex-1 truncate text-label text-ink-1">
        <span className="text-ink-3">{t('chat.live.executing')} </span>
        {what}
      </p>
      <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse-ring rounded-full bg-accent" />
      {data.live && (
        <span aria-hidden className="shrink-0 font-mono text-caption tabular-nums text-ink-3">
          {formatElapsed(data.live.elapsedMs)}
        </span>
      )}
    </div>
  )
}
