// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never),
}))
let authStatus = 'authenticated'
vi.mock('@/auth/useSession', () => ({ useSession: () => authStatus }))
vi.mock('../chatUploads', () => ({
  createChatProject: async () => 'proj-1',
  uploadVideo: async () => 'up-new',
  deleteAsset: async () => undefined,
}))

import { useChat } from '../chatStore'
import { ClipStudio, STUDIO_POLL_MS } from '../ClipStudio'
import { ClipsBoard } from '../ClipsBoard'
import { setClipsApi, toClips, toStudio, type ClipsApi, type StudioState } from '../clips'
import type { ChatAssistantMessage } from '../chatTypes'

const clipWire = (styled: unknown = null) => ({
  id: 'c01', start: 10, end: 40, durationSec: 30, title: 'Big moment', reason: 'r', score: 90, text: '', state: 'ready', error: null,
  version: 0, videoUrl: 'http://x/clips/c01-0.mp4', thumbUrl: 'http://x/clips/c01-0.jpg', downloadUrl: 'http://x/clips/c01-0.mp4?download=1',
  downloadFilename: 'Big moment.mp4', styled,
})
const styled = (state: string) => ({
  state, version: 1, error: null, captions: true, noWords: false,
  videoUrl: state === 'ready' ? 'http://x/clips/c01-s1.mp4' : null, downloadUrl: state === 'ready' ? 'http://x/clips/c01-s1.mp4?download=1' : null,
  downloadFilename: 'Big moment (styled).mp4',
})
const wire = (st: unknown = null, look: unknown = null) => ({
  clip: clipWire(st),
  look: look ?? { captions: { on: false, template: 'bold' }, music: { source: 'none', volume: 0.12 }, sfx: { on: false } },
  templates: ['bold', 'clean', 'boxed', 'neon', 'karaoke'].map((id) => ({ id, name: id.toUpperCase(), desc: '', upper: id === 'bold',
                                                                        style: { color: '#fff', accent: '#ff0', bg: null } })),
  music: {
    suggestions: [1, 2, 3].map((i) => ({ id: `t${i}`, title: `Track ${i}`, artist: 'A', mood: 'calm', previewUrl: `http://x/music/t${i}/preview`, selected: false })),
    uploads: [{ id: 'u1', name: 'mine.mp3', durationSec: 30 }], volume: { default: 0.12, max: 0.4 }, upload: { maxBytes: 80_000_000 },
  },
  sourceTitle: 'my stream', projectId: 'p1',
})
const st = (s: unknown = null, look: unknown = null): StudioState => toStudio(wire(s, look))!

let host: HTMLDivElement
let root: Root
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }) }
const click = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { (el as HTMLElement).click() }) }
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`)

beforeEach(() => {
  vi.useFakeTimers()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  authStatus = 'authenticated'
  replace.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  setClipsApi(null)
  vi.useRealTimers()
})

describe('ClipStudio', () => {
  it('shows the clip, the five caption styles, three tracks and the person\'s music; Apply waits for a change', async () => {
    setClipsApi({ trim: vi.fn(), lines: vi.fn(), studio: async () => st(), setLook: vi.fn() } as unknown as ClipsApi)
    await act(async () => { root.render(createElement(ClipStudio, { jobId: 'job', clipId: 'c01' })) })
    await flush()
    expect(host.textContent).toContain('Big moment')
    expect(host.querySelectorAll('[data-testid^="studio-template-"]').length).toBe(5)
    expect(host.querySelectorAll('[data-testid^="studio-track-"]').length).toBe(3)
    expect(host.textContent).toContain('Best fit')
    expect(q('studio-upload-u1')).not.toBeNull()
    expect((q('studio-video') as HTMLVideoElement).getAttribute('src')).toBe('http://x/clips/c01-0.mp4')
    expect((q('studio-apply') as HTMLButtonElement).disabled).toBe(true)
    expect(q('studio-download-styled')).toBeNull()
    expect(q('studio-download-raw')).not.toBeNull()
  })

  it('applies captions in a chosen style, a track at a volume and auto effects, then plays and downloads the result', async () => {
    let polls = 0
    const setLook = vi.fn(async () => st(styled('rendering'), { captions: { on: true, template: 'neon' }, music: { source: 'library', trackId: 't2', volume: 0.12 }, sfx: { on: true } }))
    const studio = vi.fn(async () => (polls++ === 0 ? st() : st(styled('ready'), { captions: { on: true, template: 'neon' }, music: { source: 'library', trackId: 't2', volume: 0.12 }, sfx: { on: true } })))
    setClipsApi({ trim: vi.fn(), lines: vi.fn(), studio, setLook } as unknown as ClipsApi)
    await act(async () => { root.render(createElement(ClipStudio, { jobId: 'job', clipId: 'c01' })) })
    await flush()
    await click(q('studio-template-neon')) // picking a style turns captions on
    await click(q('studio-track-t2'))
    await click(q('studio-sfx-toggle'))
    expect((q('studio-apply') as HTMLButtonElement).disabled).toBe(false)
    await click(q('studio-apply'))
    await flush()
    expect(setLook).toHaveBeenCalledWith('job', 'c01', {
      captions: { on: true, template: 'neon' }, music: { source: 'library', trackId: 't2', volume: 0.12 }, sfx: { on: true },
    })
    expect(host.textContent).toContain('Rendering')
    await act(async () => { await vi.advanceTimersByTimeAsync(STUDIO_POLL_MS + 10) })
    await flush()
    expect((q('studio-video') as HTMLVideoElement).getAttribute('src')).toBe('http://x/clips/c01-s1.mp4')
    expect((q('studio-download-styled') as HTMLAnchorElement).getAttribute('href')).toBe('http://x/clips/c01-s1.mp4?download=1')
    expect((q('studio-apply') as HTMLButtonElement).disabled).toBe(true) // nothing new to apply
  })

  it('picks the person\'s own upload, and shows the server\'s reason when Apply is refused', async () => {
    const setLook = vi.fn(async () => { throw new Error('Your music file was not found. Upload it again.') })
    setClipsApi({ trim: vi.fn(), lines: vi.fn(), studio: async () => st(), setLook } as unknown as ClipsApi)
    await act(async () => { root.render(createElement(ClipStudio, { jobId: 'job', clipId: 'c01' })) })
    await flush()
    await click(q('studio-upload-u1'))
    await click(q('studio-apply'))
    await flush()
    expect(setLook).toHaveBeenCalledWith('job', 'c01', expect.objectContaining({ music: { source: 'upload', uploadId: 'u1', volume: 0.12 } }))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('not found')
  })

  it('sends a signed-out visitor to the login page', async () => {
    authStatus = 'unauthenticated'
    setClipsApi({ trim: vi.fn(), lines: vi.fn(), studio: vi.fn(), setLook: vi.fn() } as unknown as ClipsApi)
    await act(async () => { root.render(createElement(ClipStudio, { jobId: 'job', clipId: 'c01' })) })
    await flush()
    expect(replace).toHaveBeenCalledWith('/login')
  })
})

describe('ClipsBoard with a captioned clip', () => {
  it('offers the captioned download instead of the Captions button', async () => {
    const msg: ChatAssistantMessage = {
      id: 'a', role: 'assistant', jobId: 'job', turn: 1, status: 'complete', stage: null, progress: 1, message: null, reply: 'x',
      result: null, error: null, kind: 'clips', clips: toClips([clipWire(styled('ready'))]), source: null,
    }
    useChat.setState({ messages: [msg] })
    await act(async () => { root.render(createElement(ClipsBoard, { msg })) })
    expect((q('chat-clip-download-styled-c01') as HTMLAnchorElement).getAttribute('download')).toBe('Big moment (styled).mp4')
    expect(q('chat-clip-captions-c01')).toBeNull()
    expect((q('chat-clip-studio-c01') as HTMLAnchorElement).getAttribute('href')).toBe('/clips/job/c01')
  })
})
