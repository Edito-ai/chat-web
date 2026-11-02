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

  it('removing a finished attachment deletes the uploaded asset', async () => {
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    useChat.getState().removeAttachment(useChat.getState().attachments[0]!.id)
    expect(useChat.getState().attachments).toEqual([])
    expect(deleteAsset).toHaveBeenCalledWith('remote-a.mp4')
  })
})

describe('chat store: sending', () => {
  it('refuses without a video or prompt, and does not call the API', async () => {
    const api = fakeApi(async (id) => running(id))
    setChatApi(api)
    expect(await useChat.getState().send('hello')).toBe('noVideo')
    await useChat.getState().attach([file('a.mp4')])
    await tick(0)
    expect(await useChat.getState().send('   ')).toBe('noPrompt')
    expect(api.createJob).not.toHaveBeenCalled()
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
    expect(api.followUp).toHaveBeenCalledWith('job-1', 'captions bigger')
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
