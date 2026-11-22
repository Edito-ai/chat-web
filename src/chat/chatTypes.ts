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

/** One frame of the edit as it will look, drawn from the plan before the video is rendered (backend2). */
export interface ReviewFrame {
  /** 1-based, the number the user can name in a change ("frame 3"). */
  n: number
  /** Seconds into the edit. */
  t: number
  template: string
  imageUrl: string
}

/**
 * The final frames, shown before the full-size render: the job waits for "continue" (render) or a typed change (re-plan,
 * frames again). Renders by itself when `secondsLeft` runs out; that was true at `receivedAt` (epoch ms).
 */
export interface FramesReview {
  open: boolean
  secondsLeft: number
  seconds: number
  receivedAt: number
  /** 1 = first look, 2+ = after a change. */
  round: number
  frames: ReviewFrame[]
  /** The same edit playing live on this device (no video is rendered for it); null until the server has its files ready. */
  player: LivePlayer | null
}

/** The live preview page (backend2 renderer/player) for one version of the plan. */
export interface LivePlayer {
  url: string
  /** Changes when the plan changes (a change typed on the frames): the page is loaded again. */
  version: string
  /** What the page downloads before it plays, in bytes (0 = unknown). */
  bytes: number
}

/** The user's answer to the template chooser: one of the offered templates, none, a link to copy, an uploaded reference, or "wait for me". */
export type LookAnswer = { look: string } | { skip: true } | { url: string } | { referenceVideoId: string } | { hold: true }

/** One clip of a stream-clipping chat (backend2, kind `clips`). Times are seconds from the start of the stream. */
export interface ClipItem {
  id: string
  start: number
  end: number
  durationSec: number
  title: string
  /** Why this moment works, in a few words. */
  reason: string
  /** 0..100, best first. */
  score: number | null
  /** What is said in the clip (the trim view and the card show it). */
  text: string
  /** `ready`, `cutting` (being re-cut after a trim) or `failed`. */
  state: 'ready' | 'cutting' | 'failed' | 'pending'
  error: string | null
  version: number
  videoUrl: string | null
  thumbUrl: string | null
  downloadUrl: string | null
  downloadFilename: string
  /** The clip with its look applied (captions / music / effects), once one was asked for. */
  styled: ClipStyled | null
}

/** A clip with captions, music or effects: being rendered, ready (with its links) or failed (with the reason). */
export interface ClipStyled {
  state: 'rendering' | 'ready' | 'failed'
  version: number
  error: string | null
  /** The captions are burnt in (false when captions were off, or the clip has no words). */
  captions: boolean
  /** The clip has no speech, so there was nothing to caption. */
  noWords: boolean
  videoUrl: string | null
  downloadUrl: string | null
  downloadFilename: string
}

/** The footage a clipping chat was made from. */
export interface ClipsSource {
  kind: 'upload' | 'link'
  title: string
  durationSec: number | null
  /** The YouTube / Twitch page the stream came from (a link chat). */
  url?: string | null
}

/** What the person asks of a clipping run: how many clips, and how long each may be. */
export interface ClipOptions {
  count: number
  minSec: number
  maxSec: number
  /** A link that is still live: how many of its last minutes are recorded and clipped. */
  liveMin: number
}

/** One choice of a question the backend asks. */
export interface QuestionOption {
  id: string
  label: string
  hint: string | null
  recommended: boolean
  imageUrl: string | null
}

/**
 * A question the backend asks instead of guessing (any job state, even before anything runs). The job waits for the
 * answer: a click on an option, a typed line, an upload or a link, as allowed here.
 */
export interface ChatQuestion {
  id: string
  kind: 'intent' | 'look' | 'clarify' | 'clips_settings' | 'elements'
  text: string
  options: QuestionOption[]
  /** Checkboxes + a confirm button; else one click answers. */
  multi: boolean
  allowText: boolean
  allowUpload: boolean
  allowLink: boolean
}

/** Body of `POST /chat/jobs/{id}/answer`. */
export interface QuestionAnswer {
  questionId: string
  optionIds: string[]
  text: string | null
  videoId: string | null
  link: string | null
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
  /** Made on the other server (`prod` / `dev`) with this account: shown read only, it cannot be continued here. */
  remote?: string | null
  /** `chat` = a plain reply (no video), `graphics` = built without footage; anything else is an edit. */
  kind?: string
  /** Quick replies for the finished turn. */
  suggestions?: ChatSuggestion[]
  /** The project the conversation lives in (it can move when footage from the library is added). */
  projectId?: string | null
  /** Real step-entry times of the current turn (older backends send none). */
  stageTimings?: StageEvent[]
  analysis?: ChatAnalysis | null
  /** The job waits for the answer about where a picture goes (the next message is the answer). */
  placementOpen?: boolean
  placementQuestion?: string | null
  /** The final frames wait for "continue" or a change (the next message is the change). */
  framesReview?: FramesReview | null
  /** The question the backend waits on, whatever the job state; null = none. */
  question?: ChatQuestion | null
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
  /** The clips of a stream-clipping chat (kind `clips`), best first. */
  clips?: ClipItem[]
  source?: ClipsSource | null
}

export interface CreateChatJobInput {
  projectId: string
  /** Backend ids of the videos uploaded for THIS message (empty on a follow-up). */
  videoIds: string[]
  prompt: string
  /** A picture (logo, photo) the edit places in the video (backend2 only). */
  overlayIds?: string[]
  /** The chat this message was typed in, when its last job is over and cannot take a follow-up (a plain reply, a failed or
   *  cancelled edit, clips): the backend starts the new job as that chat's next turn instead of a new chat. */
  chatId?: string
}

/** The seam between the chat screen and whichever backend answers. */
export interface ChatApi {
  /** Starts a new job; resolves with its first snapshot. */
  createJob(input: CreateChatJobInput, signal?: AbortSignal): Promise<ChatJobSnapshot>
  /** Starts the next turn of a finished job; resolves with the new turn's first snapshot. */
  followUp(jobId: string, prompt: string, signal?: AbortSignal, videoIds?: string[], overlayIds?: string[]): Promise<ChatJobSnapshot>
  getJob(jobId: string, signal?: AbortSignal): Promise<ChatJobSnapshot>
  cancelJob(jobId: string): Promise<ChatJobSnapshot>
  /** The user's answer to the template chooser (backend2 only). Rejects with the server's reason, e.g. a link that cannot be opened. */
  answerLook?(jobId: string, answer: LookAnswer): Promise<void>
  /** The final frames are fine: render the video. */
  answerFrames?(jobId: string, answer: { continue: true }): Promise<void>
  /** The user's answer to the question the backend asked (`question` on the job). Rejects with an ApiError (409 = no longer open). */
  answer?(jobId: string, body: QuestionAnswer): Promise<ChatJobSnapshot>
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
  /** The job asks where an attached picture goes; the user's next message is the answer (backend2 only). */
  placementQuestion?: string | null
  /** The final frames, waiting for "continue" or a typed change before the render (backend2 only). */
  framesReview?: FramesReview | null
  /** The backend's question, waiting for a click / a typed line (the card is shown until it is answered). */
  question?: ChatQuestion | null
  /** What was seen in the footage and the before / after frame sheets. */
  analysis?: ChatAnalysis | null
  /** `chat` = this turn is a plain reply, with no video behind it. */
  kind?: string
  suggestions?: ChatSuggestion[]
  /** The clips, when this is a stream-clipping turn. */
  clips?: ClipItem[]
  source?: ClipsSource | null
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage
