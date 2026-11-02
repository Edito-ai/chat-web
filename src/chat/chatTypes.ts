/** Shapes shared by the chat-edit store, its API adapters and the screen. */

export type ChatJobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'

/** What a finished job hands back. */
export interface ChatJobResult {
  /** Playable URL of the finished video. */
  videoUrl: string
  /** Where the Download button points; falls back to `videoUrl`. */
  downloadUrl: string | null
  fileName: string | null
}

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
}

export interface CreateChatJobInput {
  projectId: string
  /** Backend ids of the videos uploaded for THIS message (empty on a follow-up). */
  videoIds: string[]
  prompt: string
}

/** The seam between the chat screen and whichever backend answers. */
export interface ChatApi {
  /** Starts a new job; resolves with its first snapshot. */
  createJob(input: CreateChatJobInput, signal?: AbortSignal): Promise<ChatJobSnapshot>
  /** Starts the next turn of a finished job; resolves with the new turn's first snapshot. */
  followUp(jobId: string, prompt: string, signal?: AbortSignal): Promise<ChatJobSnapshot>
  getJob(jobId: string, signal?: AbortSignal): Promise<ChatJobSnapshot>
  cancelJob(jobId: string): Promise<ChatJobSnapshot>
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
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage
