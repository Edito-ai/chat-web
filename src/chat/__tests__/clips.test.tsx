// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('../chatUploads', () => ({
  createChatProject: async () => 'proj-1',
  uploadVideo: async () => 'v-up',
  deleteAsset: async () => undefined,
}))

import { ApiError } from '@/lib/apiClient'
import { useAuth } from '@/auth/authStore'
import { setChatApi, toSnapshot } from '../chatApi'
import { POLL_MS, stopPolling, useChat } from '../chatStore'
import { ClipsBoard } from '../ClipsBoard'
import { clampOptions, clock, setClipsApi, splitLink, toClips, type ClipsApi } from '../clips'
import type { ChatApi, ChatAssistantMessage, ChatJobSnapshot, ClipItem, CreateChatJobInput } from '../chatTypes'

const wireClip = (id: string, start: number, end: number, extra: Record<string, unknown> = {}) => ({
  id, start, end, durationSec: end - start, title: `Title ${id}`, reason: 'Big laugh', score: 90, text: 'what was said',
  state: 'ready', error: null, version: 0, videoUrl: `http://x/files/j/clips/${id}-0.mp4`, thumbUrl: `http://x/files/j/clips/${id}-0.jpg`,
  downloadUrl: `http://x/files/j/clips/${id}-0.mp4?download=1`, downloadFilename: `Title ${id}.mp4`, ...extra,
})

const clipsWire = (state: string, clips: unknown[] = []) => ({
  id: 'clip-job', state, kind: 'clips', turn: 1, progress: state === 'complete' ? 1 : 0.4, reply: state === 'complete' ? 'Found 2 clips.' : null,
  canFollowUp: false, videoIds: ['v1'], source: { kind: 'upload', title: 'my stream', durationSec: 7200 }, clips,
})

describe('clips: wire mapping and helpers', () => {
  it('maps a finished clipping job: no single video, a list of clips, the source', () => {
    const snap = toSnapshot(clipsWire('complete', [wireClip('c01', 10, 40), wireClip('c02', 100, 130, { score: 50 })]) as never)
    expect(snap.status).toBe('complete')
    expect(snap.result).toBeNull()
    expect(snap.clips?.map((c) => [c.id, c.score, c.durationSec])).toEqual([['c01', 90, 30], ['c02', 50, 30]])
    expect(snap.source).toEqual({ kind: 'upload', title: 'my stream', durationSec: 7200 })
  })

  it('drops malformed clips and fills safe defaults', () => {
    const got = toClips([{ id: 'a' }, { id: 'b', start: 5, end: 2 }, null, 7, { id: 'ok', start: 1, end: 4, state: 'weird' }])
    expect(got.map((c) => c.id)).toEqual(['ok'])
    expect(got[0]).toMatchObject({ state: 'failed', title: 'ok', durationSec: 3, videoUrl: null, downloadFilename: 'ok.mp4' })
    expect(toClips('nope')).toEqual([])
  })

  it('an edit job has no clips fields at all', () => {
    const snap = toSnapshot({ id: 'e', state: 'complete', kind: 'edit', previewUrl: 'http://x/v.mp4' })
    expect(snap.clips).toBeUndefined()
    expect(snap.result?.videoUrl).toBe('http://x/v.mp4')
  })

  it('splits a link out of the message and keeps the rest as the focus', () => {
    expect(splitLink('only funny bits https://youtu.be/abc?t=3. please')).toEqual({ url: 'https://youtu.be/abc?t=3', rest: 'only funny bits please' })
    expect(splitLink('no link here')).toEqual({ url: null, rest: 'no link here' })
  })

  it('formats times and clamps options', () => {
    expect([clock(0), clock(75), clock(3725)]).toEqual(['0:00', '1:15', '1:02:05'])
    expect(clampOptions({ count: 99, minSec: 300, maxSec: 2 })).toEqual({ count: 20, minSec: 10, maxSec: 15 })
    expect(clampOptions({})).toEqual({ count: 12, minSec: 20, maxSec: 75 })
  })
})

function fakeChatApi(getJob: ChatApi['getJob'], create?: (i: CreateChatJobInput) => ChatJobSnapshot): ChatApi & { createJob: ReturnType<typeof vi.fn> } {
  return {
    createJob: vi.fn(async (i: CreateChatJobInput) => (create ? create(i) : toSnapshot(clipsWire('queued') as never))),
    followUp: vi.fn(async () => { throw new Error('not used') }),
    getJob: vi.fn(getJob),
    cancelJob: vi.fn(async () => toSnapshot({ ...clipsWire('cancelled') } as never)),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  stopPolling()
  localStorage.clear()
  useAuth.setState({ user: { id: 'u1', email: 'a@b.c', name: null } })
  useChat.getState().reset()
})
afterEach(() => {
  stopPolling()
  setChatApi(null)
  setClipsApi(null)
  vi.useRealTimers()
})

describe('chat store: clipping', () => {
  it('sends an uploaded stream as a clips job with the options, then shows the clips when done', async () => {
    let polls = 0
    const api = fakeChatApi(async () => toSnapshot((++polls < 2 ? clipsWire('analyzing') : clipsWire('complete', [wireClip('c01', 10, 40)])) as never))
    setChatApi(api)
    useChat.setState({
      clipsMode: true, projectId: 'proj-1',
      attachments: [{ id: 'a1', name: 'stream.mp4', state: 'ready', progress: 1, videoId: 'v1', error: null }],
    })
    useChat.getState().setClipsOptions({ count: 8 })
    expect(await useChat.getState().send('only the funny moments')).toBeNull()
    expect(api.createJob).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'clips', videoIds: ['v1'], prompt: 'only the funny moments', clips: { count: 8, minSec: 20, maxSec: 75 },
    }))
    expect(api.createJob.mock.calls[0]![0].sourceUrl).toBeUndefined()
    expect(useChat.getState().clipsMode).toBe(false) // one run per switch-on
    expect(useChat.getState().attachments).toEqual([])
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    const a = useChat.getState().messages.find((m) => m.role === 'assistant') as ChatAssistantMessage
    expect(a).toMatchObject({ status: 'complete', kind: 'clips' })
    expect(a.clips?.map((c) => c.id)).toEqual(['c01'])
  })

  it('takes a link from the text when nothing is uploaded, and asks for the stream when there is neither', async () => {
    const api = fakeChatApi(async () => toSnapshot(clipsWire('analyzing') as never))
    setChatApi(api)
    useChat.setState({ clipsMode: true, projectId: 'proj-1' })
    expect(await useChat.getState().send('funny bits')).toBe('noStream')
    expect(api.createJob).not.toHaveBeenCalled()
    expect(await useChat.getState().send('https://www.twitch.tv/videos/123 funny bits')).toBeNull()
    expect(api.createJob).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'clips', videoIds: [], sourceUrl: 'https://www.twitch.tv/videos/123', prompt: 'funny bits',
    }))
  })

  it('waits for an upload, and a clipping run starts its own chat (the old transcript is not mixed in)', async () => {
    setChatApi(fakeChatApi(async () => toSnapshot(clipsWire('analyzing') as never)))
    useChat.setState({
      clipsMode: true, projectId: 'proj-1', jobId: 'old-edit', canFollowUp: true,
      messages: [{ id: 'u0', role: 'user', text: 'old', attachments: [] }],
      attachments: [{ id: 'a1', name: 's.mp4', state: 'uploading', progress: 0.3, videoId: null, error: null }],
    })
    expect(await useChat.getState().send('')).toBe('uploading')
    useChat.setState({ attachments: [{ id: 'a1', name: 's.mp4', state: 'ready', progress: 1, videoId: 'v1', error: null }] })
    expect(await useChat.getState().send('')).toBeNull()
    const msgs = useChat.getState().messages
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(msgs[0]).toMatchObject({ text: 'Find the best clips', attachments: ['s.mp4'] })
    expect(useChat.getState().jobId).toBe('clip-job')
  })

  it('switches to clip mode by itself for a stream-length video from the library (new chat only)', () => {
    useChat.getState().attachFromLibrary([{ id: 'v9', name: 'stream.mp4', durationSec: 3 * 3600, projectId: 'p9', createdAt: 'x' }])
    expect(useChat.getState().clipsMode).toBe(true)
    useChat.getState().reset()
    useChat.getState().attachFromLibrary([{ id: 'v8', name: 'short.mp4', durationSec: 40, projectId: 'p9', createdAt: 'x' }])
    expect(useChat.getState().clipsMode).toBe(false)
  })

  it('trims a clip: shows it cutting, then the new clip; a refusal puts the old one back and says why', async () => {
    const clip = toClips([wireClip('c01', 10, 40)])[0]!
    useChat.setState({
      jobId: 'clip-job',
      messages: [{ id: 'a', role: 'assistant', jobId: 'clip-job', turn: 1, status: 'complete', stage: null, progress: 1, message: null,
                   reply: 'x', result: null, error: null, kind: 'clips', clips: [clip] }],
    })
    let release!: () => void
    const trim = vi.fn((_j: string, _c: string, _p: unknown) => new Promise<ChatJobSnapshot>((res) => {
      release = () => res(toSnapshot(clipsWire('complete', [wireClip('c01', 12, 30, { version: 1 })]) as never))
    }))
    setClipsApi({ trim, lines: async () => ({ lines: [], durationSec: null }) } satisfies ClipsApi)
    const p = useChat.getState().trimClip('clip-job', 'c01', { start: 12, end: 30 })
    const during = (useChat.getState().messages[0] as ChatAssistantMessage).clips![0]!
    expect(during.state).toBe('cutting')
    release()
    expect(await p).toBeNull()
    expect(trim).toHaveBeenCalledWith('clip-job', 'c01', { start: 12, end: 30 })
    expect((useChat.getState().messages[0] as ChatAssistantMessage).clips![0]).toMatchObject({ start: 12, end: 30, version: 1, state: 'ready' })

    setClipsApi({ trim: async () => { throw new ApiError(400, 'A clip must be at least 3 seconds long.') }, lines: async () => ({ lines: [], durationSec: null }) })
    expect(await useChat.getState().trimClip('clip-job', 'c01', { start: 12, end: 13 })).toContain('3 seconds')
    expect((useChat.getState().messages[0] as ChatAssistantMessage).clips![0]).toMatchObject({ start: 12, end: 30, state: 'ready' })
  })
})

describe('ClipsBoard', () => {
  let host: HTMLDivElement
  let root: Root
  const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }) }
  const click = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { (el as HTMLElement).click() }) }
  const q = (id: string) => host.querySelector(`[data-testid="${id}"]`)
  const msg = (clips: ClipItem[]): ChatAssistantMessage => ({
    id: 'a', role: 'assistant', jobId: 'clip-job', turn: 1, status: 'complete', stage: null, progress: 1, message: null,
    reply: 'Found 2 clips in your 2 h stream.', result: null, error: null, kind: 'clips', clips,
    source: { kind: 'upload', title: 'my stream', durationSec: 7200 },
  })

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('shows every clip best first with its video, score, time and download', async () => {
    const clips = toClips([wireClip('c01', 10, 40), wireClip('c02', 3700, 3745, { score: 40 }), wireClip('c03', 50, 80, { state: 'failed', videoUrl: null, downloadUrl: null })])
    await act(async () => { root.render(createElement(ClipsBoard, { msg: msg(clips) })) })
    expect(host.textContent).toContain('Found 2 clips in your 2 h stream.')
    expect(host.textContent).toContain('my stream')
    expect(host.querySelectorAll('[data-testid^="chat-clip-c"]').length).toBe(3)
    expect((q('chat-clip-video-c01') as HTMLVideoElement).getAttribute('src')).toContain('c01-0.mp4')
    expect((q('chat-clip-download-c01') as HTMLAnchorElement).getAttribute('download')).toBe('Title c01.mp4')
    expect(q('chat-clip-c02')!.textContent).toContain('1:01:40')
    expect(q('chat-clip-c03')!.textContent).toContain('could not be cut')
    expect(q('chat-clip-trim-c03')).toBeNull()
    expect(q('chat-clip-download-c03')).toBeNull()
  })

  it('trims: the lines said around the clip set the start / end, and Apply sends the new bounds and title', async () => {
    const trimClip = vi.fn(async () => null)
    useChat.setState({ trimClip })
    setClipsApi({
      trim: vi.fn(),
      lines: async () => ({ lines: [{ s: 8, e: 9.5, text: 'so listen' }, { s: 10, e: 20, text: 'the big story' }, { s: 41, e: 44, text: 'and the end' }], durationSec: 7200 }),
    } as unknown as ClipsApi)
    const clips = toClips([wireClip('c01', 10, 40)])
    await act(async () => { root.render(createElement(ClipsBoard, { msg: msg(clips) })) })
    await click(q('chat-clip-trim-c01'))
    await flush()
    const trimmer = q('chat-clip-trimmer-c01')!
    expect(trimmer.textContent).toContain('the big story')
    const buttons = Array.from(trimmer.querySelectorAll('button'))
    await click(buttons.find((b) => b.textContent === 'Start here' && b.closest('li')?.textContent?.includes('so listen'))!)
    await click(buttons.find((b) => b.textContent === 'End here' && b.closest('li')?.textContent?.includes('and the end'))!)
    const title = q('chat-clip-title-c01') as HTMLInputElement
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(title, 'My best bit')
      title.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(q('chat-clip-apply-c01'))
    await flush()
    expect(trimClip).toHaveBeenCalledWith('clip-job', 'c01', { start: 7.8, end: 44.5, title: 'My best bit' })
    expect(q('chat-clip-trimmer-c01')).toBeNull() // closed after a good apply
  })
})
