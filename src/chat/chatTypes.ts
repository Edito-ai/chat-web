/** Shapes shared by the chat-edit store, its API adapters and the screen. */

/** One step entry the backend recorded for the current turn (`at` is epoch ms). */
export interface StageEvent {
  state: string
  stage: string | null
  at: number
}

/** One line of the turn's transcript, written by the backend from real pipeline facts (times are epoch ms). */
export interface ActivityEvent {
  /** Stable key, e.g. `tool:step:look`, `thought:review`; the fixed ones are translated by id. */
  id: string
  kind: 'thought' | 'say' | 'tool'
  title: string
  detail: string | null
  state: 'running' | 'done' | 'failed'
  at: number
  endedAt: number | null
}

/** What the edit saw in the footage before editing, and the before / after frame sheets (backend2). */
export interface ChatAnalysis {
  seen: { peopleMax: number; mainItem: string; items: string[]; text: string[]; places: string[] } | null
  beforeSheet: string | null
  /** The final look, drawn from the plan while the video renders. */
  plannedSheet: string | null
  afterSheet: string | null
  review: { summary: string | null; problems: { scene: string; problems: string[]; note: string }[] } | null
}

export type ChatJobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'

/** What a finished job hands back. */
export interface ChatJobResult {
  /** Playable URL of the finished video. */
  videoUrl: string
  /** Where the Download button points; falls back to `videoUrl`. */
  downloadUrl: string | null
  fileName: string | null
}

/** A quick reply under an assistant message. `upload` opens the file picker, `library` the library, `send` sends `prompt`. */
export interface ChatSuggestion {
  id: string
  label: string
  action: 'upload' | 'library' | 'send'
  prompt?: string | null
}

/** One template on offer (backend2): a still of the user's own video in that template. */
export interface LookOption {
  id: string
  label: string
  desc: string
  /** The template the editor recommends; the one taken when the user does not choose in time. */
  best: boolean
  imageUrl: string
}

/**
 * The templates the backend is waiting on right now, from the stock every user shares. `options` may be empty (an empty
 * stock): the link / upload box under them is still shown. `secondsLeft` was true at `receivedAt` (epoch ms): count down from there.
 */
export interface LookChoice {
  open: boolean
  secondsLeft: number
  seconds: number
  receivedAt: number
  options: LookOption[]
}

/** The user's answer to the template chooser: one of the offered templates, none, a link to copy, an uploaded reference, or "wait for me". */
export type LookAnswer = { look: string } | { skip: true } | { url: string } | { referenceVideoId: string } | { hold: true }

/** One poll of a job, already normalised by the adapter. */
export interface ChatJobSnapshot {
  jobId: string
  status: ChatJobStatus
  /** Backend stage id (`analyzing`, `rendering` ...); unknown ids render the generic label. */
  stage: string | null
  /** 0..1 when the backend knows, else null (indeterminate bar). */
  progress: number | null
  /** Server-written progress line, shown instead of the stage label when present. */
  message: string | null
  result: ChatJobResult | null
  /** Plain-language failure reason (only with status `failed`). */
  error: string | null
  /** 1 = first edit, +1 per follow-up. A job is one chat; each turn gets its own assistant message. */
  turn: number
  /** Assistant sentence for a finished turn ("Made captions bigger and kept the cut."). */
  reply: string | null
  /** Backend ids of the videos this job edits (lets a retry after a failed first turn skip re-uploading). */
  videoIds: string[]
  /** A follow-up may be sent now. */
  canFollowUp: boolean
  /** `chat` = a plain reply (no video), `graphics` = built without footage; anything else is an edit. */
  kind?: string
  /** Quick replies for the finished turn. */
  suggestions?: ChatSuggestion[]
  /** The project the conversation lives in (it can move when footage from the library is added). */
  projectId?: string | null
  /** Real step-entry times of the current turn (older backends send none). */
  stageTimings?: StageEvent[]
  analysis?: ChatAnalysis | null
  /** Epoch ms the turn began: first recorded step, else the job's creation for turn 1. */
  startedAt?: number | null
  /** Epoch ms of the job's last write (the finish time once terminal). */
  updatedAt?: number | null
  /** Server-measured length of the finished turn, in seconds. */
  durationSec?: number | null
  /** The turn's transcript (thoughts, narration, tool steps); empty from older backends. */
  activity?: ActivityEvent[]
  /** Templates waiting for a pick (backend2 only); null/absent when none are on offer. */
  lookChoice?: LookChoice | null
}

export interface CreateChatJobInput {
  projectId: string
  /** Backend ids of the videos uploaded for THIS message (empty on a follow-up). */
  videoIds: string[]
  prompt: string
  /** A saved style the edit follows (backend2 only). */
  styleId?: string
  /** A video whose LOOK is read into a new template and followed (backend2 only). */
  referenceVideoId?: string
  /** The same, given as a link (an Instagram reel, a YouTube short ...). */
  referenceUrl?: string
}

/** Style options a follow-up may carry (backend2 only). */
export interface StyleOptions {
  styleId?: string
  referenceVideoId?: string
  referenceUrl?: string
}

/** The seam between the chat screen and whichever backend answers. */
export interface ChatApi {
  /** Starts a new job; resolves with its first snapshot. */
  createJob(input: CreateChatJobInput, signal?: AbortSignal): Promise<ChatJobSnapshot>
  /** Starts the next turn of a finished job; resolves with the new turn's first snapshot. */
  followUp(jobId: string, prompt: string, signal?: AbortSignal, videoIds?: string[], style?: StyleOptions): Promise<ChatJobSnapshot>
  getJob(jobId: string, signal?: AbortSignal): Promise<ChatJobSnapshot>
  cancelJob(jobId: string): Promise<ChatJobSnapshot>
  /** The user's answer to the template chooser (backend2 only). Rejects with the server's reason, e.g. a link that cannot be opened. */
  answerLook?(jobId: string, answer: LookAnswer): Promise<void>
}

export interface ChatUserMessage {
  id: string
  role: 'user'
  text: string
  /** File names uploaded with this message. */
  attachments: string[]
}

export interface ChatAssistantMessage {
  id: string
  role: 'assistant'
  jobId: string
  turn: number
  status: ChatJobStatus
  stage: string | null
  progress: number | null
  message: string | null
  /** The assistant sentence for a finished turn, when the backend wrote one. */
  reply: string | null
  result: ChatJobResult | null
  error: string | null
  /** Real step-entry times of this turn, when the backend reported them. */
  timings?: StageEvent[]
  startedAt?: number | null
  finishedAt?: number | null
  durationSec?: number | null
  /** The turn's transcript, when the backend reported one. */
  activity?: ActivityEvent[]
  /** Templates waiting for the user's pick, while the turn is running. */
  lookChoice?: LookChoice | null
  /** What was seen in the footage and the before / after frame sheets. */
  analysis?: ChatAnalysis | null
  /** `chat` = this turn is a plain reply, with no video behind it. */
  kind?: string
  suggestions?: ChatSuggestion[]
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage
