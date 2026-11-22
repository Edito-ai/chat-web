// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createChatProject = vi.fn(async (_shape: unknown) => 'proj-1')
const uploadVideo = vi.fn(async (_p: string, f: File) => `remote-${f.name}`)
const deleteAsset = vi.fn(async (_id: string) => undefined)
vi.mock('../chatUploads', () => ({
  createChatProject: (s: unknown) => createChatProject(s),
  uploadVideo: (p: string, f: File) => uploadVideo(p, f),
  deleteAsset: (id: string) => deleteAsset(id),
}))
const probeVideo = vi.fn(async (_f: File) => ({ duration: 10, width: 1920, height: 1080, hasAudio: null as boolean | null }))
vi.mock('../probe', async (orig) => ({ ...(await orig<typeof import('../probe')>()), probeVideo: (f: File) => probeVideo(f) }))

import { ApiError } from '@/lib/apiClient'
import { useAuth } from '@/auth/authStore'
import { setChatApi } from '../chatApi'
import { MAX_POLL_FAILURES, POLL_MS, stopPolling, useChat } from '../chatStore'
import type { ChatApi, ChatJobSnapshot } from '../chatTypes'

const result = { videoUrl: 'https://x/v.mp4', downloadUrl: null, fileName: null }
const base = { message: null, reply: null, error: null, turn: 1, videoIds: ['remote-a.mp4'] }
const running = (jobId: string, progress = 0.3, turn = 1): ChatJobSnapshot =>
  ({ ...base, jobId, turn, status: 'running', stage: 'planning', progress, result: null, canFollowUp: false })
const complete = (jobId: string, turn = 1): ChatJobSnapshot =>
  ({ ...base, jobId, turn, status: 'complete', stage: null, progress: 1, result, canFollowUp: true })

function fakeApi(getJob: ChatApi['getJob']) {
  return {
    createJob: vi.fn(async (..._a: Parameters<ChatApi['createJob']>) => running('job-1', 0.1)),
    followUp: vi.fn(async (id: string, _prompt: string) => running(id, 0.1, 2)),
    getJob: vi.fn(getJob),
    cancelJob: vi.fn(async (id: string) => ({ ...running(id), status: 'cancelled' as const })),
  } satisfies ChatApi
}

const file = (name: string) => new File(['x'], name, { type: 'video/mp4' })
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers()
  stopPolling()
  localStorage.clear()
  useAuth.setState({ user: { id: 'u1', email: 'a@b.c', name: null } })
  useChat.getState().reset()
  createChatProject.mockClear()
  uploadVideo.mockClear()
  deleteAsset.mockClear()
  probeVideo.mockClear()
})
afterEach(() => {
  stopPolling()
  setChatApi(null)
  vi.useRealTimers()
})

describe('chat store: attaching', () => {
  it('creates the project from the first video and uploads each file to it', async () => {
    await useChat.getState().attach([file('a.mp4'), file('b.mp4')])
    await tick(0)
    expect(createChatProject).toHaveBeenCalledTimes(1)
    expect(uploadVideo).toHaveBeenCalledTimes(2)
    expect(uploadVideo.mock.calls[0]![0]).toBe('proj-1')
    expect(useChat.getState().attachments.map((a) => [a.name, a.state, a.videoId])).toEqual([
      ['a.mp4', 'ready', 'remote-a.mp4'],
      ['b.mp4', 'ready', 'remote-b.mp4'],
    ])
  })

  it('makes a portrait project for a portrait video', async () => {
    probeVideo.mockResolvedValueOnce({ duration: 5, width: 1080, height: 1920, hasAudio: null })
    await useChat.getState().attach([file('p.mp4')])
    expect(createChatProject).toHaveBeenCalledWith(expect.objectContaining({ width: 1080, height: 1920, aspect: '9:16' }))
  })

  it('reports files that are not videos or cannot be read, and uploads the rest', async () => {
    probeVideo.mockRejectedValueOnce(new Error('bad'))
    await useChat.getState().attach([new File(['x'], 'notes.txt', { type: 'text/plain' }), file('broken.mp4'), file('ok.mp4')])
    await tick(0)
    expect(uploadVideo).toHaveBeenCalledTimes(1)
    expect((useChat.getState().actionError as Error).message).toContain('broken.mp4')
  })

  it('marks an upload failed and keeps it visible', async () => {
    uploadVideo.mockRejectedValueOnce(new Error('R2 down'))
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    expect(useChat.getState().attachments[0]).toMatchObject({ state: 'failed', error: 'R2 down' })
    expect(await useChat.getState().send('go')).toBe('uploadFailed')
  })

  it('refuses to send while an upload is still running', async () => {
    let finish: (id: string) => void = () => undefined
    uploadVideo.mockImplementationOnce(() => new Promise<string>((r) => (finish = r)))
    const api = fakeApi(async (id) => running(id))
    setChatApi(api)
    await useChat.getState().attach([file('a.mp4')])
    expect(await useChat.getState().send('go')).toBe('uploading')
    expect(api.createJob).not.toHaveBeenCalled()
    finish('remote-a.mp4')
    await tick(0)
    expect(await useChat.getState().send('go')).toBeNull()
  })

  it('removing a finished attachment only detaches it: the upload stays in the library', async () => {
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    useChat.getState().removeAttachment(useChat.getState().attachments[0]!.id)
    expect(useChat.getState().attachments).toEqual([])
    expect(deleteAsset).not.toHaveBeenCalled()
  })

  it('starting a new chat does not delete what was uploaded either', async () => {
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    await useChat.getState().newChat()
    expect(deleteAsset).not.toHaveBeenCalled()
  })
})

describe('chat store: sending', () => {
  it('refuses an empty prompt and does not call the API', async () => {
    const api = fakeApi(async (id) => running(id))
    setChatApi(api)
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    expect(await useChat.getState().send('   ')).toBe('noPrompt')
    expect(api.createJob).not.toHaveBeenCalled()
  })

  it('words alone start a conversation: it makes its own project and sends no videos', async () => {
    const api = fakeApi(async (id) => running(id))
    setChatApi(api)
    expect(await useChat.getState().send('hi')).toBeNull()
    expect(createChatProject).toHaveBeenCalledTimes(1)
    expect(api.createJob).toHaveBeenCalledWith({ projectId: 'proj-1', videoIds: [], prompt: 'hi' })
  })

  it('a plain reply is a finished turn with no video, keeps its quick replies, and the chat can go on', async () => {
    const reply: ChatJobSnapshot = {
      ...base, videoIds: [], jobId: 'job-1', status: 'complete', stage: null, progress: 1, result: null, canFollowUp: true,
      kind: 'chat', reply: 'Hi! Upload footage or tell me what to make.',
      suggestions: [{ id: 'upload', label: 'Upload footage', action: 'upload', prompt: null }],
    }
    const api = fakeApi(async () => reply)
    api.createJob.mockResolvedValueOnce({ ...reply, status: 'queued', result: null, reply: null, suggestions: [] })
    setChatApi(api)
    await useChat.getState().send('hi')
    await tick(2500)
    const last = useChat.getState().messages.at(-1)
    expect(last).toMatchObject({ role: 'assistant', status: 'complete', kind: 'chat', result: null })
    expect(last).toMatchObject({ reply: 'Hi! Upload footage or tell me what to make.', suggestions: [{ id: 'upload' }] })
    expect(useChat.getState().canFollowUp).toBe(true)
    // the next message continues the same conversation, it does not start a new job
    await useChat.getState().send('make a promo')
    expect(api.followUp).toHaveBeenCalledWith('job-1', 'make a promo', undefined, [])
    expect(api.createJob).toHaveBeenCalledTimes(1)
  })

  it('footage added after a reply travels with the next message', async () => {
    const reply: ChatJobSnapshot = {
      ...base, videoIds: [], jobId: 'job-1', status: 'complete', stage: null, progress: 1, result: null, canFollowUp: true, kind: 'chat',
    }
    const api = fakeApi(async () => reply)
    setChatApi(api)
    await useChat.getState().send('hi')
    await tick(2500)
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    await useChat.getState().send('cut the pauses')
    expect(api.followUp).toHaveBeenCalledWith('job-1', 'cut the pauses', undefined, ['remote-a.mp4'])
  })

  it('library picks are attached as ready, move a footage-less chat to their project, and are never deleted', async () => {
    setChatApi(fakeApi(async (id) => running(id)))
    useChat.getState().attachFromLibrary([{ id: 'lib-1', name: 'old.mp4', durationSec: 12, projectId: 'old-proj', createdAt: '2026-01-01' }])
    const s = useChat.getState()
    expect(s.projectId).toBe('old-proj')
    expect(s.attachments).toMatchObject([{ name: 'old.mp4', state: 'ready', videoId: 'lib-1', fromLibrary: true }])
    useChat.getState().removeAttachment(s.attachments[0]!.id)
    expect(deleteAsset).not.toHaveBeenCalled()
  })

  it('creates a job with backend ids, and finishes with a video', async () => {
    const polls = [running('job-1', 0.2), running('job-1', 0.6), complete('job-1')]
    const api = fakeApi(async () => polls.shift()!)
    setChatApi(api)
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    expect(useChat.getState().projectId).toBe('proj-1')
    expect(await useChat.getState().send('make it punchy')).toBeNull()
    expect(api.createJob).toHaveBeenCalledWith({ projectId: 'proj-1', videoIds: ['remote-a.mp4'], prompt: 'make it punchy' })
    expect(useChat.getState().attachments).toEqual([])
    await tick(0)
    await tick(POLL_MS)
    await tick(POLL_MS)
    expect(useChat.getState().messages.at(-1)).toMatchObject({ role: 'assistant', status: 'complete', result })
    expect(useChat.getState().messages[0]).toMatchObject({ role: 'user', text: 'make it punchy', attachments: ['a.mp4'] })
  })

  it('sends a follow-up on the same job as a new turn', async () => {
    const api = fakeApi(async (id) => complete(id))
    setChatApi(api)
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    await useChat.getState().send('first')
    await tick(0)
    expect(useChat.getState().canFollowUp).toBe(true)
    expect(await useChat.getState().send('captions bigger')).toBeNull()
    expect(api.followUp).toHaveBeenCalledWith('job-1', 'captions bigger', undefined, [])
    expect(api.createJob).toHaveBeenCalledTimes(1)
    expect(useChat.getState().messages.at(-1)).toMatchObject({ role: 'assistant', turn: 2, status: 'running' })
  })

  it('will not start a second job while one is running', async () => {
    const api = fakeApi(async (id) => running(id))
    setChatApi(api)
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    await useChat.getState().send('one')
    await useChat.getState().send('two')
    expect(api.createJob).toHaveBeenCalledTimes(1)
  })

  it('keeps the attachments and surfaces the error when job creation fails', async () => {
    const api = fakeApi(async (id) => running(id))
    api.createJob.mockRejectedValueOnce(new ApiError(500, '500 boom'))
    setChatApi(api)
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    await useChat.getState().send('go')
    expect(useChat.getState().actionError).toBeInstanceOf(ApiError)
    expect(useChat.getState().attachments).toHaveLength(1)
    expect(useChat.getState().messages).toEqual([])
  })
})

describe('chat store: polling, cancel, failure', () => {
  async function started(api: ChatApi) {
    setChatApi(api)
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    await useChat.getState().send('go')
  }

  it('cancel stops polling, marks the job stopped and tells the API', async () => {
    const api = fakeApi(async (id) => running(id))
    await started(api)
    await tick(0)
    const calls = api.getJob.mock.calls.length
    await useChat.getState().cancel()
    await tick(POLL_MS * 5)
    expect(api.cancelJob).toHaveBeenCalledWith('job-1')
    expect(api.getJob.mock.calls.length).toBe(calls)
    expect(useChat.getState().messages.at(-1)).toMatchObject({ status: 'cancelled' })
  })

  it('shows a failed job with the server reason', async () => {
    const api = fakeApi(async (id) => ({ ...running(id), status: 'failed' as const, error: 'No speech found' }))
    await started(api)
    await tick(0)
    expect(useChat.getState().messages.at(-1)).toMatchObject({ status: 'failed', error: 'No speech found' })
  })

  it('a message after a failed job starts the new job in the SAME chat (chatId), not a new one', async () => {
    const api = fakeApi(async (id) => ({ ...running(id), status: 'failed' as const, error: 'The edit stopped responding.' }))
    await started(api)
    await tick(0)
    expect(useChat.getState().canFollowUp).toBe(false)
    api.createJob.mockResolvedValueOnce(running('job-1', 0.1, 2))
    expect(await useChat.getState().send('try again')).toBeNull()
    expect(api.followUp).not.toHaveBeenCalled()
    expect(api.createJob).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: 'try again', chatId: 'job-1', videoIds: ['remote-a.mp4'] }))
    const msgs = useChat.getState().messages
    expect(msgs.filter((m) => m.role === 'user').map((m) => (m.role === 'user' ? m.text : ''))).toEqual(['go', 'try again'])
    expect(msgs.at(-1)).toMatchObject({ role: 'assistant', jobId: 'job-1', turn: 2 })
  })

  it('a reply that takes no follow-up (canFollowUp false) also keeps the next message in the same chat', async () => {
    const reply: ChatJobSnapshot = {
      ...base, videoIds: [], jobId: 'job-1', status: 'complete', stage: null, progress: 1, result: null, canFollowUp: false, kind: 'chat',
      reply: 'Hi!',
    }
    const api = fakeApi(async () => reply)
    setChatApi(api)
    await useChat.getState().send('hi')
    await tick(2500)
    await useChat.getState().send('make a promo')
    expect(api.createJob).toHaveBeenCalledTimes(2)
    expect(api.createJob.mock.calls[0]![0]).not.toHaveProperty('chatId')
    expect(api.createJob.mock.calls[1]![0]).toMatchObject({ prompt: 'make a promo', chatId: 'job-1' })
  })

  it('a new chat never carries the old chat id', async () => {
    const api = fakeApi(async (id) => ({ ...running(id), status: 'failed' as const, error: 'x' }))
    await started(api)
    await tick(0)
    await useChat.getState().newChat()
    await useChat.getState().send('hello')
    expect(api.createJob.mock.calls.at(-1)![0]).not.toHaveProperty('chatId')
  })

  it('tolerates a few failed polls, then reports lost contact and Retry resumes', async () => {
    let healthy = false
    const api = fakeApi(async (id) => {
      if (!healthy) throw new TypeError('Failed to fetch')
      return complete(id)
    })
    await started(api)
    await tick(10 * 60_000)
    expect(api.getJob).toHaveBeenCalledTimes(MAX_POLL_FAILURES)
    expect(useChat.getState().pollLostJobId).toBe('job-1')
    expect(useChat.getState().messages.at(-1)).toMatchObject({ status: 'running' })
    healthy = true
    useChat.getState().retryPolling()
    await tick(0)
    expect(useChat.getState().messages.at(-1)).toMatchObject({ status: 'complete' })
    expect(useChat.getState().pollLostJobId).toBeNull()
  })

  it('a 404 on the job fails it straight away', async () => {
    const api = fakeApi(async () => {
      throw new ApiError(404, '404 not found')
    })
    await started(api)
    await tick(0)
    expect(api.getJob).toHaveBeenCalledTimes(1)
    expect(useChat.getState().messages.at(-1)).toMatchObject({ status: 'failed' })
  })
})

describe('chat store: opening the app starts a new chat', () => {
  it('startFresh empties the chat but never cancels a job that is still running', async () => {
    const api = fakeApi(async (id) => running(id))
    setChatApi(api)
    useChat.setState({
      userId: 'u1',
      projectId: 'proj-1',
      jobId: 'job-9',
      canFollowUp: true,
      messages: [
        { id: 'u', role: 'user', text: 'go', attachments: [] },
        { id: 'a', role: 'assistant', jobId: 'job-9', turn: 1, reply: null, status: 'running', stage: 'editing', progress: 0.5, message: null, result: null, error: null },
      ],
    })
    useChat.getState().startFresh()
    const s = useChat.getState()
    expect(s.messages).toEqual([])
    expect(s.jobId).toBeNull()
    expect(s.projectId).toBeNull()
    expect(s.canFollowUp).toBe(false)
    expect(api.cancelJob).not.toHaveBeenCalled()
    expect(api.getJob).not.toHaveBeenCalled()
  })
})

describe('chat store: resume after reload', () => {
  it('persists the project id and transcript but not attachments or errors', async () => {
    setChatApi(fakeApi(async (id) => running(id)))
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    await useChat.getState().send('go')
    const saved = JSON.parse(localStorage.getItem('edito.chat-web.chat.v1')!).state
    expect(saved.projectId).toBe('proj-1')
    expect(saved.userId).toBe('u1')
    expect(saved.messages).toHaveLength(2)
    expect(saved.attachments).toBeUndefined()
    expect(saved.actionError).toBeUndefined()
  })

  it('re-attaches to the in-flight job without creating another', async () => {
    const api = fakeApi(async (id) => complete(id))
    setChatApi(api)
    useChat.setState({
      userId: 'u1',
      projectId: 'proj-1',
      messages: [
        { id: 'u', role: 'user', text: 'go', attachments: [] },
        { id: 'a', role: 'assistant', jobId: 'job-9', turn: 1, reply: null, status: 'running', stage: 'editing', progress: 0.5, message: null, result: null, error: null },
      ],
    })
    await useChat.getState().resume()
    await tick(0)
    expect(api.createJob).not.toHaveBeenCalled()
    expect(api.getJob).toHaveBeenCalledWith('job-9', expect.anything())
    expect(useChat.getState().messages.at(-1)).toMatchObject({ status: 'complete', result })
  })

  it('refreshes the URL of the last finished video', async () => {
    const fresh = { videoUrl: 'https://x/fresh.mp4', downloadUrl: null, fileName: null }
    setChatApi(fakeApi(async (id) => ({ ...complete(id), result: fresh })))
    useChat.setState({
      userId: 'u1',
      projectId: 'proj-1',
      messages: [{ id: 'a', role: 'assistant', jobId: 'job-9', turn: 1, reply: null, status: 'complete', stage: null, progress: 1, message: null, result, error: null }],
    })
    await useChat.getState().resume()
    expect(useChat.getState().messages[0]).toMatchObject({ result: fresh })
  })

  it('drops a transcript that belongs to another account', async () => {
    const api = fakeApi(async (id) => running(id))
    setChatApi(api)
    useChat.setState({
      userId: 'someone-else',
      projectId: 'proj-x',
      messages: [{ id: 'a', role: 'assistant', jobId: 'job-9', turn: 1, reply: null, status: 'running', stage: null, progress: null, message: null, result: null, error: null }],
    })
    await useChat.getState().resume()
    expect(useChat.getState().messages).toEqual([])
    expect(useChat.getState().projectId).toBeNull()
    expect(api.getJob).not.toHaveBeenCalled()
  })
})

describe('chat store: new chat', () => {
  it('cancels a running job and starts clean', async () => {
    const api = fakeApi(async (id) => running(id))
    setChatApi(api)
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    await useChat.getState().send('go')
    await useChat.getState().newChat()
    expect(api.cancelJob).toHaveBeenCalledWith('job-1')
    expect(useChat.getState()).toMatchObject({ messages: [], projectId: null, attachments: [] })
  })
})

describe('chat store: edit, retry, queue, stop and send', () => {
  async function runningJob(api: ReturnType<typeof fakeApi>) {
    setChatApi(api)
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    await useChat.getState().send('make it punchy')
    await tick(0)
  }

  it('editing the last message while it runs replaces that turn and keeps watching the job', async () => {
    const api = { ...fakeApi(async (id) => running(id)), editTurn: vi.fn(async (id: string) => ({ ...running(id, 0), message: 'Stopping' })) }
    await runningJob(api)
    const userId = useChat.getState().messages[0]!.id
    expect(await useChat.getState().editMessage(userId, 'make it calm')).toBeNull()
    expect(api.editTurn).toHaveBeenCalledWith('job-1', 1, 'make it calm')
    const msgs = useChat.getState().messages
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatchObject({ role: 'user', text: 'make it calm', edited: true })
    expect(msgs[1]).toMatchObject({ role: 'assistant', jobId: 'job-1', turn: 1, status: 'running' })
  })

  it('only the last message can be edited', async () => {
    const api = { ...fakeApi(async (id) => complete(id)), editTurn: vi.fn(async (id: string) => running(id)) }
    await runningJob(api)
    await useChat.getState().send('captions bigger')
    await tick(0)
    const first = useChat.getState().messages[0]!.id
    expect(await useChat.getState().editMessage(first, 'x')).toMatch(/last message/)
    expect(api.editTurn).not.toHaveBeenCalled()
  })

  it('a run on another server is stopped first, then the edit is sent again', async () => {
    let stopped = false
    const api = {
      ...fakeApi(async (id) => (stopped ? { ...running(id), status: 'cancelled' as const } : running(id))),
      editTurn: vi.fn(async (id: string) => {
        if (!stopped) {
          const e = new ApiError(409, '409 stop first')
          e.code = 'stop_first'
          throw e
        }
        return running(id, 0)
      }),
    }
    api.cancelJob.mockImplementation(async (id: string) => {
      stopped = true
      return { ...running(id), status: 'cancelled' as const }
    })
    await runningJob(api)
    const userId = useChat.getState().messages[0]!.id
    const done = useChat.getState().editMessage(userId, 'make it calm')
    await tick(POLL_MS * 2)
    expect(await done).toBeNull()
    expect(api.cancelJob).toHaveBeenCalledWith('job-1')
    expect(api.editTurn).toHaveBeenCalledTimes(2)
  })

  it('retry replaces a failed answer and polls the new run', async () => {
    const api = {
      ...fakeApi(async (id) => ({ ...running(id), status: 'failed' as const, error: 'boom' })),
      retryTurn: vi.fn(async (id: string) => running(id, 0.1)),
    }
    await runningJob(api)
    const failed = useChat.getState().messages[1]!
    expect(failed).toMatchObject({ status: 'failed' })
    api.getJob.mockImplementation(async (id: string) => running(id, 0.2))
    await useChat.getState().retryTurn(failed.id)
    const now = useChat.getState().messages[1]!
    expect(api.retryTurn).toHaveBeenCalledWith('job-1')
    expect(now.id).not.toBe(failed.id)
    expect(now).toMatchObject({ role: 'assistant', status: 'running' })
  })

  it('a message typed while a turn runs waits in the queue and goes out when the turn completes', async () => {
    const polls = [running('job-1', 0.5), complete('job-1')]
    const api = fakeApi(async (id) => polls.shift() ?? complete(id))
    await runningJob(api)
    expect(await useChat.getState().send('captions bigger')).toBeNull() // no mode while busy: nothing happens
    expect(useChat.getState().queue).toEqual([])
    expect(await useChat.getState().send('captions bigger', 'queue')).toBeNull()
    expect(useChat.getState().queue.map((q) => q.text)).toEqual(['captions bigger'])
    await tick(POLL_MS)
    await tick(POLL_MS)
    await tick(0)
    expect(api.followUp).toHaveBeenCalledWith('job-1', 'captions bigger', undefined, [])
    expect(useChat.getState().queue).toEqual([])
  })

  it('Stop drops the waiting messages', async () => {
    const api = fakeApi(async (id) => running(id))
    await runningJob(api)
    await useChat.getState().send('later', 'queue')
    await useChat.getState().cancel()
    expect(useChat.getState().queue).toEqual([])
  })

  it('stop and send: the running turn shows stopped and the new message is the next turn', async () => {
    const api = { ...fakeApi(async (id) => running(id)), interrupt: vi.fn(async (id: string) => ({ ...running(id, 0), status: 'queued' as const })) }
    await runningJob(api)
    expect(await useChat.getState().send('and make it 30 seconds', 'interrupt')).toBeNull()
    expect(api.interrupt).toHaveBeenCalledWith('job-1', 'and make it 30 seconds')
    const msgs = useChat.getState().messages
    expect(msgs.map((m) => (m.role === 'user' ? m.text : `${m.status}:${m.turn}`))).toEqual([
      'make it punchy', 'cancelled:1', 'and make it 30 seconds', 'queued:2',
    ])
  })
})

describe('chat store: the message shows at once', () => {
  it('the message and a typing bubble show while the server reads it; the bubble becomes the answer', async () => {
    let answer!: (s: ChatJobSnapshot) => void
    const api = fakeApi(async (id) => running(id))
    api.createJob.mockImplementationOnce(() => new Promise<ChatJobSnapshot>((r) => { answer = r }))
    setChatApi(api)
    const sent = useChat.getState().send('hi')
    await tick(0)
    const during = useChat.getState().messages
    expect(during.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(during[1]).toMatchObject({ kind: 'chat', status: 'queued', jobId: '' })
    answer({ ...running('job-1'), kind: 'chat', videoIds: [] })
    await sent
    const after = useChat.getState().messages
    expect(after).toHaveLength(2)
    expect(after[0]).toMatchObject({ role: 'user', text: 'hi' })
    expect(after[1]).toMatchObject({ role: 'assistant', jobId: 'job-1' })
  })

  it('a refused send takes the message and the typing bubble away again', async () => {
    const api = fakeApi(async (id) => running(id))
    api.createJob.mockRejectedValueOnce(new ApiError(500, '500 boom'))
    setChatApi(api)
    await useChat.getState().send('hi')
    expect(useChat.getState().messages).toEqual([])
  })
})
