import { apiClient } from '@/lib/apiClient'
import { newAssistant } from './chatState'
import { toSnapshot, type ChatJobWire } from './chatApi'
import type { ChatAssistantMessage, ChatMessage } from './chatTypes'

export type HistoryStatus = 'running' | 'complete' | 'failed'

export interface HistoryItem {
  jobId: string
  title: string
  status: HistoryStatus
  /** Epoch ms of the job's creation: groups the list. */
  createdAt: number
  /** Epoch ms of the last change: the time shown. */
  updatedAt: number
}

export type HistoryGroupId = 'today' | 'yesterday' | 'week' | 'older'
export const GROUP_ORDER: readonly HistoryGroupId[] = ['today', 'yesterday', 'week', 'older']

const MAX_TITLE = 60

/** One-line list label from a prompt; '' when there is nothing to show. */
export function deriveTitle(prompt: string | null | undefined, max = MAX_TITLE): string {
  const text = (prompt ?? '').replace(/\s+/g, ' ').trim()
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

export function historyStatus(state: string | undefined): HistoryStatus {
  if (state === 'complete') return 'complete'
  if (state === 'failed' || state === 'cancelled') return 'failed'
  return 'running'
}

/** Wire job -> list row. The backend title wins; the first turn's prompt is the fallback. */
export function toHistoryItem(w: ChatJobWire): HistoryItem {
  const created = Date.parse(w.createdAt ?? '')
  const updated = Date.parse(w.updatedAt ?? '')
  const createdAt = Number.isFinite(created) ? created : Number.isFinite(updated) ? updated : 0
  return {
    jobId: w.id,
    title: deriveTitle(w.title ?? w.turns?.[0]?.prompt),
    status: historyStatus(w.state),
    createdAt,
    updatedAt: Number.isFinite(updated) ? updated : createdAt,
  }
}

const startOfDay = (t: number): number => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function groupOf(createdAt: number, now: number): HistoryGroupId {
  const today = startOfDay(now)
  if (createdAt >= today) return 'today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (createdAt >= yesterday.getTime()) return 'yesterday'
  const week = new Date(today)
  week.setDate(week.getDate() - 7)
  return createdAt >= week.getTime() ? 'week' : 'older'
}

/** Newest first, split into Today / Yesterday / Previous 7 days / Older; empty groups are left out. */
export function groupHistory(
  items: readonly HistoryItem[],
  now: number,
): { id: HistoryGroupId; items: HistoryItem[] }[] {
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt)
  return GROUP_ORDER.map((id) => ({ id, items: sorted.filter((i) => groupOf(i.createdAt, now) === id) })).filter(
    (g) => g.items.length > 0,
  )
}

/**
 * Rebuilds a conversation from one full job: a user + assistant message per recorded turn, then the turn still
 * running (if any). Only the newest turn gets a playable link; older turns stay as text.
 */
export function rebuildMessages(w: ChatJobWire): ChatMessage[] {
  const snap = toSnapshot(w)
  const current = w.turn ?? 1
  const out: ChatMessage[] = []
  for (const t of w.turns ?? []) {
    out.push({ id: `${w.id}:${t.turn}:u`, role: 'user', text: t.prompt, attachments: [] })
    out.push({
      ...newAssistant(`${w.id}:${t.turn}:a`, w.id, t.turn),
      status: t.state === 'complete' ? 'complete' : t.state === 'cancelled' ? 'cancelled' : 'failed',
      reply: t.reply ?? null,
      progress: 1,
      durationSec: t.durationSec ?? null,
    })
  }
  const last = out[out.length - 1]
  if (!(last?.role === 'assistant' && last.turn === current)) {
    // The turn that is running now. Its prompt is only known for the first turn (it is the job's title).
    const prompt = current === 1 ? (w.title ?? '') : ''
    if (prompt) out.push({ id: `${w.id}:${current}:u`, role: 'user', text: prompt, attachments: [] })
    out.push(newAssistant(`${w.id}:${current}:a`, w.id, current))
  }
  return out.map((m): ChatMessage => {
    if (m.role !== 'assistant' || m.turn !== current) return m
    const a: ChatAssistantMessage = m
    if (snap.status === 'complete' && snap.result) {
      return {
        ...a, status: 'complete', result: snap.result, reply: snap.reply ?? a.reply,
        durationSec: snap.durationSec ?? a.durationSec ?? null, timings: snap.stageTimings, activity: snap.activity,
        startedAt: snap.startedAt ?? null, finishedAt: snap.updatedAt ?? null,
      }
    }
    if (snap.status === 'running' || snap.status === 'queued') {
      return {
        ...a, status: snap.status, stage: snap.stage, progress: snap.progress, message: snap.message,
        timings: snap.stageTimings, activity: snap.activity, startedAt: snap.startedAt ?? null,
      }
    }
    return a.status === 'failed' ? { ...a, error: snap.error } : a
  })
}

// --- network (kept apart from ChatApi so existing fakes of that seam are untouched) ---------------------------------

export interface HistoryApi {
  list(limit: number, signal?: AbortSignal): Promise<ChatJobWire[]>
  get(jobId: string, signal?: AbortSignal): Promise<ChatJobWire>
}

export const httpHistoryApi: HistoryApi = {
  list: async (limit, signal) => (await apiClient.get(`/chat/jobs?limit=${limit}`, { signal })) as ChatJobWire[],
  get: async (jobId, signal) =>
    (await apiClient.get(`/chat/jobs/${encodeURIComponent(jobId)}`, { signal })) as ChatJobWire,
}

let current: HistoryApi | null = null
export const getHistoryApi = (): HistoryApi => (current ??= httpHistoryApi)
export const setHistoryApi = (api: HistoryApi | null): void => {
  current = api
}
