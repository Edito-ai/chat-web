'use client'

import { Clock, Lightbulb } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { hintIndex, type StepId } from './activity'
import type { Transcript } from './buildTranscript'
import { TranscriptView } from './Transcript'

const THINK_PER_STEP = 3
const CRAFT_COUNT = 8
const TRY_COUNT = 4
const THINK_MS = 6000
const TIP_MS = 11000

type Stage = StepId | 'queued'

/** Pure: what the AI says it is doing. Only about the step itself, never about what is inside the user's footage. */
export function thinkLine(stage: Stage, elapsedMs: number): MessageKey {
  const tick = Math.floor(Math.max(0, elapsedMs) / THINK_MS)
  return `chat.think.${stage}.${(tick % THINK_PER_STEP) + 1}` as MessageKey
}

export type TipKind = 'craft' | 'try'

/** Pure: the tip shown now. Alternates an editing-craft lesson with a follow-up the user can try, each on its own rotation. */
export function tipAt(elapsedMs: number): { kind: TipKind; key: MessageKey } {
  const tick = Math.floor(Math.max(0, elapsedMs) / TIP_MS)
  if (tick % 2 === 0) return { kind: 'craft', key: `chat.craft.${(Math.floor(tick / 2) % CRAFT_COUNT) + 1}` as MessageKey }
  return { kind: 'try', key: `chat.try.${(Math.floor(tick / 2) % TRY_COUNT) + 1}` as MessageKey }
}

/** Pure: the "time left" line for an estimate, or null when there is none. Whole minutes, never a false-precision countdown. */
export function etaMessage(etaMs: number | null): { key: MessageKey; params?: Record<string, number> } | null {
  if (etaMs === null) return null
  if (etaMs < 60_000) return { key: 'chat.eta.soon' }
  return { key: 'chat.eta.minutes', params: { n: Math.round(etaMs / 60_000) } }
}

export interface StepInfo {
  id: StepId
  /** 1-based position among the steps this turn actually runs. */
  index: number
  count: number
  /** Real time spent in this step so far, to rotate the "what this step involves" line. */
  elapsedMs?: number | null
}

/**
 * The assistant's current thought, inside the progress card: time left on the left, the step (shimmering) on the right,
 * what the AI is doing now (large), what that step usually involves, and one tip.
 */
export function WorkingScene({
  stage,
  elapsedMs,
  step,
  etaMs,
  transcript = null,
}: {
  stage: Stage
  elapsedMs: number
  step?: StepInfo | null
  etaMs?: number | null
  /** The backend's real activity (thoughts, narration, tools). When present it replaces the generic line, hint and tip. */
  transcript?: Transcript | null
}) {
  const { t } = useT()
  const line = thinkLine(stage, elapsedMs)
  const tip = tipAt(elapsedMs)
  const etaKey = etaMessage(etaMs ?? null)
  const hintKey = step ? (`chat.hint.${step.id}.${hintIndex(step.elapsedMs ?? elapsedMs) + 1}` as MessageKey) : null
  return (
    <div data-testid="chat-working-scene" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <p className="flex items-center gap-1.5 whitespace-nowrap text-caption text-ink-3">
          {etaKey && (
            <>
              <Clock size={12} aria-hidden className="shrink-0 text-ink-4" />
              <span data-testid="chat-eta">{t(etaKey.key, etaKey.params)}</span>
            </>
          )}
        </p>
        <p className="flex shrink-0 items-baseline gap-2">
          <span className="shimmer-text text-body font-semibold">{step ? t(`chat.step.${step.id}` as MessageKey) : t('chat.activity.title')}</span>
          {step && (
            <span className="font-mono text-caption tabular-nums text-ink-3">
              {step.index}/{step.count}
            </span>
          )}
        </p>
      </div>
      {transcript ? (
        <div className="mt-2">
          <TranscriptView data={transcript} />
        </div>
      ) : (
        <>
      <p key={line} className="mt-2 animate-fade-hint text-prose font-medium text-ink-0">
        {t(line)}
      </p>
      {hintKey && (
        <p key={hintKey} className="mt-1 animate-fade-hint text-body text-ink-2">
          {t(hintKey)}
        </p>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-label leading-snug text-ink-3">
        <Lightbulb size={13} aria-hidden className="mt-[2px] shrink-0 text-ink-4" />
        <span key={tip.key} className="animate-fade-hint">
          <span className="text-ink-4">{t(tip.kind === 'try' ? 'chat.think.try' : 'chat.think.craft')}: </span>
          {t(tip.key)}
        </span>
      </p>
        </>
      )}
    </div>
  )
}
