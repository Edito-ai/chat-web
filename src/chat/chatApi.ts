import { apiClient } from '@/lib/apiClient'
import type { ActivityEvent, ChatApi, ChatJobSnapshot, ChatJobStatus, StageEvent, ChatSuggestion } from './chatTypes'

/** The adapter the chat store talks to: the real `/chat/*` backend. Tests inject their own via `setChatApi`. */

/** The wire shape of `ChatJobOut`; only the fields the screen uses. Unknown fields are ignored. */
export interface ChatJobWire {
  id: string
  videoIds?: string[]
  state?: string
  message?: string | null
  progress?: number | null
  turn?: number
  reply?: string | null
  previewUrl?: string | null
  downloadUrl?: string | null
  downloadFilename?: string | null
  error?: string | null
  canFollowUp?: boolean
  projectId?: string
  title?: string | null
  stageTimings?: { state: string; stage?: string | null; at: string }[]
  kind?: string
  /** Pinned to the top of the chat list. */
  pinned?: boolean
  suggestions?: { id: string; label: string; action: string; prompt?: string | null }[]
  turns?: {
    turn: number
    prompt: string
    kind?: string
    reply?: string | null
    state: string
    durationSec?: number | null
    suggestions?: { id: string; label: string; action: string; prompt?: string | null }[]
  }[]
  activity?: {
    id: string
    kind: string
    title: string
    detail?: string | null
    state: string
    at: string
    endedAt?: string | null
  }[]
  createdAt?: string
  updatedAt?: string
}

const ms = (iso: string | undefined | null): number | null => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : null
}

/** Wire activity -> events; a malformed or unknown-kind entry is dropped, never an error. */
export function toActivity(raw: ChatJobWire['activity']): ActivityEvent[] {
  const out: ActivityEvent[] = []
  for (const e of raw ?? []) {
    const at = ms(e?.at)
    const kind = e?.kind
    const state = e?.state
    if (at === null || typeof e.id !== 'string' || typeof e.title !== 'string') continue
    if (kind !== 'thought' && kind !== 'say' && kind !== 'tool') continue
    if (state !== 'running' && state !== 'done' && state !== 'failed') continue
    out.push({ id: e.id, kind, title: e.title, detail: e.detail ?? null, state, at, endedAt: ms(e.endedAt) })
  }
  return out
}

const TERMINAL: Record<string, ChatJobStatus> = { complete: 'complete', failed: 'failed', cancelled: 'cancelled' }

/** Wire -> snapshot. `state` is also the stage key (analyzing | planning | assembling | rendering). */
const ACTIONS = ['upload', 'library', 'send'] as const

/** Quick replies from the wire: unknown actions are dropped, never shown as dead buttons. */
export function toSuggestions(raw: { id: string; label: string; action: string; prompt?: string | null }[] | undefined): ChatSuggestion[] {
  return (raw ?? [])
    .filter((s) => (ACTIONS as readonly string[]).includes(s.action) && s.label)
    .map((s) => ({ id: s.id, label: s.label, action: s.action as ChatSuggestion['action'], prompt: s.prompt ?? null }))
}

export function toSnapshot(w: ChatJobWire): ChatJobSnapshot {
  const state = w.state ?? 'queued'
  const status: ChatJobStatus = TERMINAL[state] ?? (state === 'queued' ? 'queued' : 'running')
  const videoUrl = w.previewUrl ?? w.downloadUrl ?? null
  return {
    jobId: w.id,
    status,
    stage: status === 'running' || status === 'queued' ? state : null,
    progress: typeof w.progress === 'number' ? w.progress : null,
    message: w.message ?? null,
    result:
      status === 'complete' && videoUrl
        ? { videoUrl, downloadUrl: w.downloadUrl ?? null, fileName: w.downloadFilename ?? null }
        : null,
    error: w.error ?? null,
    turn: w.turn ?? 1,
    reply: w.reply ?? null,
    videoIds: w.videoIds ?? [],
    canFollowUp: w.canFollowUp ?? false,
    kind: w.kind,
    suggestions: toSuggestions(w.suggestions),
    projectId: w.projectId ?? null,
    stageTimings: (w.stageTimings ?? [])
      .map((e) => ({ state: e.state, stage: e.stage ?? null, at: ms(e.at) }))
      .filter((e): e is StageEvent => e.at !== null),
    startedAt: ms(w.stageTimings?.[0]?.at) ?? ((w.turn ?? 1) === 1 ? ms(w.createdAt) : null),
    updatedAt: ms(w.updatedAt),
    durationSec: w.turns?.find((t) => t.turn === (w.turn ?? 1))?.durationSec ?? null,
    activity: toActivity(w.activity),
  }
}

const jobPath = (id: string) => `/chat/jobs/${encodeURIComponent(id)}`

export const httpChatApi: ChatApi = {
  async createJob(input, signal) {
    return toSnapshot(
      (await apiClient.post(
        '/chat/jobs',
        { projectId: input.projectId, videoIds: input.videoIds, prompt: input.prompt },
        { signal },
      )) as ChatJobWire,
    )
  },
  async followUp(jobId, prompt, signal, videoIds) {
    const body = videoIds && videoIds.length > 0 ? { prompt, videoIds } : { prompt }
    return toSnapshot((await apiClient.post(`${jobPath(jobId)}/followup`, body, { signal })) as ChatJobWire)
  },
  async getJob(jobId, signal) {
    return toSnapshot((await apiClient.get(jobPath(jobId), { signal })) as ChatJobWire)
  },
  async cancelJob(jobId) {
    return toSnapshot((await apiClient.post(`${jobPath(jobId)}/cancel`)) as ChatJobWire)
  },
}

export interface LibraryVideo {
  id: string
  name: string
  durationSec: number
  projectId: string
  createdAt: string
}

/** The person's library: every video they uploaded, newest first. */
export async function fetchLibrary(signal?: AbortSignal): Promise<{ items: LibraryVideo[]; total: number }> {
  const raw = (await apiClient.get('/chat/library?limit=50', { signal })) as { items?: LibraryVideo[]; total?: number }
  return { items: raw.items ?? [], total: raw.total ?? 0 }
}

let current: ChatApi | null = null

export function getChatApi(): ChatApi {
  return (current ??= httpChatApi)
}

export function setChatApi(api: ChatApi | null): void {
  current = api
}
