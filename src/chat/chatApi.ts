import { apiClient } from '@/lib/apiClient'
import type { ChatApi, ChatJobSnapshot, ChatJobStatus } from './chatTypes'

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
}

const TERMINAL: Record<string, ChatJobStatus> = { complete: 'complete', failed: 'failed', cancelled: 'cancelled' }

/** Wire -> snapshot. `state` is also the stage key (analyzing | planning | assembling | rendering). */
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
  async followUp(jobId, prompt, signal) {
    return toSnapshot((await apiClient.post(`${jobPath(jobId)}/followup`, { prompt }, { signal })) as ChatJobWire)
  },
  async getJob(jobId, signal) {
    return toSnapshot((await apiClient.get(jobPath(jobId), { signal })) as ChatJobWire)
  },
  async cancelJob(jobId) {
    return toSnapshot((await apiClient.post(`${jobPath(jobId)}/cancel`)) as ChatJobWire)
  },
}

let current: ChatApi | null = null

export function getChatApi(): ChatApi {
  return (current ??= httpChatApi)
}

export function setChatApi(api: ChatApi | null): void {
  current = api
}
