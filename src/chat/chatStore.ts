import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuth } from '@/auth/authStore'
import { ApiError } from '@/lib/apiClient'
import { getChatApi, toSnapshot, type LibraryVideo } from './chatApi'
import { createChatProject, deleteAsset, uploadVideo } from './chatUploads'
import { looksLikeVideo, probeVideo, type VideoProbe } from './probe'
import { shapeFor } from './projectShape'
import {
  activeAssistant, applySnapshot, capMessages, finishLocally, isTerminal, lastCompleted, newAssistant,
} from './chatState'
import type { ChatJobSnapshot, ChatMessage } from './chatTypes'
import { getHistoryApi, rebuildMessages, toHistoryItem, type HistoryItem } from './history'
import { useStyles } from './styles'
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
  /** Not footage to edit: a video whose look is read into a saved style (backend2). */
  reference?: boolean
}

/** Why a send could not start; the screen maps the code to copy. */
export type ChatSendProblem = 'noVideo' | 'noPrompt' | 'uploading' | 'uploadFailed' | 'twoReferences'

/** True for text that can be sent as a reference link. The server decides whether it really is a video. */
export const looksLikeLink = (v: string): boolean => /^(https?:\/\/)?[^\s/]+\.[^\s/]{2,}(\/\S*)?$/i.test(v.trim())

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
  /** A link (Instagram reel, YouTube short ...) whose look the next message copies; null = none. */
  referenceLink: string | null
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
  /** Adds library videos to the next message. They all belong to one project; the chat moves there if it has no footage yet. */
  attachFromLibrary: (items: LibraryVideo[]) => void
  removeAttachment: (id: string) => void
  /** Mark / unmark an attached video as a style reference. */
  toggleReference: (id: string) => void
  /** Attach videos that are style references from the start (the "new style from a reference" entry). */
  attachReference: (files: File[]) => Promise<void>
  send: (prompt: string) => Promise<ChatSendProblem | null>
  /** Changes the music of the finished video (backend2): a new turn that only re-mixes the sound. `label` is the line shown as the person's message. */
  changeMusic: (choice: MusicChoice, label: string) => Promise<void>
  cancel: () => Promise<void>
  setReferenceLink: (url: string | null) => void
  /** The user picked a template on offer (or `null` = none of them): it leaves the screen at once, the server carries on. */
  chooseLook: (jobId: string, lookId: string | null) => Promise<void>
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
    videoIds: snap.videoIds.length > 0 ? snap.videoIds : s.videoIds,
    projectId: snap.projectId ?? s.projectId,
  }))
}

/** The template chooser of a job leaves the screen (an answer was accepted). */
function closeLook(jobId: string): void {
  useChat.setState((s) => ({
    messages: s.messages.map((m): ChatMessage => (m.role === 'assistant' && m.jobId === jobId ? { ...m, lookChoice: null } : m)),
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
        void useStyles.getState().load() // a reference may have just become a saved style
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
  messages: [] as ChatMessage[], attachments: [] as ChatAttachment[], referenceLink: null as string | null, projectId: null, jobId: null,
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
      referenceLink: null,
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

      attachReference: async (files) => {
        const before = new Set(get().attachments.map((a) => a.id))
        await get().attach(files.slice(0, 1))
        set((s) => ({ attachments: s.attachments.map((a) => (before.has(a.id) ? a : { ...a, reference: true })) }))
      },

      toggleReference: (id) =>
        set((s) => ({ attachments: s.attachments.map((a) => (a.id === id ? { ...a, reference: !a.reference } : a)) })),

      send: async (rawPrompt) => {
        const s0 = get()
        const refs = s0.attachments.filter((a) => a.reference)
        const refLink = s0.referenceLink?.trim() || null
        // A reference on its own is a request to save its style: no words needed.
        const prompt =
          rawPrompt.trim() || ((refs.length > 0 || refLink) && s0.attachments.length === refs.length ? 'Save this style' : '')
        if (s0.busy || activeAssistant(s0.messages)) return null
        if (!prompt) return 'noPrompt'
        if (refs.length + (refLink ? 1 : 0) > 1) return 'twoReferences'
        // The conversation goes on when its last turn finished (an edit, or just a reply); new files ride along with it.
        const followUp = s0.jobId !== null && s0.canFollowUp
        if (s0.attachments.some((a) => a.state === 'uploading')) return 'uploading'
        if (s0.attachments.some((a) => a.state === 'failed' || !a.videoId)) return 'uploadFailed'

        set({ busy: true, actionError: null })
        try {
          const api = getChatApi()
          const attached = s0.attachments.filter((a) => !a.reference).map((a) => a.videoId!)
          const referenceVideoId = refs[0]?.videoId ?? undefined
          const referenceUrl = refLink ?? undefined
          const styleId =
            referenceVideoId || referenceUrl ? undefined : (useStyles.getState().items ? useStyles.getState().selected : null) ?? undefined
          const style = {
            ...(styleId ? { styleId } : {}), ...(referenceVideoId ? { referenceVideoId } : {}), ...(referenceUrl ? { referenceUrl } : {}),
          }
          const withStyle = Object.keys(style).length > 0
          let snap: ChatJobSnapshot
          if (followUp) {
            snap = withStyle
              ? await api.followUp(s0.jobId!, prompt, undefined, attached, style)
              : await api.followUp(s0.jobId!, prompt, undefined, attached)
          } else {
            // Words only is fine: a conversation needs a home, not footage. Footage can come with a later message.
            let projectId = s0.projectId
            if (!projectId) {
              projectId = await createChatProject(shapeFor(null, null))
              set({ projectId, userId: currentUserId() })
            }
            snap = await api.createJob({
              projectId, videoIds: attached.length > 0 || referenceVideoId || referenceUrl ? attached : s0.videoIds, prompt, ...style,
            })
          }
          const user: ChatMessage = {
            id: newId(), role: 'user', text: prompt,
            attachments: [
              ...s0.attachments.map((a) => (a.reference ? `${a.name} (style reference)` : a.name)),
              ...(refLink ? [`${refLink} (style reference)`] : []),
            ],
          }
          set((s) => ({
            messages: applySnapshot(capMessages([...s.messages, user, newAssistant(newId(), snap.jobId, snap.turn)]), snap),
            attachments: [],
            referenceLink: null,
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

      setReferenceLink: (url) => set({ referenceLink: url && url.trim() ? url.trim() : null, actionError: null }),

      holdLook: async (jobId) => {
        await getChatApi().answerLook?.(jobId, { hold: true })?.catch(() => undefined)
      },

      lookFromLink: async (jobId, url) => {
        try {
          // The server fetches the video before it answers, so a link that does not work comes back as an error here.
          await getChatApi().answerLook?.(jobId, { url: url.trim() })
        } catch (e) {
          return e instanceof Error ? e.message : String(e)
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
          return e instanceof Error ? e.message : String(e)
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
