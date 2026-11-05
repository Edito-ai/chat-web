import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuth } from '@/auth/authStore'
import { ApiError } from '@/lib/apiClient'
import { getChatApi, toSnapshot } from './chatApi'
import { createChatProject, deleteAsset, uploadVideo } from './chatUploads'
import { looksLikeVideo, probeVideo, type VideoProbe } from './probe'
import { shapeFor } from './projectShape'
import {
  activeAssistant, applySnapshot, capMessages, finishLocally, isTerminal, lastCompleted, newAssistant,
} from './chatState'
import type { ChatJobSnapshot, ChatMessage } from './chatTypes'
import { getHistoryApi, rebuildMessages, toHistoryItem, type HistoryItem } from './history'

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
}

/** Why a send could not start; the screen maps the code to copy. */
export type ChatSendProblem = 'noVideo' | 'noPrompt' | 'uploading' | 'uploadFailed'

interface ChatState {
  userId: string | null
  projectId: string | null
  /** The backend job this chat is on (one job = one chat; every follow-up is another turn of it). */
  jobId: string | null
  /** Latest `canFollowUp` from the backend. */
  canFollowUp: boolean
  /** Videos the job edits, so a retry after a failed first turn does not need a re-upload. */
  videoIds: string[]
  messages: ChatMessage[]
  attachments: ChatAttachment[]
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
  /** Opens a past chat: rebuilds its messages from the job's turns and resumes polling if it is still running. */
  openJob: (jobId: string) => Promise<void>

  attach: (files: File[]) => Promise<void>
  removeAttachment: (id: string) => void
  send: (prompt: string) => Promise<ChatSendProblem | null>
  cancel: () => Promise<void>
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
    videoIds: snap.videoIds.length > 0 ? snap.videoIds : s.videoIds,
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
    if (!ctl.signal.aborted) patchAttachment(id, { state: 'failed', error: e instanceof Error ? e.message : String(e) })
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
        break
      }
    } catch (e) {
      if (ctl.signal.aborted) return
      // The server answered "no such job / not yours": retrying cannot help.
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
        useChat.setState((s) => ({ messages: finishLocally(s.messages, jobId, 'failed', e.message) }))
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

const EMPTY_CHAT = {
  messages: [] as ChatMessage[], attachments: [] as ChatAttachment[], projectId: null, jobId: null,
  canFollowUp: false, videoIds: [] as string[], actionError: null, pollLostJobId: null,
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      userId: null,
      projectId: null,
      jobId: null,
      canFollowUp: false,
      videoIds: [],
      messages: [],
      attachments: [],
      busy: false,
      actionError: null,
      pollLostJobId: null,
      history: [],
      historyState: 'idle',

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
            canFollowUp: snap.canFollowUp, videoIds: snap.videoIds,
          })
          if (!isTerminal(snap.status)) void pollJob(wire.id)
        } catch (e) {
          set({ actionError: e })
        } finally {
          set({ busy: false })
        }
      },

      attach: async (picked) => {
        const files = picked.filter(looksLikeVideo)
        const notVideo = picked.filter((f) => !looksLikeVideo(f)).map((f) => f.name)
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

      removeAttachment: (id) => {
        const att = get().attachments.find((a) => a.id === id)
        uploads.get(id)?.abort()
        uploads.delete(id)
        set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) }))
        if (att?.videoId) void deleteAsset(att.videoId)
      },

      send: async (rawPrompt) => {
        const prompt = rawPrompt.trim()
        const s0 = get()
        if (s0.busy || activeAssistant(s0.messages)) return null
        if (!prompt) return 'noPrompt'
        // No new files and the last turn finished: it is a follow-up on the same job.
        const followUp = s0.attachments.length === 0 && s0.jobId !== null && s0.canFollowUp
        if (!followUp && s0.attachments.length === 0 && s0.videoIds.length === 0) return 'noVideo'
        if (!s0.projectId) return 'noVideo'
        if (s0.attachments.some((a) => a.state === 'uploading')) return 'uploading'
        if (s0.attachments.some((a) => a.state === 'failed' || !a.videoId)) return 'uploadFailed'

        set({ busy: true, actionError: null })
        try {
          const api = getChatApi()
          let snap: ChatJobSnapshot
          if (followUp) {
            snap = await api.followUp(s0.jobId!, prompt)
          } else {
            const videoIds = s0.attachments.length > 0 ? s0.attachments.map((a) => a.videoId!) : s0.videoIds
            snap = await api.createJob({ projectId: s0.projectId, videoIds, prompt })
          }
          const user: ChatMessage = { id: newId(), role: 'user', text: prompt, attachments: s0.attachments.map((a) => a.name) }
          set((s) => ({
            messages: applySnapshot(capMessages([...s.messages, user, newAssistant(newId(), snap.jobId, snap.turn)]), snap),
            attachments: [],
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
        return null
      },

      cancel: async () => {
        const active = activeAssistant(get().messages)
        if (!active) return
        stopPolling()
        set((s) => ({ messages: finishLocally(s.messages, active.jobId, 'cancelled'), pollLostJobId: null }))
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
        for (const a of get().attachments) if (a.videoId) void deleteAsset(a.videoId)
        set({ ...EMPTY_CHAT })
      },

      reset: () => {
        stopPolling()
        abortUploads()
        set({ ...EMPTY_CHAT, userId: null, busy: false, history: [], historyState: 'idle' })
      },

      clearActionError: () => set({ actionError: null }),
    }),
    {
      name: 'edito.chat-web.chat.v1',
      partialize: (s) => ({
        userId: s.userId, projectId: s.projectId, jobId: s.jobId, canFollowUp: s.canFollowUp,
        videoIds: s.videoIds, messages: capMessages(s.messages),
      }),
    },
  ),
)
