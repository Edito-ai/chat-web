'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { AlertCircle, Check, ChevronRight, Square } from 'lucide-react'
import { useT, type MessageKey } from '@/i18n'
import { buildTimeline, formatElapsed, hintIndex, percent, totalElapsedMs, type TimelineStep } from './activity'
import { knownStage } from './chatState'
import type { ChatAssistantMessage } from './chatTypes'
import { buildTranscript } from './buildTranscript'
import { TranscriptView, useActTitle } from './Transcript'
import { ToolsFold, toolsUsedLabel } from './ToolsFold'
import { TID } from './testIds'

/** Re-renders every `everyMs` while `active`; the clock behind the elapsed timers. */
export function useNow(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [active, everyMs])
  return now
}

function StepMark({ status }: { status: TimelineStep['status'] }) {
  if (status === 'done') {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-success-soft text-success ring-1 ring-success/30">
        <Check size={12} strokeWidth={2.5} aria-hidden />
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-soft ring-1 ring-accent-line">
        <span className="h-2 w-2 animate-pulse-ring rounded-full bg-accent" />
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-danger-soft text-danger ring-1 ring-danger/30">
        <AlertCircle size={12} aria-hidden />
      </span>
    )
  }
  if (status === 'stopped') {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white/[0.06] text-ink-3 ring-1 ring-line-strong">
        <Square size={8} fill="currentColor" aria-hidden />
      </span>
    )
  }
  return <span className="h-5 w-5 rounded-full ring-1 ring-line-strong" />
}

/** The vertical list of steps. `now` only matters while a step is running. */
export function StepTimeline({ msg, now, showHint }: { msg: ChatAssistantMessage; now: number; showHint: boolean }) {
  const { t } = useT()
  const steps = buildTimeline(msg, now)
  return (
    <ol aria-label={t('chat.activity.steps')} data-testid="chat-steps" className="space-y-0">
      {steps.map((step, i) => {
        const active = step.status === 'active'
        const hint = active && showHint ? hintIndex(step.elapsedMs ?? 0) + 1 : null
        return (
          <li key={step.id} data-step={step.id} data-status={step.status} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={clsx('absolute left-[9.5px] top-6 h-[calc(100%-1.25rem)] w-px', step.status === 'done' ? 'bg-success/30' : 'bg-line-strong')}
              />
            )}
            <StepMark status={step.status} />
            <div className="min-w-0 flex-1 pt-px">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={clsx(
                    'text-body',
                    active ? 'font-medium text-ink-0' : step.status === 'pending' ? 'text-ink-4' : 'text-ink-1',
                  )}
                >
                  {t(`chat.step.${step.id}` as MessageKey)}
                  <span className="sr-only"> ({t(`chat.step.state.${step.status}` as MessageKey)})</span>
                </span>
                {step.elapsedMs !== null && (
                  <span className="shrink-0 font-mono text-caption tabular-nums text-ink-3">{formatElapsed(step.elapsedMs)}</span>
                )}
              </div>
              {hint !== null && (
                <p key={hint} className="mt-0.5 animate-fade-hint text-label text-ink-3">
                  <span className="sr-only">{t('chat.activity.hintLabel')}: </span>
                  {t(`chat.hint.${step.id}.${hint}` as MessageKey)}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Live panel while the edit runs: pulsing current step, real elapsed per step, overall bar, generic hints. */
export function LiveActivity({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const now = useNow(true)
  const transcript = buildTranscript(msg, now)
  if (transcript.source === 'activity') return <TranscriptView data={transcript} />
  const stage = knownStage(msg.stage)
  const pct = percent(msg)
  const total = totalElapsedMs(msg, now)
  const label = msg.message ?? t(stage ? (`chat.stage.${stage}` as MessageKey) : 'chat.stage.working')
  // Announce the step and each 10% once, not every second.
  const announce = `${label}${pct !== null ? `. ${t('chat.activity.percent', { pct: Math.floor(pct / 10) * 10 })}` : ''}`
  return (
    <section
      data-testid="chat-progress"
      aria-label={t('chat.activity.title')}
      className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface-1/80 p-4 shadow-lift"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 animate-pulse-ring rounded-full bg-accent" aria-hidden />
          <h3 className="truncate font-serif text-title text-ink-0">{t('chat.activity.title')}</h3>
        </div>
        {total !== null && (
          <span aria-hidden className="shrink-0 font-mono text-caption tabular-nums text-ink-3">
            {t('chat.activity.elapsed', { time: formatElapsed(total) })}
          </span>
        )}
      </div>

      <p className="mt-3 text-prose text-ink-0">{label}</p>
      <div className="mt-2.5 flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={t('chat.progress.aria')}
          aria-valuemin={0}
          aria-valuemax={100}
          {...(pct !== null ? { 'aria-valuenow': pct } : {})}
          className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]"
        >
          {pct === null ? (
            <div className="absolute inset-y-0 left-0 w-1/3 animate-sheen rounded-full bg-accent/70" />
          ) : (
            <div
              className="relative h-full overflow-hidden rounded-full bg-accent transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(pct, 3)}%` }}
            >
              <div className="absolute inset-y-0 left-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </div>
          )}
        </div>
        {pct !== null && <span className="w-9 text-right font-mono text-caption tabular-nums text-ink-2">{pct}%</span>}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <StepTimeline msg={msg} now={now} showHint />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </section>
  )
}

/** One line after the turn ended: "Worked for 17m 36s". Expands to the recorded steps when there are any. */
export function ActivitySummary({ msg }: { msg: ChatAssistantMessage }) {
  const { t } = useT()
  const titleOf = useActTitle()
  const [open, setOpen] = useState(false)
  const transcript = buildTranscript(msg, 0)
  if (transcript.source === 'activity') {
    const tools = transcript.blocks.flatMap((b) => (b.type === 'tools' ? b.tools : []))
    if (tools.length === 0) return null
    const used = toolsUsedLabel(t, tools.length)
    const title = transcript.totalMs === null ? used : t('chat.tools.usedTime', { used, time: formatElapsed(transcript.totalMs) })
    return (
      <div data-testid={TID.summary}>
        <ToolsFold tools={tools} title={title} titleOf={(tool) => titleOf(tool)} />
      </div>
    )
  }
  const total = totalElapsedMs(msg, 0)
  const time = total === null ? null : formatElapsed(total)
  const hasSteps = (msg.timings?.length ?? 0) > 0
  if (time === null && !hasSteps) return null
  const text =
    time === null
      ? t('chat.activity.workedNoTime')
      : t(
          msg.status === 'failed' ? 'chat.activity.failedAfter' : msg.status === 'cancelled' ? 'chat.activity.stopped' : 'chat.activity.worked',
          { time },
        )
  const line = (
    <>
      {hasSteps && (
        <ChevronRight size={13} aria-hidden className={clsx('shrink-0 transition-transform duration-200', open && 'rotate-90')} />
      )}
      <span className="font-mono text-label tabular-nums">{text}</span>
    </>
  )
  return (
    <div data-testid={TID.summary} className="w-full max-w-lg">
      {hasSteps ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-ml-1.5 inline-flex min-h-[28px] items-center gap-1.5 rounded-lg px-1.5 text-ink-3 transition-colors hover:bg-white/[0.05] hover:text-ink-1"
        >
          {line}
        </button>
      ) : (
        <p className="inline-flex min-h-[28px] items-center gap-1.5 text-ink-3">{line}</p>
      )}
      {open && hasSteps && (
        <div className="mt-2 animate-rise rounded-xl border border-line bg-surface-1/60 p-3.5">
          <StepTimeline msg={msg} now={0} showHint={false} />
        </div>
      )}
    </div>
  )
}
