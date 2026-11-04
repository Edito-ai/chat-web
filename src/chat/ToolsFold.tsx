'use client'

import { useId, useState } from 'react'
import clsx from 'clsx'
import { AlertCircle, Check, ChevronRight, Square } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { formatElapsed } from './activity'
import { TID } from './testIds'
import type { ToolStatus, ToolView } from './buildTranscript'

export function toolsUsedLabel(t: ReturnType<typeof useT>['t'], n: number): string {
  return n === 1 ? t('chat.tools.used.one') : t('chat.tools.used.many', { n })
}

function Mark({ status }: { status: ToolStatus }) {
  if (status === 'running') return <span className="h-2 w-2 animate-pulse-ring rounded-full bg-accent" aria-hidden />
  if (status === 'failed') return <AlertCircle size={13} className="text-danger" aria-hidden />
  if (status === 'stopped') return <Square size={9} fill="currentColor" className="text-ink-3" aria-hidden />
  return <Check size={13} strokeWidth={2.5} className="text-success" aria-hidden />
}

/** A collapsed "Used N tools" line with a chevron; a real button (Enter / Space), expands to the tool list. */
export function ToolsFold({
  tools,
  title,
  titleOf,
  defaultOpen = false,
}: {
  tools: ToolView[]
  /** Overrides "Used N tools" (the finished summary adds the total time). */
  title?: string
  titleOf: (tool: ToolView) => string
  defaultOpen?: boolean
}) {
  const { t } = useT()
  const [open, setOpen] = useState(defaultOpen)
  const listId = useId()
  return (
    <div data-testid={TID.toolsFold} className="w-full max-w-lg">
      <button
        type="button"
        data-testid={TID.toolsToggle}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="-ml-1.5 inline-flex min-h-[28px] items-center gap-1.5 rounded-lg px-1.5 text-ink-3 transition-colors hover:bg-white/[0.05] hover:text-ink-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ChevronRight size={13} aria-hidden className={clsx('shrink-0 transition-transform duration-200', open && 'rotate-90')} />
        <span className="text-label">{title ?? toolsUsedLabel(t, tools.length)}</span>
      </button>
      <ul
        id={listId}
        data-testid={TID.toolsList}
        aria-label={t('chat.tools.list')}
        hidden={!open}
        className="mt-1.5 space-y-px rounded-xl border border-line bg-surface-1/60 p-1.5"
      >
        {tools.map((tool) => (
          <li key={tool.id} data-testid={TID.tool} data-status={tool.status} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5">
            <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center">
              <Mark status={tool.status} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-label text-ink-1">
                {titleOf(tool)}
                <span className="sr-only"> ({t(`chat.tools.state.${tool.status}` as MessageKey)})</span>
              </p>
              {tool.detail && <p className="break-words text-caption text-ink-3">{tool.detail}</p>}
            </div>
            {tool.elapsedMs !== null && (
              <span className="shrink-0 font-mono text-caption tabular-nums text-ink-3">{formatElapsed(tool.elapsedMs)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
