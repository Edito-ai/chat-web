import type { ChatAssistantMessage, ChatJobSnapshot, ChatJobStatus, ChatMessage } from './chatTypes'

const TERMINAL: ReadonlySet<ChatJobStatus> = new Set(['complete', 'failed', 'cancelled'])

export function isTerminal(status: ChatJobStatus): boolean {
  return TERMINAL.has(status)
}

/** The assistant message that is still being worked on, if any. */
export function activeAssistant(messages: readonly ChatMessage[]): ChatAssistantMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'assistant' && !isTerminal(m.status)) return m
  }
  return null
}

/** The most recent finished video: what a follow-up builds on. */
export function lastCompleted(messages: readonly ChatMessage[]): ChatAssistantMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'assistant' && m.status === 'complete' && m.result) return m
  }
  return null
}

export function newAssistant(id: string, jobId: string, turn = 1): ChatAssistantMessage {
  return {
    id, role: 'assistant', jobId, turn, status: 'queued', stage: null, progress: null, message: null, reply: null,
    result: null, error: null,
  }
}

/**
 * Folds one poll into the message list. A terminal message never goes back to running (a late or
 * reordered poll must not un-finish a video), progress never moves backwards, and a snapshot for
 * a job with no message is ignored. A "complete" without a video is a backend fault, so it fails.
 */
export function applySnapshot(messages: readonly ChatMessage[], snap: ChatJobSnapshot): ChatMessage[] {
  return messages.map((m): ChatMessage => {
    if (m.role !== 'assistant' || m.jobId !== snap.jobId || m.turn !== snap.turn || isTerminal(m.status)) return m
    const progress =
      snap.progress === null ? m.progress : Math.max(m.progress ?? 0, Math.min(1, Math.max(0, snap.progress)))
    const terminal = isTerminal(snap.status)
    const base = {
      ...m,
      stage: snap.stage ?? m.stage,
      message: snap.message ?? m.message,
      reply: snap.reply ?? m.reply,
      kind: snap.kind ?? m.kind,
      suggestions: snap.status === 'complete' ? (snap.suggestions ?? m.suggestions) : m.suggestions,
      timings: snap.stageTimings && snap.stageTimings.length > 0 ? snap.stageTimings : m.timings,
      startedAt: snap.startedAt ?? m.startedAt ?? null,
      finishedAt: terminal ? (snap.updatedAt ?? m.finishedAt ?? null) : null,
      durationSec: snap.durationSec ?? m.durationSec ?? null,
      activity: snap.activity && snap.activity.length > 0 ? snap.activity : m.activity,
      lookChoice: terminal ? null : (snap.lookChoice ?? null),
    }
    if (snap.status === 'complete') {
      if (snap.result) return { ...base, status: 'complete', progress: 1, result: snap.result, error: null }
      // A plain reply has no video behind it, and that is a finished turn. Any other "complete" without one is a fault.
      if (snap.kind === 'chat') return { ...base, status: 'complete', progress: 1, result: null, error: null }
      return { ...base, status: 'failed', progress, result: null, error: snap.error ?? 'missing_result' }
    }
    if (snap.status === 'failed') {
      return { ...base, status: 'failed', progress, result: null, error: snap.error ?? 'failed' }
    }
    return { ...base, status: snap.status, progress, result: null, error: null }
  })
}

/** Marks a running job failed/cancelled locally (poll gave up, user pressed Stop). */
export function finishLocally(
  messages: readonly ChatMessage[],
  jobId: string,
  status: 'failed' | 'cancelled',
  error: string | null = null,
): ChatMessage[] {
  return messages.map((m): ChatMessage =>
    m.role === 'assistant' && m.jobId === jobId && !isTerminal(m.status) ? { ...m, status, error } : m,
  )
}

/** Keeps the persisted transcript bounded. */
export function capMessages(messages: readonly ChatMessage[], max = 60): ChatMessage[] {
  return messages.length > max ? messages.slice(messages.length - max) : [...messages]
}

/** Stage ids the screen has copy for; anything else falls back to the generic line. */
export const KNOWN_STAGES = ['queued', 'analyzing', 'planning', 'assembling', 'rendering'] as const
export type KnownStage = (typeof KNOWN_STAGES)[number]

export function knownStage(stage: string | null): KnownStage | null {
  return (KNOWN_STAGES as readonly string[]).includes(stage ?? '') ? (stage as KnownStage) : null
}
