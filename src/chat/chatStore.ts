import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuth } from '@/auth/authStore'
import { ApiError } from '@/lib/apiClient'
import { userMessage } from '@/lib/friendlyError'
import { getChatApi, toSnapshot, type LibraryVideo } from './chatApi'
import { createChatProject, deleteAsset, uploadPicture, uploadVideo } from './chatUploads'
import { looksLikeVideo, probeVideo, type VideoProbe } from './probe'
import { shapeFor } from './projectShape'
import {
  activeAssistant, applySnapshot, capMessages, finishLocally, isTerminal, lastCompleted, newAssistant,
} from './chatState'
import type { ChatAssistantMessage, ChatJobSnapshot, ChatMessage, ChatQuestion, ClipItem, QuestionAnswer, QueuedMessage } from './chatTypes'
import { getClipsApi, type ClipPatch } from './clips'

/** How often a clip's render (captions / music / effects) is checked, and for how long at most. */
export const STYLE_POLL_MS = 2000
const STYLE_MAX_POLLS = 150
import { getHistoryApi, rebuildMessages, toHistoryItem, type HistoryItem } from './history'
import { getMusicApi, type MusicChoice } from './music'

/** Time between polls; a failing poll backs off (x2 per miss) up to MAX_BACKOFF_MS. */
export const POLL_MS = 2000
const MAX_BACKOFF_MS = 15_000
/** Consecutive failed polls before the screen shows "lost contact" with a Retry. */
export const MAX_POLL_FAILURES = 5

export interface ChatAttachment {
  id: string
  name: string
  state: 'uploading' | 'ready' | 'failed'
  /** 0..1 upload progress. */
  progress: number
  /** Backend asset id once uploaded: the `videoId` the job takes. */
  videoId: string | null
  error: string | null
  /** Picked from the library. (Uploads stay in the library too: removing a chip only detaches it.) */
  fromLibrary?: boolean
}

/** A picture (a logo, a photo) the message places in the video. One per message. */
export interface ChatPicture {
  id: string
  name: string
  state: 'uploading' | 'ready' | 'failed'
  /** Backend asset id once uploaded: the `overlayIds` entry the job takes. */
  assetId: string | null
  error: string | null
}

/** Why a send could not start; the screen maps the code to copy. */
export type ChatSendProblem = 'noVideo' | 'noPrompt' | 'uploading' | 'uploadFailed'

const PICTURE_NAME = /\.(jpe?g|png|webp)$/i
/** A still picture (not a video): it goes to the placement, never to the footage list. */
export function looksLikePicture(f: File): boolean {
  return f.type.startsWith('image/') || PICTURE_NAME.test(f.name)
}

/** True for text that can be sent as a reference link. The server decides whether it really is a video. */
export const looksLikeLink = (v: string): boolean => /^(https?:\/\/)?[^\s/]+\.[^\s/]{2,}(\/\S*)?$/i.test(v.trim())

interface ChatState {
  userId: string | null
  projectId: string | null
  /** The backend job this chat is on (one job = one chat; every follow-up is another turn of it). */
  jobId: string | null
  /** Latest `canFollowUp` from the backend. */
  canFollowUp: boolean
  /** The open chat was made on the other server (`prod` / `dev`): read only. */
  remote: string | null
  /** Videos the job edits, so a retry after a failed first turn does not need a re-upload. */
  videoIds: string[]
  messages: ChatMessage[]
  attachments: ChatAttachment[]
  /** Pictures for the next message (logo, photo): placed in the video at the position and time the user says. */
  pictures: ChatPicture[]
  /** The job that is waiting for the answer about where a picture goes (the next message is that answer); null = none. */
  placementJobId: string | null
  /** New bounds / title for one clip of a clipping chat. Resolves with the reason when it fails. */
  trimClip: (jobId: string, clipId: string, patch: ClipPatch) => Promise<string | null>
  /** One click: burn captions into a clip (default style) and follow the render. Resolves with the reason when it fails. */
  captionClip: (jobId: string, clipId: string) => Promise<string | null>
  /** A clip changed somewhere else (the studio page): the chat shows the new version. */
  patchClip: (jobId: string, clip: ClipItem) => void
  /** Reading the picked files / creating the project / creating the job. */
  busy: boolean
  /** The last thing that went wrong outside a job (upload, create). Any thrown value. */
  actionError: unknown
  /** Set when polling gave up on this job; Retry resumes it. */
  pollLostJobId: string | null
  /** Sidebar: the user's recent chats (not persisted). */
  history: HistoryItem[]
  historyState: 'idle' | 'loading' | 'ready' | 'error'
  /** The job id open in the screen (also what the sidebar highlights). */
  loadHistory: () => Promise<void>
  /** Pin or unpin a chat in the sidebar (optimistic; undone with an error if the server refuses). */
  pinChat: (jobId: string, pinned: boolean) => Promise<void>
  /** Delete a chat: gone from the list at once; if it is the open one the screen starts a fresh chat. */
  deleteChat: (jobId: string) => Promise<void>
  /** Opens a past chat: rebuilds its messages from the job's turns and resumes polling if it is still running. */
  openJob: (jobId: string) => Promise<void>

  attach: (files: File[]) => Promise<void>
  /** Take a picture off the next message (its upload is kept in the library, like a removed video chip). */
  removePicture: (id: string) => void
  /** Adds library videos to the next message. They all belong to one project; the chat moves there if it has no footage yet. */
  attachFromLibrary: (items: LibraryVideo[]) => void
  removeAttachment: (id: string) => void
  /**
   * Send a message. While a turn runs, `whenBusy` says what the message does: 'queue' = sent by itself when the turn
   * finishes, 'interrupt' = stop the turn and do this instead (the work done so far is reused). Without it nothing is sent.
   */
  send: (prompt: string, whenBusy?: 'queue' | 'interrupt') => Promise<ChatSendProblem | null>
  /** Messages typed while a turn ran, sent one by one as turns finish (persisted with the chat). */
  queue: QueuedMessage[]
  removeQueued: (id: string) => void
  /** Change the last message the person sent (also while it runs). Resolves with the reason when it could not be changed. */
  editMessage: (messageId: string, text: string) => Promise<string | null>
  /** Run the last message again (its turn failed or was stopped). */
  retryTurn: (assistantId: string) => Promise<void>
  /** Changes the music of the finished video (backend2): a new turn that only re-mixes the sound. `label` is the line shown as the person's message. */
  changeMusic: (choice: MusicChoice, label: string) => Promise<void>
  cancel: () => Promise<void>
  /**
   * Answer the question the backend asked (the card under the assistant's message). Resolves `null` when it was taken,
   * `'stale'` when the question was no longer open (the chat is refreshed), or the reason when it failed (the card stays).
   */
  answerQuestion: (jobId: string, body: QuestionAnswer, label?: string) => Promise<string | null>
  /** Upload the video / photo that answers a question; resolves with its asset id (`videoId` of the answer). Rejects with the reason. */
  uploadForAnswer: (file: File, onProgress?: (fraction: number) => void) => Promise<string>
  /** The user picked a template on offer (or `null` = none of them): it leaves the screen at once, the server carries on. */
  chooseLook: (jobId: string, lookId: string | null) => Promise<void>
  /** The final frames are fine: render the video (a change is typed in the composer instead). */
  approveFrames: (jobId: string) => Promise<void>
  /** The user started giving a reference in the chooser (typing a link): the server waits longer. */
  holdLook: (jobId: string) => Promise<void>
  /** Copy the template of the video behind a link. Resolves with the reason when the link cannot be used (the chooser stays open). */
  lookFromLink: (jobId: string, url: string) => Promise<string | null>
  /** Upload a reference video and copy its template. Resolves with the reason when it fails (the chooser stays open). */
  lookFromFile: (jobId: string, file: File, onProgress?: (fraction: number) => void) => Promise<string | null>
  /** Re-attach to a job that was running when the page closed (and refresh the last video's URL). */
  resume: () => Promise<void>
  /** Opening the app starts an empty chat: stops watching the previous one but never cancels it (it keeps running and stays in the sidebar). */
  startFresh: () => void
  retryPolling: () => void
  newChat: () => Promise<void>
  /** Signing out: stop everything and drop the transcript. */
  reset: () => void
  clearActionError: () => void
}

let pollCtl: AbortController | null = null
/** In-flight uploads by attachment id. */
const uploads = new Map<string, AbortController>()
let idCounter = 0
const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `m-${Date.now()}-${++idCounter}`

const currentUserId = (): string | null => useAuth.getState().user?.id ?? null

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done)
  })
}

export function stopPolling(): void {
  pollCtl?.abort()
  pollCtl = null
}

function abortUploads(): void {
  for (const ctl of uploads.values()) ctl.abort()
  uploads.clear()
}

/** Remembers the per-job facts the next send depends on. */
function absorb(snap: ChatJobSnapshot): void {
  useChat.setState((s) => ({
    jobId: snap.jobId,
    canFollowUp: snap.canFollowUp,
    remote: snap.remote ?? null,
    videoIds: snap.videoIds.length > 0 ? snap.videoIds : s.videoIds,
    projectId: snap.projectId ?? s.projectId,
    // the job waits for a typed answer: where a picture goes, or what to change on the final frames
    placementJobId: snap.placementOpen || snap.framesReview ? snap.jobId : null,
  }))
}

function setPicture(id: string, patch: Partial<ChatPicture>): void {
  useChat.setState((s) => ({ pictures: s.pictures.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
}

/** A picture for the next message: one at a time (a new one replaces the old). Uploads straight into the chat's project. */
async function attachPicture(file: File): Promise<void> {
  const id = newId()
  const replaced = useChat.getState().pictures
  useChat.setState({ pictures: [{ id, name: file.name, state: 'uploading', assetId: null, error: null }], actionError: null })
  for (const p of replaced) if (p.assetId) void deleteAsset(p.assetId)
  try {
    let projectId = useChat.getState().projectId
    if (!projectId) {
      projectId = await createChatProject(shapeFor(null, null))
      useChat.setState({ projectId, userId: currentUserId() })
    }
    const assetId = await uploadPicture(projectId, file)
    setPicture(id, { state: 'ready', assetId })
  } catch (e) {
    setPicture(id, { state: 'failed', error: userMessage(e) })
  }
}

/** The template chooser of a job leaves the screen (an answer was accepted). */
function closeLook(jobId: string): void {
  useChat.setState((s) => ({
    messages: s.messages.map((m): ChatMessage => (m.role === 'assistant' && m.jobId === jobId ? { ...m, lookChoice: null } : m)),
  }))
}

/** The clips of a finished clipping chat changed (a trim): its message shows the new list. */
function setClips(jobId: string, clips: ClipItem[]): void {
  useChat.setState((s) => ({
    messages: s.messages.map((m): ChatMessage => (m.role === 'assistant' && m.jobId === jobId && m.kind === 'clips' ? { ...m, clips } : m)),
  }))
}

/** One clip of a clipping chat replaced by a newer copy of it. */
function replaceClip(jobId: string, clip: ClipItem): void {
  useChat.setState((s) => ({
    messages: s.messages.map((m): ChatMessage =>
      m.role === 'assistant' && m.jobId === jobId && m.kind === 'clips' && m.clips
        ? { ...m, clips: m.clips.map((c) => (c.id === clip.id ? clip : c)) }
        : m,
    ),
  }))
}

function patchAttachment(id: string, patch: Partial<ChatAttachment>): void {
  useChat.setState((s) => ({ attachments: s.attachments.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
}

async function runUpload(id: string, projectId: string, file: File, probe: VideoProbe): Promise<void> {
  const ctl = new AbortController()
  uploads.set(id, ctl)
  try {
    const videoId = await uploadVideo(projectId, file, probe, {
      signal: ctl.signal,
      onProgress: (progress) => patchAttachment(id, { progress }),
    })
    if (ctl.signal.aborted) return void deleteAsset(videoId)
    patchAttachment(id, { state: 'ready', progress: 1, videoId, error: null })
  } catch (e) {
    if (!ctl.signal.aborted) patchAttachment(id, { state: 'failed', error: userMessage(e) })
  } finally {
    if (uploads.get(id) === ctl) uploads.delete(id)
  }
}

/** Polls one job until it finishes, is cancelled, or the server stops answering. */
async function pollJob(jobId: string): Promise<void> {
  stopPolling()
  const ctl = new AbortController()
  pollCtl = ctl
  let misses = 0
  useChat.setState({ pollLostJobId: null })
  while (!ctl.signal.aborted) {
    try {
      const snap = await getChatApi().getJob(jobId, ctl.signal)
      if (ctl.signal.aborted) return
      misses = 0
      useChat.setState((s) => ({ messages: applySnapshot(s.messages, snap) }))
      absorb(snap)
      if (isTerminal(snap.status)) {
        void useChat.getState().loadHistory()
        if (snap.status === 'complete') queueMicrotask(() => void drainQueue())
        break
      }
    } catch (e) {
      if (ctl.signal.aborted) return
      // The server answered "no such job / not yours": retrying cannot help.
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
        useChat.setState((s) => ({ messages: finishLocally(s.messages, jobId, 'failed', userMessage(e)) }))
        break
      }
      misses++
      if (misses >= MAX_POLL_FAILURES) {
        useChat.setState({ pollLostJobId: jobId, actionError: e })
        break
      }
    }
    await sleep(Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** misses), ctl.signal)
  }
  if (pollCtl === ctl) pollCtl = null
}

/** The next queued message goes out once nothing runs (a turn completed). A refused one goes back to the front of the line. */
async function drainQueue(): Promise<void> {
  const s = useChat.getState()
  const next = s.queue[0]
  if (!next || s.busy || activeAssistant(s.messages)) return
  useChat.setState({ queue: s.queue.slice(1) })
  const problem = await s.send(next.text)
  if (problem) useChat.setState((cur) => ({ queue: [next, ...cur.queue] }))
}

/** The server's code for "that run is not on this server: stop it, then ask again". */
const stopFirst = (e: unknown): boolean => e instanceof ApiError && e.status === 409 && (e.code === 'stop_first' || e.code === 'unsupported')

/** Stop the running turn and wait (up to ~90 s) until the server says it has ended. */
async function stopAndWait(jobId: string): Promise<void> {
  await useChat.getState().cancel()
  const ctl = new AbortController()
  for (let i = 0; i < 45; i++) {
    try {
      const snap = await getChatApi().getJob(jobId)
      if (isTerminal(snap.status)) {
        absorb(snap)
        return
      }
    } catch {
      // try again
    }
    await sleep(POLL_MS, ctl.signal)
  }
}

/** The newest assistant message that carries an open question (the one the card is under). */
export function openQuestion(messages: readonly ChatMessage[]): { jobId: string; question: ChatQuestion } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'assistant' && m.question) return { jobId: m.jobId, question: m.question }
  }
  return null
}

const EMPTY_CHAT = {
  messages: [] as ChatMessage[], attachments: [] as ChatAttachment[], pictures: [] as ChatPicture[], placementJobId: null as string | null,
  projectId: null, jobId: null,
  canFollowUp: false, remote: null as string | null, videoIds: [] as string[], actionError: null, pollLostJobId: null,
  queue: [] as QueuedMessage[],
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      userId: null,
      projectId: null,
      jobId: null,
      canFollowUp: false,
      remote: null,
      videoIds: [],
      messages: [],
      attachments: [],
      pictures: [],
      placementJobId: null,
      queue: [],
      busy: false,
      actionError: null,
      pollLostJobId: null,
      history: [],
      historyState: 'idle',

      trimClip: async (jobId, clipId, patch) => {
        const before = get().messages.find((m) => m.role === 'assistant' && m.jobId === jobId && m.kind === 'clips')
        const old = before?.role === 'assistant' ? before.clips : undefined
        if (old) setClips(jobId, old.map((c) => (c.id === clipId ? { ...c, state: 'cutting' } : c)))
        try {
          const snap = await getClipsApi().trim(jobId, clipId, patch)
          if (snap.clips) setClips(jobId, snap.clips)
          return null
        } catch (e) {
          if (old) setClips(jobId, old)
          return userMessage(e)
        }
      },

      captionClip: async (jobId, clipId) => {
        try {
          const api = getClipsApi()
          let st = await api.setLook(jobId, clipId, { captions: { on: true } })
          replaceClip(jobId, st.clip)
          for (let i = 0; i < STYLE_MAX_POLLS && st.clip.styled?.state === 'rendering'; i++) {
            await new Promise((r) => setTimeout(r, STYLE_POLL_MS))
            st = await api.studio(jobId, clipId)
            replaceClip(jobId, st.clip)
          }
          if (st.clip.styled?.state === 'failed') return st.clip.styled.error ?? 'failed'
          return null
        } catch (e) {
          return userMessage(e)
        }
      },

      patchClip: (jobId, clip) => replaceClip(jobId, clip),

      loadHistory: async () => {
        if (!currentUserId()) return
        set({ historyState: get().history.length > 0 ? 'ready' : 'loading' })
        try {
          const rows = await getHistoryApi().list(50)
          set({ history: rows.map(toHistoryItem).filter((h) => h.title !== ''), historyState: 'ready' })
        } catch {
          set({ historyState: 'error' })
        }
      },

      pinChat: async (jobId, pinned) => {
        const before = get().history
        set({ history: before.map((h) => (h.jobId === jobId ? { ...h, pinned } : h)) })
        try {
          await getHistoryApi().pin(jobId, pinned)
          void get().loadHistory() // the server owns the order of pinned chats
        } catch (e) {
          set({ history: before, actionError: e })
        }
      },

      deleteChat: async (jobId) => {
        const before = get().history
        set({ history: before.filter((h) => h.jobId !== jobId) })
        if (get().jobId === jobId) {
          stopPolling()
          abortUploads()
          set({ ...EMPTY_CHAT })
        }
        try {
          await getHistoryApi().remove(jobId)
        } catch (e) {
          set({ history: before, actionError: e })
        }
      },

      openJob: async (jobId) => {
        if (get().busy) return
        set({ busy: true, actionError: null })
        try {
          const wire = await getHistoryApi().get(jobId)
          stopPolling()
          abortUploads()
          const messages = rebuildMessages(wire)
          const snap = toSnapshot(wire)
          set({
            ...EMPTY_CHAT, messages, jobId: wire.id, projectId: wire.projectId ?? null, userId: currentUserId(),
            canFollowUp: snap.canFollowUp, remote: snap.remote ?? null, videoIds: snap.videoIds,
          })
          if (!isTerminal(snap.status)) void pollJob(wire.id)
        } catch (e) {
          set({ actionError: e })
        } finally {
          set({ busy: false })
        }
      },

      attach: async (all) => {
        // a picture (logo, photo) is not footage: it goes to the placement, and the rest goes on as before
        const pictures = all.filter(looksLikePicture)
        if (pictures.length > 0) await attachPicture(pictures[pictures.length - 1]!)
        const picked = all.filter((f) => !looksLikePicture(f))
        const files = picked.filter(looksLikeVideo)
        const notVideo = picked.filter((f) => !looksLikeVideo(f)).map((f) => f.name)
        if (picked.length === 0) return
        if (files.length === 0) {
          if (notVideo.length > 0) set({ actionError: new Error(`Not a video: ${notVideo.join(', ')}`) })
          return
        }
        set({ busy: true, actionError: null })
        try {
          const probed: { file: File; probe: VideoProbe }[] = []
          const unreadable = [...notVideo]
          for (const file of files) {
            try {
              probed.push({ file, probe: await probeVideo(file) })
            } catch {
              unreadable.push(file.name)
            }
          }
          if (probed.length > 0) {
            let projectId = get().projectId
            if (!projectId) {
              // The project adopts the first video's orientation (portrait -> 1080x1920).
              projectId = await createChatProject(shapeFor(probed[0]!.probe.width, probed[0]!.probe.height))
              set({ projectId, userId: currentUserId() })
            }
            const items = probed.map((p) => ({ ...p, id: newId() }))
            set((s) => ({
              attachments: [
                ...s.attachments,
                ...items.map((i): ChatAttachment => ({
                  id: i.id, name: i.file.name, state: 'uploading', progress: 0, videoId: null, error: null,
                })),
              ],
            }))
            // Uploads run in the background; the screen shows each chip's progress and Send waits for them.
            for (const i of items) void runUpload(i.id, projectId, i.file, i.probe)
          }
          if (unreadable.length > 0) set({ actionError: new Error(`Couldn't read: ${unreadable.join(', ')}`) })
        } catch (e) {
          set({ actionError: e })
        } finally {
          set({ busy: false })
        }
      },

      removePicture: (id) => {
        const gone = get().pictures.find((p) => p.id === id)
        if (gone?.assetId) void deleteAsset(gone.assetId)
        set((s) => ({ pictures: s.pictures.filter((p) => p.id !== id) }))
      },

      attachFromLibrary: (items) => {
        if (items.length === 0) return
        set((s) => {
          const have = new Set(s.attachments.map((a) => a.videoId))
          const fresh = items.filter((i) => !have.has(i.id))
          return {
            // A chat with no footage yet has nothing tied to its project, so it moves to the picked videos' project.
            projectId: s.videoIds.length === 0 && s.attachments.length === 0 ? items[0]!.projectId : s.projectId,
            actionError: null,
            userId: currentUserId(),
            attachments: [
              ...s.attachments,
              ...fresh.map((i): ChatAttachment => ({
                id: newId(), name: i.name, state: 'ready', progress: 1, videoId: i.id, error: null, fromLibrary: true,
              })),
            ],
          }
        })
      },

      removeAttachment: (id) => {
        const att = get().attachments.find((a) => a.id === id)
        uploads.get(id)?.abort()
        uploads.delete(id)
        set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) }))
        // A finished upload stays in the library: taking it out of the message only detaches it. Only a cancelled,
        // half-finished upload (handled in runUpload) is cleaned up.
        void att
      },

      send: async (rawPrompt, whenBusy) => {
        const s0 = get()
        const prompt = rawPrompt.trim()
        // The backend asked a question: a typed line (nothing attached) is its answer, not a new turn.
        const asked = openQuestion(s0.messages)
        if (asked && !s0.remote && prompt && s0.attachments.length === 0 && s0.pictures.length === 0) {
          const problem = await get().answerQuestion(
            asked.jobId, { questionId: asked.question.id, optionIds: [], text: prompt, videoId: null, link: null }, prompt,
          )
          return problem === null || problem === 'stale' ? null : 'noPrompt'
        }
        // The job is waiting for where a picture goes: this message is the answer, not a new turn.
        if (s0.placementJobId && rawPrompt.trim() && s0.attachments.length === 0 && s0.pictures.length === 0) {
          const answer = rawPrompt.trim()
          set((s) => ({
            messages: [
              ...s.messages.map((m): ChatMessage => (m.role === 'assistant' && m.jobId === s0.placementJobId ? { ...m, framesReview: null } : m)),
              { id: newId(), role: 'user', text: answer, attachments: [] },
            ],
          }))
          try {
            absorb(await getChatApi().followUp(s0.placementJobId, answer))
          } catch (e) {
            set({ actionError: e })
          }
          return null
        }
        const running = activeAssistant(s0.messages)
        if (running && whenBusy && !s0.busy) {
          if (!prompt) return 'noPrompt'
          if (whenBusy === 'queue') {
            set((s) => ({ queue: [...s.queue, { id: newId(), text: prompt }] }))
            return null
          }
          const api = getChatApi()
          const withFiles = s0.attachments.length > 0 || s0.pictures.length > 0
          if (api.interrupt && !withFiles && !s0.remote) {
            set({ busy: true, actionError: null })
            try {
              const snap = await api.interrupt(running.jobId, prompt)
              const user: ChatMessage = { id: newId(), role: 'user', text: prompt, attachments: [] }
              set((s) => ({
                messages: capMessages([
                  ...finishLocally(s.messages, running.jobId, 'cancelled'), user, newAssistant(newId(), running.jobId, running.turn + 1),
                ]),
              }))
              absorb(snap)
              if (!pollCtl) void pollJob(running.jobId)
              return null
            } catch (e) {
              if (!stopFirst(e)) {
                set({ actionError: e })
                return null
              }
            } finally {
              set({ busy: false })
            }
          }
          // files ride along, or the run is not on this server: stop it, wait for the end, then send as usual
          await stopAndWait(running.jobId)
          return get().send(prompt)
        }
        if (s0.busy || running) return null
        if (!prompt) return 'noPrompt'
        // The conversation goes on when its last turn finished (an edit, or just a reply); new files ride along with it.
        const followUp = s0.jobId !== null && s0.canFollowUp
        if (s0.attachments.some((a) => a.state === 'uploading')) return 'uploading'
        if (s0.attachments.some((a) => a.state === 'failed' || !a.videoId)) return 'uploadFailed'
        if (s0.pictures.some((p) => p.state === 'uploading')) return 'uploading'
        if (s0.pictures.some((p) => p.state === 'failed')) return 'uploadFailed'
        const overlayIds = s0.pictures.flatMap((p) => (p.assetId ? [p.assetId] : []))

        // The message shows at once with the assistant "typing" while the server reads it (a model call, a few seconds),
        // like any chat. The typing bubble becomes the real answer when the server replies; both go if the send fails.
        const user: ChatMessage = {
          id: newId(), role: 'user', text: prompt,
          attachments: [...s0.attachments.map((a) => a.name), ...s0.pictures.map((p) => `${p.name} (picture)`)],
        }
        const typing: ChatAssistantMessage = { ...newAssistant(newId(), '', 0), kind: 'chat' }
        set((s) => ({ busy: true, actionError: null, messages: capMessages([...s.messages, user, typing]) }))
        try {
          const api = getChatApi()
          const attached = s0.attachments.map((a) => a.videoId!)
          let snap: ChatJobSnapshot
          if (followUp) {
            // the old call shapes stay as they were when nothing new is attached (a picture is the last argument)
            if (overlayIds.length > 0) snap = await api.followUp(s0.jobId!, prompt, undefined, attached, overlayIds)
            else snap = await api.followUp(s0.jobId!, prompt, undefined, attached)
          } else {
            // Words only is fine: a conversation needs a home, not footage. Footage can come with a later message.
            let projectId = s0.projectId
            if (!projectId) {
              projectId = await createChatProject(shapeFor(null, null))
              set({ projectId, userId: currentUserId() })
            }
            snap = await api.createJob({
              projectId, videoIds: attached.length > 0 ? attached : s0.videoIds, prompt,
              ...(overlayIds.length > 0 ? { overlayIds } : {}),
              // this chat's last job is over but takes no follow-up (a reply, a failed edit, clips): the new job is its next
              // turn, so the conversation stays one chat (a chat copied from another server cannot run anything here)
              ...(s0.jobId && !s0.remote ? { chatId: s0.jobId } : {}),
            })
          }
          set((s) => ({
            messages: applySnapshot(
              s.messages.map((m): ChatMessage => (m.id === typing.id ? newAssistant(newId(), snap.jobId, snap.turn) : m)),
              snap,
            ),
            attachments: [],
            pictures: [],
            userId: currentUserId(),
          }))
          absorb(snap)
          if (!isTerminal(snap.status)) void pollJob(snap.jobId)
          void get().loadHistory()
        } catch (e) {
          set((s) => ({ actionError: e, messages: s.messages.filter((m) => m.id !== user.id && m.id !== typing.id) }))
        } finally {
          set({ busy: false })
        }
        return null
      },

      chooseLook: async (jobId, lookId) => {
        set((s) => ({
          messages: s.messages.map((m): ChatMessage => (m.role === 'assistant' && m.jobId === jobId ? { ...m, lookChoice: null } : m)),
        }))
        try {
          await getChatApi().answerLook?.(jobId, lookId === null ? { skip: true } : { look: lookId })
        } catch (e) {
          // Too late (the best one was already taken) or the network blinked: the edit goes on either way.
          console.warn('[chat] chooseLook failed', e)
        }
      },

      approveFrames: async (jobId) => {
        set((s) => ({
          placementJobId: s.placementJobId === jobId ? null : s.placementJobId,
          messages: s.messages.map((m): ChatMessage => (m.role === 'assistant' && m.jobId === jobId ? { ...m, framesReview: null } : m)),
        }))
        try {
          await getChatApi().answerFrames?.(jobId, { continue: true })
        } catch (e) {
          // Too late (it already rendered by itself) or the network blinked: the video comes either way.
          console.warn('[chat] approveFrames failed', e)
        }
      },

      uploadForAnswer: async (file, onProgress) => {
        const isPicture = looksLikePicture(file)
        if (!isPicture && !looksLikeVideo(file)) throw new Error(`Not a photo or video: ${file.name}`)
        const probe = isPicture ? null : await probeVideo(file)
        let projectId = get().projectId
        if (!projectId) {
          projectId = await createChatProject(shapeFor(probe?.width ?? null, probe?.height ?? null))
          set({ projectId, userId: currentUserId() })
        }
        return probe ? uploadVideo(projectId, file, probe, { onProgress }) : uploadPicture(projectId, file, { onProgress })
      },

      answerQuestion: async (jobId, body, label) => {
        const api = getChatApi()
        if (!api.answer) return 'unsupported'
        set({ actionError: null })
        const clearCard = (): void => {
          useChat.setState((s) => ({
            messages: s.messages.map((m): ChatMessage => (m.role === 'assistant' && m.jobId === jobId ? { ...m, question: null } : m)),
          }))
        }
        try {
          const snap = await api.answer(jobId, body)
          clearCard()
          // a typed answer shows as the person's message
          if (label) set((s) => ({ messages: [...s.messages, { id: newId(), role: 'user', text: label, attachments: [] }] }))
          set((s) => {
            // A question asked before anything ran is answered by starting the work as the chat's NEXT turn (or a new chat
            // for a different kind of job): give that turn its own assistant message, or its progress would have nowhere to go.
            const has = s.messages.some((m) => m.role === 'assistant' && m.jobId === snap.jobId && m.turn === snap.turn)
            const messages = has ? s.messages : capMessages([...s.messages, newAssistant(newId(), snap.jobId, snap.turn)])
            return { messages: applySnapshot(messages, snap) }
          })
          absorb(snap)
          if (!isTerminal(snap.status) && !pollCtl) void pollJob(snap.jobId)
          return null
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            // The question is no longer open (answered elsewhere, or the job moved on): show the chat as it is now.
            clearCard()
            try {
              const snap = await api.getJob(jobId)
              set((s) => ({ messages: applySnapshot(s.messages, snap) }))
              absorb(snap)
              if (!isTerminal(snap.status) && !pollCtl) void pollJob(jobId)
            } catch {
              // the next poll shows it
            }
            return 'stale'
          }
          return e instanceof Error ? e.message : String(e)
        }
      },

      holdLook: async (jobId) => {
        await getChatApi().answerLook?.(jobId, { hold: true })?.catch(() => undefined)
      },

      lookFromLink: async (jobId, url) => {
        try {
          // The server fetches the video before it answers, so a link that does not work comes back as an error here.
          await getChatApi().answerLook?.(jobId, { url: url.trim() })
        } catch (e) {
          return userMessage(e)
        }
        closeLook(jobId)
        return null
      },

      lookFromFile: async (jobId, file, onProgress) => {
        const api = getChatApi()
        const hold = () => api.answerLook?.(jobId, { hold: true }).catch(() => undefined)
        try {
          if (!looksLikeVideo(file)) return `Not a video: ${file.name}`
          void hold()
          const probe = await probeVideo(file)
          const projectId = get().projectId ?? (await createChatProject(shapeFor(probe.width, probe.height)))
          let held = Date.now()
          const videoId = await uploadVideo(projectId, file, probe, {
            onProgress: (f) => {
              onProgress?.(f)
              if (Date.now() - held > 60_000) {
                held = Date.now()
                void hold() // a long upload: keep the chooser from timing out
              }
            },
          })
          await api.answerLook?.(jobId, { referenceVideoId: videoId })
        } catch (e) {
          return userMessage(e)
        }
        closeLook(jobId)
        return null
      },

      changeMusic: async (choice, label) => {
        const s0 = get()
        // Only a finished chat can change its music, and never while another turn is running.
        if (s0.busy || !s0.jobId || !s0.canFollowUp || activeAssistant(s0.messages)) return
        set({ busy: true, actionError: null })
        try {
          const snap = await getMusicApi().set(s0.jobId, choice)
          const user: ChatMessage = { id: newId(), role: 'user', text: label, attachments: [] }
          set((s) => ({
            messages: applySnapshot(capMessages([...s.messages, user, newAssistant(newId(), snap.jobId, snap.turn)]), snap),
            userId: currentUserId(),
          }))
          absorb(snap)
          if (!isTerminal(snap.status)) void pollJob(snap.jobId)
          void get().loadHistory()
        } catch (e) {
          set({ actionError: e })
        } finally {
          set({ busy: false })
        }
      },

      cancel: async () => {
        const active = activeAssistant(get().messages)
        if (!active || !active.jobId) return
        stopPolling()
        set((s) => ({ messages: finishLocally(s.messages, active.jobId, 'cancelled'), pollLostJobId: null, queue: [] }))
        try {
          absorb(await getChatApi().cancelJob(active.jobId))
        } catch (e) {
          // The job is already marked stopped on screen; the server may still finish it.
          console.warn('[chat] cancelJob failed', e)
        }
      },

      resume: async () => {
        const s = get()
        // Another account's transcript must never show up after a sign-in change.
        if (s.userId && s.userId !== currentUserId()) {
          set({ ...EMPTY_CHAT, userId: null })
          return
        }
        const active = activeAssistant(s.messages)
        if (active) {
          if (!pollCtl) void pollJob(active.jobId)
          return
        }
        // Finished videos carry URLs that may have expired while the tab was closed.
        const done = lastCompleted(s.messages)
        if (!done) return
        try {
          const snap = await getChatApi().getJob(done.jobId)
          // Only the newest turn has a fresh link; earlier turns keep what they have.
          if (snap.status === 'complete' && snap.result && snap.turn === done.turn) {
            const result = snap.result
            set((cur) => ({
              messages: cur.messages.map((m) =>
                m.role === 'assistant' && m.jobId === done.jobId && m.turn === done.turn ? { ...m, result } : m,
              ),
            }))
            absorb(snap)
          }
        } catch {
          // Keep the stored URL; playback will say if it no longer works.
        }
      },

      retryPolling: () => {
        const lost = get().pollLostJobId
        set({ actionError: null, pollLostJobId: null })
        if (lost) void pollJob(lost)
      },

      startFresh: () => {
        stopPolling()
        abortUploads()
        // A video that was uploaded for a message that never got sent would stay orphaned in the project.
        for (const a of get().attachments) if (a.videoId) void deleteAsset(a.videoId)
        set({ ...EMPTY_CHAT, userId: currentUserId(), busy: false })
      },

      newChat: async () => {
        await get().cancel()
        abortUploads()
        set({ ...EMPTY_CHAT })
      },

      reset: () => {
        stopPolling()
        abortUploads()
        set({ ...EMPTY_CHAT, userId: null, busy: false, history: [], historyState: 'idle' })
      },

      clearActionError: () => set({ actionError: null }),

      removeQueued: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),

      editMessage: async (messageId, rawText) => {
        const text = rawText.trim()
        const s0 = get()
        const i = s0.messages.findIndex((m) => m.id === messageId)
        const lastUser = s0.messages.map((m) => m.role).lastIndexOf('user')
        if (i < 0 || i !== lastUser || s0.remote) return 'Only your last message can be changed.'
        const target = s0.messages[i]!
        if (!text) return 'Say what you want done.'
        if (target.role === 'user' && target.text === text) return null
        const reply = s0.messages.slice(i + 1).find((m): m is ChatAssistantMessage => m.role === 'assistant')
        const api = getChatApi()
        if (!reply || !api.editTurn) return 'This message cannot be changed.'
        set({ busy: true, actionError: null })
        try {
          let snap: ChatJobSnapshot
          try {
            snap = await api.editTurn(reply.jobId, reply.turn, text)
          } catch (e) {
            if (!stopFirst(e) || isTerminal(reply.status)) throw e
            await stopAndWait(reply.jobId)
            snap = await api.editTurn(reply.jobId, reply.turn, text)
          }
          set((s) => ({
            messages: applySnapshot(
              s.messages.map((m): ChatMessage =>
                m.id === messageId && m.role === 'user' ? { ...m, text, edited: true }
                  : m.id === reply.id ? newAssistant(newId(), snap.jobId, snap.turn) : m,
              ),
              snap,
            ),
          }))
          absorb(snap)
          if (!isTerminal(snap.status)) void pollJob(snap.jobId)
          void get().loadHistory()
          return null
        } catch (e) {
          return userMessage(e)
        } finally {
          set({ busy: false })
        }
      },

      retryTurn: async (assistantId) => {
        const s0 = get()
        const msg = s0.messages.find((m): m is ChatAssistantMessage => m.role === 'assistant' && m.id === assistantId)
        const api = getChatApi()
        if (!msg || !api.retryTurn || s0.busy || s0.remote || activeAssistant(s0.messages)) return
        set({ busy: true, actionError: null })
        try {
          const snap = await api.retryTurn(msg.jobId)
          set((s) => ({
            messages: applySnapshot(s.messages.map((m): ChatMessage => (m.id === assistantId ? newAssistant(newId(), snap.jobId, snap.turn) : m)), snap),
          }))
          absorb(snap)
          if (!isTerminal(snap.status)) void pollJob(snap.jobId)
        } catch (e) {
          set({ actionError: e })
        } finally {
          set({ busy: false })
        }
      },
    }),
    {
      name: 'edito.chat-web.chat.v1',
      partialize: (s) => ({
        userId: s.userId, projectId: s.projectId, jobId: s.jobId, canFollowUp: s.canFollowUp,
        videoIds: s.videoIds, messages: capMessages(s.messages), queue: s.queue,
      }),
    },
  ),
)
