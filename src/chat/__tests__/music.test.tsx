// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const uploadVideo = vi.fn(async (_p: string, f: File) => `remote-${f.name}`)
vi.mock('../chatUploads', () => ({
  createChatProject: async () => 'proj-1',
  uploadVideo: (p: string, f: File) => uploadVideo(p, f),
  deleteAsset: async () => undefined,
}))

import { ApiError, apiClient } from '@/lib/apiClient'
import { useAuth } from '@/auth/authStore'
import { setChatApi } from '../chatApi'
import { POLL_MS, stopPolling, useChat } from '../chatStore'
import { MusicPanel } from '../MusicPanel'
import { setMusicApi, toMusicBody, toMusicState, httpMusicApi, looksLikeAudio, type MusicApi, type MusicState } from '../music'
import type { ChatApi, ChatJobSnapshot } from '../chatTypes'

const wireState = {
  canChange: true,
  current: { enabled: true, kind: 'library', id: 't1', title: 'Menu Music', artist: 'mrpoly', volume: 0.1 },
  suggestions: [
    { id: 't1', title: 'Menu Music', artist: 'mrpoly', mood: 'calm', energy: 0.27, durationSec: 47.7, license: 'CC0-1.0', previewUrl: 'http://x/music/t1/preview', selected: true },
    { id: 't2', title: 'Free And Lucky', artist: 'David Zorff', mood: 'uplifting', energy: 0.63, durationSec: 147.7, license: 'CC0-1.0', previewUrl: 'http://x/music/t2/preview', selected: false },
    { id: 't3', title: 'Bossa Nova', artist: 'x', mood: 'chill', energy: 0.41, durationSec: 59, license: 'CC0-1.0', previewUrl: 'http://x/music/t3/preview', selected: false },
  ],
  uploads: [{ id: 'u1', name: 'My Song.mp3', durationSec: 12, createdAt: 'x' }],
  volume: { value: 0.1, min: 0, max: 0.4, default: 0.1 },
  upload: { maxBytes: 80_000_000, maxSeconds: 600, formats: ['.mp3'] },
}

describe('music card: wire mapping', () => {
  it('maps the card, keeping what the screen needs', () => {
    const s = toMusicState(wireState)
    expect(s.canChange).toBe(true)
    expect(s.current).toMatchObject({ enabled: true, id: 't1', title: 'Menu Music', volume: 0.1 })
    expect(s.suggestions.map((t) => [t.id, t.selected])).toEqual([['t1', true], ['t2', false], ['t3', false]])
    expect(s.uploads).toEqual([{ id: 'u1', name: 'My Song.mp3', durationSec: 12 }])
    expect(s.volume).toEqual({ value: 0.1, min: 0, max: 0.4, default: 0.1 })
    expect(s.limits).toEqual({ maxBytes: 80_000_000, maxSeconds: 600 })
  })

  it('survives a thin or malformed answer with safe defaults, and drops a track with no preview link', () => {
    const s = toMusicState({ suggestions: [{ id: 'a' }, { id: 'b', previewUrl: 'u' }, 7, null] })
    expect(s.canChange).toBe(false)
    expect(s.current).toMatchObject({ enabled: false, id: null, volume: 0.1 })
    expect(s.suggestions.map((t) => t.id)).toEqual(['b'])
    expect(s.volume.max).toBe(0.4)
    expect(toMusicState(null).suggestions).toEqual([])
  })

  it('builds the request body of each choice', () => {
    expect(toMusicBody({ source: 'library', trackId: 't2' })).toEqual({ source: 'library', trackId: 't2' })
    expect(toMusicBody({ source: 'library', trackId: 't2', volume: 0.2 })).toEqual({ source: 'library', trackId: 't2', volume: 0.2 })
    expect(toMusicBody({ source: 'upload', uploadId: 'u1' })).toEqual({ source: 'upload', uploadId: 'u1' })
    expect(toMusicBody({ source: 'none' })).toEqual({ source: 'none' })
    expect(toMusicBody({ source: 'keep', volume: 0.3 })).toEqual({ source: 'keep', volume: 0.3 })
  })

  it('treats a backend without a music card (404) as "no card", and passes real failures on', async () => {
    const get = vi.spyOn(apiClient, 'get')
    get.mockRejectedValueOnce(new ApiError(404, '404 Not Found'))
    expect(await httpMusicApi.get('job-1')).toBeNull()
    get.mockRejectedValueOnce(new ApiError(500, '500 boom'))
    await expect(httpMusicApi.get('job-1')).rejects.toThrow('500')
    get.mockRestore()
  })

  it('recognises audio files by type or extension', () => {
    expect(looksLikeAudio(new File(['x'], 'a.mp3'))).toBe(true)
    expect(looksLikeAudio(new File(['x'], 'a.bin', { type: 'audio/mpeg' }))).toBe(true)
    expect(looksLikeAudio(new File(['x'], 'a.mp4', { type: 'video/mp4' }))).toBe(false)
  })
})

const result = { videoUrl: 'https://x/v.mp4', downloadUrl: null, fileName: null }
const base = { message: null, reply: null, error: null, videoIds: ['v1'] }
const done = (turn: number, reply: string | null = null): ChatJobSnapshot =>
  ({ ...base, jobId: 'job-1', turn, status: 'complete', stage: null, progress: 1, result, canFollowUp: true, reply })
const queued = (turn: number): ChatJobSnapshot =>
  ({ ...base, jobId: 'job-1', turn, status: 'queued', stage: 'queued', progress: 0, result: null, canFollowUp: false })

function fakeChatApi(getJob: ChatApi['getJob']): ChatApi {
  return {
    createJob: vi.fn(async () => queued(1)),
    followUp: vi.fn(async () => queued(2)),
    getJob: vi.fn(getJob),
    cancelJob: vi.fn(async () => ({ ...queued(1), status: 'cancelled' as const })),
  }
}
const finishedChat = () =>
  useChat.setState({
    jobId: 'job-1', projectId: 'proj-1', canFollowUp: true, videoIds: ['v1'], userId: 'u1',
    messages: [
      { id: 'u-1', role: 'user', text: 'make it', attachments: [] },
      { id: 'a-1', role: 'assistant', jobId: 'job-1', turn: 1, status: 'complete', stage: null, progress: 1, message: null, reply: 'Done.', result, error: null },
    ],
  })

beforeEach(() => {
  vi.useFakeTimers()
  stopPolling()
  localStorage.clear()
  useAuth.setState({ user: { id: 'u1', email: 'a@b.c', name: null } })
  useChat.getState().reset()
  uploadVideo.mockClear()
})
afterEach(() => {
  stopPolling()
  setChatApi(null)
  setMusicApi(null)
  vi.useRealTimers()
})

describe('chat store: changeMusic', () => {
  it('starts a new turn with the label as the person\'s message, then follows it to the finished video', async () => {
    finishedChat()
    const set = vi.fn(async (_id: string, _c: unknown) => queued(2))
    setMusicApi({ get: async () => null, set } satisfies MusicApi)
    let polls = 0
    setChatApi(fakeChatApi(async () => (++polls < 2 ? queued(2) : done(2, 'Now playing "Bossa Nova" under the voice.'))))

    await useChat.getState().changeMusic({ source: 'library', trackId: 't3' }, 'Change the music to "Bossa Nova"')
    expect(set).toHaveBeenCalledWith('job-1', { source: 'library', trackId: 't3' })
    let msgs = useChat.getState().messages
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(msgs[2]).toMatchObject({ role: 'user', text: 'Change the music to "Bossa Nova"' })
    expect(msgs[3]).toMatchObject({ role: 'assistant', turn: 2, status: 'queued' })
    expect(useChat.getState().canFollowUp).toBe(false)

    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    msgs = useChat.getState().messages
    expect(msgs[3]).toMatchObject({ status: 'complete', reply: 'Now playing "Bossa Nova" under the voice.' })
    expect(useChat.getState().canFollowUp).toBe(true)
    expect(useChat.getState().actionError).toBeNull()
  })

  it('does nothing while a turn is running or when the chat cannot be followed up', async () => {
    const set = vi.fn(async () => queued(2))
    setMusicApi({ get: async () => null, set })
    finishedChat()
    useChat.setState({ canFollowUp: false })
    await useChat.getState().changeMusic({ source: 'none' }, 'x')
    finishedChat()
    useChat.setState((s) => ({ messages: [...s.messages, { id: 'a-2', role: 'assistant', jobId: 'job-1', turn: 2, status: 'running', stage: 'rendering', progress: 0.5, message: null, reply: null, result: null, error: null }] }))
    await useChat.getState().changeMusic({ source: 'none' }, 'x')
    expect(set).not.toHaveBeenCalled()
  })

  it('keeps the video and shows the error when the backend refuses', async () => {
    finishedChat()
    setMusicApi({ get: async () => null, set: async () => { throw new ApiError(400, '400 That track is not in the library.') } })
    await useChat.getState().changeMusic({ source: 'library', trackId: 'gone' }, 'x')
    expect(useChat.getState().actionError).toBeInstanceOf(ApiError)
    expect(useChat.getState().messages).toHaveLength(2)
    expect(useChat.getState().busy).toBe(false)
  })
})

describe('MusicPanel', () => {
  let host: HTMLDivElement
  let root: Root
  const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }) }
  const click = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { (el as HTMLElement).click() }) }
  const render = async (api: MusicApi) => {
    setMusicApi(api)
    await act(async () => { root.render(createElement(MusicPanel, { jobId: 'job-1', turn: 1 })) })
    await flush()
  }
  const q = (id: string) => host.querySelector(`[data-testid="${id}"]`)

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    finishedChat()
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('renders nothing when the backend has no music card, or the read fails', async () => {
    await render({ get: async () => null, set: vi.fn() })
    expect(host.innerHTML).toBe('')
    await render({ get: async () => { throw new Error('boom') }, set: vi.fn() })
    expect(host.innerHTML).toBe('')
  })

  it('shows what plays now, opens to the three suggestions, and picks one', async () => {
    const changeMusic = vi.spyOn(useChat.getState(), 'changeMusic').mockResolvedValue()
    useChat.setState({ changeMusic })
    await render({ get: async () => toMusicState(wireState), set: vi.fn() })
    expect(q('chat-music-toggle')!.textContent).toContain('Menu Music · mrpoly')
    expect(q('chat-music-track-t2')).not.toBeNull() // open from the start: the suggestions and the upload are visible
    expect(host.querySelectorAll('[data-testid^="chat-music-track-"]')).toHaveLength(3)
    expect(q('chat-music-use-t1')).toBeNull() // the one in use has no Use button
    await click(q('chat-music-use-t2'))
    expect(changeMusic).toHaveBeenCalledWith({ source: 'library', trackId: 't2' }, 'Change the music to "Free And Lucky"')
  })

  it('applies a new volume to the current track only after the slider moved, and can remove the music', async () => {
    const changeMusic = vi.fn(async () => undefined)
    useChat.setState({ changeMusic })
    await render({ get: async () => toMusicState(wireState), set: vi.fn() })
    expect(q('chat-music-apply')).toBeNull()
    const slider = q('chat-music-volume') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '0.25')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(q('chat-music-apply'))
    expect(changeMusic).toHaveBeenLastCalledWith({ source: 'keep', volume: 0.25 }, 'Set the music volume to 25%')
    await click(q('chat-music-none'))
    expect(changeMusic).toHaveBeenLastCalledWith({ source: 'none' }, 'Remove the background music')
  })

  it('uploads the person\'s own audio file, then asks for it; refuses a non-audio or oversized file', async () => {
    const changeMusic = vi.fn(async () => undefined)
    useChat.setState({ changeMusic })
    await render({ get: async () => toMusicState(wireState), set: vi.fn() })
    const input = q('chat-music-file') as HTMLInputElement
    const pick = async (f: File) => {
      Object.defineProperty(input, 'files', { value: [f], configurable: true })
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
      await flush()
    }
    await pick(new File(['x'], 'photo.png', { type: 'image/png' }))
    expect(host.textContent).toContain('That is not an audio file')
    expect(uploadVideo).not.toHaveBeenCalled()
    const big = new File(['x'], 'big.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(big, 'size', { value: 81_000_000 })
    await pick(big)
    expect(host.textContent).toContain('bigger than 80 MB')
    // the browser cannot decode the fake bytes: the length is then unknown (0), which the upload route tolerates
    const probe = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    const ok = new File(['x'], 'My Song.mp3', { type: 'audio/mpeg' })
    Object.defineProperty(input, 'files', { value: [ok], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000) })
    probe.mockRestore()
    expect(uploadVideo).toHaveBeenCalledWith('proj-1', ok)
    expect(changeMusic).toHaveBeenLastCalledWith({ source: 'upload', uploadId: 'remote-My Song.mp3' }, 'Use my music "My Song"')
  })

  it('locks every action while the chat is busy or the video is not finished', async () => {
    const st: MusicState = toMusicState({ ...wireState, canChange: false })
    await render({ get: async () => st, set: vi.fn() })
    expect((q('chat-music-use-t2') as HTMLButtonElement).disabled).toBe(true)
    expect((q('chat-music-none') as HTMLButtonElement).disabled).toBe(true)
    expect(host.textContent).toContain('once the video is finished')
  })
})
