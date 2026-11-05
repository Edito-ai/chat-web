import { buildTimeline, totalElapsedMs, type TimelineStep } from './activity'
import { isTerminal } from './chatState'
import type { ActivityEvent, ChatAssistantMessage } from './chatTypes'

/** A tool line's state as shown: `stopped` is a step the user stopped, `failed` one the turn died in. */
export type ToolStatus = 'running' | 'done' | 'failed' | 'stopped'

export interface ToolView {
  id: string
  title: string
  detail: string | null
  status: ToolStatus
  /** Real elapsed time in ms; null when the backend gave no end and the turn is over. */
  elapsedMs: number | null
}

export type TranscriptBlock =
  | { type: 'thought'; id: string; title: string }
  | { type: 'say'; id: string; text: string }
  | { type: 'tools'; id: string; tools: ToolView[] }

export interface LiveLine {
  id: string
  title: string
  detail: string | null
  elapsedMs: number
}

export interface Transcript {
  /** `activity` = the backend sent a transcript; `timeline` = older backend, show the four-step list instead. */
  source: 'activity' | 'timeline'
  blocks: TranscriptBlock[]
  /** The tool running right now (only while the turn is). */
  live: LiveLine | null
  toolCount: number
  totalMs: number | null
  /** Filled for `timeline` only. */
  steps: TimelineStep[]
}

/**
 * Pure: one assistant message -> the linear transcript. Real data only. Consecutive tool events fold into one
 * "Used N tools" block, thoughts and narration stay in order. When the turn is over, any event the backend left
 * `running` is shown as done / failed / stopped according to how the turn ended. With no `activity` the old
 * four-step timeline is returned for the caller to render.
 */
export function buildTranscript(msg: ChatAssistantMessage, now: number): Transcript {
  const events = msg.activity ?? []
  const totalMs = totalElapsedMs(msg, now)
  if (events.length === 0) {
    return { source: 'timeline', blocks: [], live: null, toolCount: 0, totalMs, steps: buildTimeline(msg, now) }
  }
  const over = isTerminal(msg.status)
  const end = msg.finishedAt ?? null
  const endState: ToolStatus = msg.status === 'failed' ? 'failed' : msg.status === 'cancelled' ? 'stopped' : 'done'

  const view = (e: ActivityEvent): ToolView => {
    const status: ToolStatus = e.state === 'running' ? (over ? endState : 'running') : e.state
    const stop = e.endedAt ?? (status === 'running' ? now : over ? end : null)
    return {
      id: e.id,
      title: e.title,
      detail: e.detail,
      status,
      elapsedMs: stop === null ? null : Math.max(0, stop - e.at),
    }
  }

  const blocks: TranscriptBlock[] = []
  let live: LiveLine | null = null
  let toolCount = 0
  for (const e of events) {
    if (e.kind === 'thought') blocks.push({ type: 'thought', id: e.id, title: e.title })
    else if (e.kind === 'say') blocks.push({ type: 'say', id: e.id, text: e.title })
    else {
      const tool = view(e)
      toolCount += 1
      const last = blocks[blocks.length - 1]
      if (last?.type === 'tools') last.tools.push(tool)
      else blocks.push({ type: 'tools', id: `tools:${e.id}`, tools: [tool] })
      if (tool.status === 'running') {
        live = { id: e.id, title: e.title, detail: e.detail, elapsedMs: tool.elapsedMs ?? 0 }
      }
    }
  }
  return { source: 'activity', blocks, live, toolCount, totalMs, steps: [] }
}
