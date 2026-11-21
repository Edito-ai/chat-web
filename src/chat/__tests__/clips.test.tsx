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
    expect(snap.source).toEqual({ kind: 'upload', title: 'my stream', durationSec: 7200, url: null })
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
    expect(clampOptions({ count: 99, minSec: 300, maxSec: 2 })).toEqual({ count: 20, minSec: 10, maxSec: 15, liveMin: 30 })
    expect(clampOptions({})).toEqual({ count: 12, minSec: 20, maxSec: 75, liveMin: 30 })
    expect(clampOptions({ liveMin: 500 }).liveMin).toBe(60)
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
  it('a prompt starts the chat; when the backend makes it a clips chat the clips show once done (no clips fields are sent)', async () => {
    let polls = 0
    const api = fakeChatApi(async () => toSnapshot((++polls < 2 ? clipsWire('analyzing') : clipsWire('complete', [wireClip('c01', 10, 40)])) as never))
    setChatApi(api)
    useChat.setState({
      projectId: 'proj-1',
      attachments: [{ id: 'a1', name: 'stream.mp4', state: 'ready', progress: 1, videoId: 'v1', error: null }],
    })
    expect(await useChat.getState().send('only the funny moments')).toBeNull()
    expect(api.createJob).toHaveBeenCalledWith({ projectId: 'proj-1', videoIds: ['v1'], prompt: 'only the funny moments' })
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    const a = useChat.getState().messages.find((m) => m.role === 'assistant') as ChatAssistantMessage
    expect(a).toMatchObject({ status: 'complete', kind: 'clips' })
    expect(a.clips?.map((c) => c.id)).toEqual(['c01'])
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
    setClipsApi({ trim, lines: async () => ({ lines: [], durationSec: null }), studio: vi.fn(), setLook: vi.fn() } satisfies ClipsApi)
    const p = useChat.getState().trimClip('clip-job', 'c01', { start: 12, end: 30 })
    const during = (useChat.getState().messages[0] as ChatAssistantMessage).clips![0]!
    expect(during.state).toBe('cutting')
    release()
    expect(await p).toBeNull()
    expect(trim).toHaveBeenCalledWith('clip-job', 'c01', { start: 12, end: 30 })
    expect((useChat.getState().messages[0] as ChatAssistantMessage).clips![0]).toMatchObject({ start: 12, end: 30, version: 1, state: 'ready' })

    setClipsApi({ trim: async () => { throw new ApiError(400, 'A clip must be at least 3 seconds long.') }, lines: async () => ({ lines: [], durationSec: null }), studio: vi.fn(), setLook: vi.fn() })
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
    expect(host.querySelectorAll('li[data-testid^="chat-clip-c"]').length).toBe(3)
    // the clip opens in its own page (the studio)
    expect((q('chat-clip-open-c01') as HTMLAnchorElement).getAttribute('href')).toBe('/clips/clip-job/c01')
    expect((q('chat-clip-open-c01')!.querySelector('img') as HTMLImageElement).getAttribute('src')).toContain('c01-0.jpg')
    expect(q('chat-clip-captions-c01')).not.toBeNull()
    expect(q('chat-clip-captions-c03')).toBeNull() // a failed clip cannot be captioned
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

const styledWire = (state: string, extra: Record<string, unknown> = {}) => ({
  state, version: 1, error: null, captions: true, noWords: false,
  videoUrl: state === 'ready' ? 'http://x/files/j/clips/c01-s1.mp4' : null,
  downloadUrl: state === 'ready' ? 'http://x/files/j/clips/c01-s1.mp4?download=1' : null, downloadFilename: 'Title c01 (styled).mp4', ...extra,
})
const studioWire = (styled: unknown) => ({
  clip: wireClip('c01', 10, 40, { styled }), look: { captions: { on: true, template: 'bold' }, music: { source: 'none', volume: 0.12 }, sfx: { on: false } },
  templates: [{ id: 'bold', name: 'Bold Pop', desc: 'x', upper: true, style: { color: '#fff', accent: '#ff0', bg: null } }],
  music: { suggestions: [], uploads: [], volume: { default: 0.12, max: 0.4 }, upload: { maxBytes: 80_000_000 } }, sourceTitle: 's', projectId: 'p',
})

describe('one-click captions', () => {
  const clipMsg = () => useChat.setState({
    jobId: 'clip-job',
    messages: [{ id: 'a', role: 'assistant', jobId: 'clip-job', turn: 1, status: 'complete', stage: null, progress: 1, message: null,
                 reply: 'x', result: null, error: null, kind: 'clips', clips: toClips([wireClip('c01', 10, 40)]) }],
  })
  const clipNow = () => (useChat.getState().messages[0] as ChatAssistantMessage).clips![0]!

  it('maps the styled version of a clip', () => {
    expect(toClips([wireClip('c01', 1, 5, { styled: styledWire('ready') })])[0]!.styled).toMatchObject({ state: 'ready', captions: true })
    expect(toClips([wireClip('c01', 1, 5, { styled: { state: 'weird' } })])[0]!.styled).toBeNull()
    expect(toClips([wireClip('c01', 1, 5)])[0]!.styled).toBeNull()
  })

  it('asks for captions only, follows the render, and the clip gets its captioned download', async () => {
    clipMsg()
    const { toStudio } = await import('../clips')
    const setLook = vi.fn(async () => toStudio(studioWire(styledWire('rendering')))!)
    let polls = 0
    const studio = vi.fn(async () => toStudio(studioWire(styledWire(++polls < 2 ? 'rendering' : 'ready')))!)
    setClipsApi({ trim: vi.fn(), lines: vi.fn(), setLook, studio } as unknown as ClipsApi)
    const p = useChat.getState().captionClip('clip-job', 'c01')
    await vi.advanceTimersByTimeAsync(0)
    expect(setLook).toHaveBeenCalledWith('clip-job', 'c01', { captions: { on: true } })
    expect(clipNow().styled?.state).toBe('rendering')
    await vi.advanceTimersByTimeAsync(5000)
    expect(await p).toBeNull()
    expect(clipNow().styled).toMatchObject({ state: 'ready', downloadUrl: 'http://x/files/j/clips/c01-s1.mp4?download=1' })
  })

  it('says why when the render fails or the server refuses', async () => {
    clipMsg()
    const { toStudio } = await import('../clips')
    setClipsApi({ trim: vi.fn(), lines: vi.fn(), studio: vi.fn(),
                  setLook: vi.fn(async () => toStudio(studioWire(styledWire('failed', { error: 'ffmpeg broke' })))!) } as unknown as ClipsApi)
    expect(await useChat.getState().captionClip('clip-job', 'c01')).toBe('ffmpeg broke')
    setClipsApi({ trim: vi.fn(), lines: vi.fn(), studio: vi.fn(),
                  setLook: async () => { throw new ApiError(409, '409 This clip is being cut right now.') } } as unknown as ClipsApi)
    expect(await useChat.getState().captionClip('clip-job', 'c01')).toContain('being cut')
  })
})

