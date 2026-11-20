import { apiClient } from '@/lib/apiClient'
import { toClips, toClipsSource } from './clips'
import type { ActivityEvent, ChatAnalysis, ChatApi, ChatJobSnapshot, ChatJobStatus, FramesReview, LookChoice, StageEvent, ChatSuggestion } from './chatTypes'

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
  /** Made with this account on the other server (`prod` / `dev`): read only here. */
  remote?: string | null
  projectId?: string
  title?: string | null
  stageTimings?: { state: string; stage?: string | null; at: string }[]
  kind?: string
  /** Waiting for the answer about where an attached picture goes. */
  placementOpen?: boolean
  placementQuestion?: string | null
  /** Pinned to the top of the chat list. */
  pinned?: boolean
  suggestions?: { id: string; label: string; action: string; prompt?: string | null }[]
  turns?: {
    turn: number
    prompt: string
    /** Names of what that message carried (videos, pictures); shown on the message after a reload. */
    attachments?: string[]
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
  /** What the edit saw before editing, and the frame sheets (backend2). */
  analysis?: {
    seen?: { people_max?: number; main_item?: string; items?: { name?: string }[]; text?: string[]; places?: string[] } | null
    beforeSheet?: string | null
    plannedSheet?: string | null
    afterSheet?: string | null
    review?: { summary?: string | null; problems?: { scene?: string; problems?: string[]; note?: string }[] } | null
  } | null
  /** Templates on offer right now (backend2). */
  lookChoice?: {
    open?: boolean
    secondsLeft?: number
    seconds?: number
    options?: { id?: string; label?: string; desc?: string; best?: boolean; imageUrl?: string }[]
  } | null
  /** The final frames before the render (backend2): continue, or type a change. */
  framesReview?: {
    open?: boolean
    secondsLeft?: number
    seconds?: number
    round?: number
    frames?: { n?: number; t?: number; template?: string; imageUrl?: string }[]
  } | null
  /** Stream clipping (kind `clips`): the clips, best first, and the footage they came from. */
  clips?: unknown[]
  source?: unknown
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

/** Wire analysis -> the typed one; anything malformed becomes null / empty, never an error. */
export function toAnalysis(raw: ChatJobWire['analysis']): ChatAnalysis | null {
  if (!raw) return null
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const s = raw.seen
  return {
    seen: s
      ? {
          peopleMax: typeof s.people_max === 'number' ? s.people_max : 0,
          mainItem: str(s.main_item) ?? '',
          items: (s.items ?? []).map((i) => str(i?.name)).filter((x): x is string => !!x),
          text: (s.text ?? []).filter((x): x is string => typeof x === 'string' && !!x),
          places: (s.places ?? []).filter((x): x is string => typeof x === 'string' && !!x),
        }
      : null,
    beforeSheet: str(raw.beforeSheet),
    plannedSheet: str(raw.plannedSheet),
    afterSheet: str(raw.afterSheet),
    review: raw.review
      ? {
          summary: str(raw.review.summary),
          problems: (raw.review.problems ?? [])
            .filter((p) => typeof p?.scene === 'string')
            .map((p) => ({ scene: p.scene!, problems: (p.problems ?? []).filter((x) => typeof x === 'string'), note: p.note ?? '' })),
        }
      : null,
  }
}

/** Wire template choice -> the typed one; malformed options are dropped. No options is still a choice: the link / upload box. */
export function toLookChoice(raw: ChatJobWire['lookChoice'], receivedAt = Date.now()): LookChoice | null {
  if (!raw || raw.open !== true) return null
  const options = (raw.options ?? [])
    .filter((o) => typeof o.id === 'string' && typeof o.label === 'string' && typeof o.imageUrl === 'string')
    .map((o) => ({ id: o.id!, label: o.label!, desc: o.desc ?? '', best: o.best === true, imageUrl: o.imageUrl! }))
  const secondsLeft = typeof raw.secondsLeft === 'number' ? Math.max(0, raw.secondsLeft) : 0
  return { open: true, secondsLeft, seconds: typeof raw.seconds === 'number' ? raw.seconds : secondsLeft, receivedAt, options }
}

/** Wire final frames -> the typed ones; frames without a picture are dropped, and no frames means nothing to show. */
export function toFramesReview(raw: ChatJobWire['framesReview'], receivedAt = Date.now()): FramesReview | null {
  if (!raw || raw.open !== true) return null
  const frames = (raw.frames ?? [])
    .filter((f) => typeof f.imageUrl === 'string' && typeof f.n === 'number')
    .map((f) => ({ n: f.n!, t: typeof f.t === 'number' ? f.t : 0, template: f.template ?? '', imageUrl: f.imageUrl! }))
  if (frames.length === 0) return null
  const secondsLeft = typeof raw.secondsLeft === 'number' ? Math.max(0, raw.secondsLeft) : 0
  return {
    open: true, secondsLeft, seconds: typeof raw.seconds === 'number' ? raw.seconds : secondsLeft, receivedAt,
    round: typeof raw.round === 'number' ? raw.round : 1, frames,
  }
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
    remote: w.remote ?? null,
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
    analysis: toAnalysis(w.analysis),
    lookChoice: status === 'running' ? toLookChoice(w.lookChoice) : null,
    ...(w.kind === 'clips' ? { clips: toClips(w.clips), source: toClipsSource(w.source) } : {}),
    placementOpen: w.placementOpen ?? false,
    placementQuestion: w.placementQuestion ?? null,
    framesReview: status === 'running' ? toFramesReview(w.framesReview) : null,
  }
}

const jobPath = (id: string) => `/chat/jobs/${encodeURIComponent(id)}`

export const httpChatApi: ChatApi = {
  async createJob(input, signal) {
    return toSnapshot(
      (await apiClient.post(
        '/chat/jobs',
        {
          projectId: input.projectId, videoIds: input.videoIds, prompt: input.prompt,
          ...(input.styleId ? { styleId: input.styleId } : {}),
          ...(input.referenceVideoId ? { referenceVideoId: input.referenceVideoId } : {}),
          ...(input.referenceUrl ? { referenceUrl: input.referenceUrl } : {}),
          ...(input.kind === 'clips'
            ? { kind: 'clips', ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}), ...(input.clips ? { clips: input.clips } : {}) }
            : {}),
          ...(input.overlayIds?.length ? { overlayIds: input.overlayIds } : {}),
        },
        { signal },
      )) as ChatJobWire,
    )
  },
  async followUp(jobId, prompt, signal, videoIds, style, overlayIds) {
    const body = {
      prompt,
      ...(videoIds && videoIds.length > 0 ? { videoIds } : {}),
      ...(overlayIds && overlayIds.length > 0 ? { overlayIds } : {}),
      ...(style ?? {}),
    }
    return toSnapshot((await apiClient.post(`${jobPath(jobId)}/followup`, body, { signal })) as ChatJobWire)
  },
  async getJob(jobId, signal) {
    return toSnapshot((await apiClient.get(jobPath(jobId), { signal })) as ChatJobWire)
  },
  async cancelJob(jobId) {
    return toSnapshot((await apiClient.post(`${jobPath(jobId)}/cancel`)) as ChatJobWire)
  },
  async answerLook(jobId, answer) {
    await apiClient.post(`${jobPath(jobId)}/look`, answer)
  },
  async answerFrames(jobId, answer) {
    await apiClient.post(`${jobPath(jobId)}/frames`, answer)
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
