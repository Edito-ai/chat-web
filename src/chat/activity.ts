import type { ChatAssistantMessage, StageEvent } from './chatTypes'

/** The four steps the backend reports, in order. Only these are ever shown: nothing is invented. */
export const STEP_IDS = ['analyzing', 'planning', 'assembling', 'rendering'] as const
export type StepId = (typeof STEP_IDS)[number]

export type StepStatus = 'done' | 'active' | 'pending' | 'failed' | 'stopped'

export interface TimelineStep {
  id: StepId
  status: StepStatus
  /** Epoch ms the backend entered the step, when reported. */
  startedAt: number | null
  /** Real elapsed time of a finished (or the running) step in ms; null when the backend gave no timings. */
  elapsedMs: number | null
}

const idx = (s: string | null): number => (STEP_IDS as readonly string[]).indexOf(s ?? '')

const isTerminalStatus = (s: ChatAssistantMessage['status']): boolean =>
  s === 'complete' || s === 'failed' || s === 'cancelled'

/** Earliest entry time per public step. */
function firstEntries(timings: readonly StageEvent[] | undefined): Partial<Record<StepId, number>> {
  const out: Partial<Record<StepId, number>> = {}
  for (const e of timings ?? []) {
    const i = idx(e.state)
    if (i >= 0 && out[STEP_IDS[i]!] === undefined) out[STEP_IDS[i]!] = e.at
  }
  return out
}

/**
 * Maps one assistant message to the vertical timeline. Real data only: which step is current comes from the
 * message's stage, elapsed times from the backend's recorded entry times. A follow-up never shows "analyzing"
 * (the backend skips it) unless the backend recorded it. Without timings the order alone drives done/active.
 */
export function buildTimeline(msg: ChatAssistantMessage, now: number): TimelineStep[] {
  const entries = firstEntries(msg.timings)
  const current = idx(msg.stage)
  const terminal = isTerminalStatus(msg.status)
  let reached = current
  STEP_IDS.forEach((id, i) => {
    if (entries[id] !== undefined) reached = Math.max(reached, i)
  })
  const visible = STEP_IDS.filter((id) => !(id === 'analyzing' && msg.turn > 1 && entries.analyzing === undefined))
  const end = terminal ? (msg.finishedAt ?? null) : now
  return visible.map((id): TimelineStep => {
    const i = idx(id)
    const startedAt = entries[id] ?? null
    const next = visible.find((v) => idx(v) > i && entries[v] !== undefined)
    const nextStart = next ? entries[next]! : null
    let status: StepStatus
    if (msg.status === 'complete') status = 'done'
    else if (terminal) status = i < reached ? 'done' : i === reached ? (msg.status === 'failed' ? 'failed' : 'stopped') : 'pending'
    else status = i < current ? 'done' : i === current ? 'active' : 'pending'
    let elapsedMs: number | null = null
    if (startedAt !== null && status !== 'pending') {
      const stop = nextStart ?? end
      elapsedMs = stop === null ? null : Math.max(0, stop - startedAt)
    }
    return { id, status, startedAt, elapsedMs }
  })
}

/** Total time of the turn in ms: the server's measurement when known, else start -> finish (or now while running). */
export function totalElapsedMs(msg: ChatAssistantMessage, now: number): number | null {
  if (msg.durationSec != null) return Math.round(msg.durationSec * 1000)
  if (msg.startedAt == null) return null
  const stop = isTerminalStatus(msg.status) ? msg.finishedAt : now
  return stop == null ? null : Math.max(0, stop - msg.startedAt)
}

/** "17m 36s", "42s", "1h 02m". Under a second reads "0s". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/** How many generic hint lines each step has (keys `chat.hint.<step>.<n>`, n from 1). */
export const HINT_COUNT = 3
export const HINT_ROTATE_MS = 4500

/** Which of a step's generic hints to show after `sinceStepMs` in that step (0-based). */
export function hintIndex(sinceStepMs: number): number {
  return Math.floor(Math.max(0, sinceStepMs) / HINT_ROTATE_MS) % HINT_COUNT
}

/** Overall progress as a whole percent, or null when unknown. */
export function percent(msg: ChatAssistantMessage): number | null {
  return msg.progress === null ? null : Math.round(Math.min(1, Math.max(0, msg.progress)) * 100)
}

/** Splits a "a, b and c" list at the commas / "and" that are NOT inside (...) or quotes, so one item such as
 *  `3 animated graphics ("big keyword", "underline sweep")` stays one chip. */
function splitTopLevel(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = false
  let cur = ''
  for (let i = 0; i < list.length; i++) {
    const ch = list[i]!
    if (ch === '"' || ch === '“' || ch === '”') quote = !quote
    else if (!quote && ch === '(') depth++
    else if (!quote && ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && !quote) {
      if (ch === ',') {
        out.push(cur)
        cur = ''
        continue
      }
      if (/\s/.test(ch) && list.slice(i, i + 5).toLowerCase() === ' and ') {
        out.push(cur)
        cur = ''
        i += 4
        continue
      }
    }
    cur += ch
  }
  out.push(cur)
  return out
}

/** Splits the backend's reply into the plain sentence and the "does not include ..." items (chips). */
export function splitReply(reply: string | null): { text: string; notIncluded: string[] } {
  if (!reply) return { text: '', notIncluded: [] }
  const m = /\s*This draft does not include (.+?)\.\s*$/.exec(reply)
  if (!m) return { text: reply, notIncluded: [] }
  const items = splitTopLevel(m[1]!).map((s) => s.trim()).filter(Boolean)
  return { text: reply.slice(0, m.index).trim(), notIncluded: items }
}
