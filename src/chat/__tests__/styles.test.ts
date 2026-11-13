// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const uploadVideo = vi.fn(async (_p: string, f: File) => `remote-${f.name}`)
vi.mock('../chatUploads', () => ({
  createChatProject: async () => 'proj-1',
  uploadVideo: (p: string, f: File) => uploadVideo(p, f),
  deleteAsset: async () => undefined,
}))
vi.mock('../probe', async (orig) => ({
  ...(await orig<typeof import('../probe')>()),
  probeVideo: async () => ({ duration: 10, width: 1080, height: 1920, hasAudio: null }),
}))

import { useAuth } from '@/auth/authStore'
import { setChatApi } from '../chatApi'
import { stopPolling, useChat } from '../chatStore'
import { useStyles, type StyleItem } from '../styles'
import type { ChatApi, ChatJobSnapshot, LookAnswer } from '../chatTypes'

const running = (jobId: string, turn = 1): ChatJobSnapshot => ({
  jobId, turn, status: 'running', stage: 'planning', progress: 0.1, result: null, canFollowUp: false,
  message: null, reply: null, error: null, videoIds: [],
})
const done = (jobId: string): ChatJobSnapshot => ({ ...running(jobId), status: 'complete', stage: null, progress: 1, canFollowUp: true })
const style = (id: string): StyleItem => ({
  id, name: `Style ${id}`, created: '', source: '', description: '', summary: '', sheetUrl: '', colours: { a: '#ff0000', b: '#ffffff' },
})

function fakeApi() {
  return {
    createJob: vi.fn(async (..._a: Parameters<ChatApi['createJob']>) => running('job-1')),
    followUp: vi.fn(async (id: string, ..._rest: unknown[]) => running(id, 2)),
    getJob: vi.fn(async (id: string) => running(id)),
    cancelJob: vi.fn(async (id: string) => ({ ...running(id), status: 'cancelled' as const })),
  } satisfies ChatApi
}
const file = (name: string) => new File(['x'], name, { type: 'video/mp4' })

beforeEach(() => {
  vi.useFakeTimers()
  stopPolling()
  localStorage.clear()
  useAuth.setState({ user: { id: 'u1', email: 'a@b.c', name: null } })
  useChat.getState().reset()
  useStyles.setState({ items: [style('s1'), style('s2')], selected: null })
})
afterEach(() => {
  stopPolling()
  setChatApi(null)
  vi.useRealTimers()
})

async function attach(...names: string[]) {
  await useChat.getState().attach(names.map(file))
  await vi.advanceTimersByTimeAsync(0)
  return useChat.getState().attachments
}

describe('styles in the chat', () => {
  it('a picked style goes with a new edit', async () => {
    const api = fakeApi()
    setChatApi(api)
    useStyles.getState().select('s2')
    await attach('me.mp4')
    await useChat.getState().send('edit it')
    expect(api.createJob).toHaveBeenCalledWith({ projectId: 'proj-1', videoIds: ['remote-me.mp4'], prompt: 'edit it', styleId: 's2' })
  })

  it('a video marked as reference is sent as the reference, not as footage, and wins over the picked style', async () => {
    const api = fakeApi()
    setChatApi(api)
    useStyles.getState().select('s1')
    const [, ref] = await attach('me.mp4', 'reel.mp4')
    useChat.getState().toggleReference(ref!.id)
    await useChat.getState().send('make mine like this')
    expect(api.createJob).toHaveBeenCalledWith({
      projectId: 'proj-1', videoIds: ['remote-me.mp4'], prompt: 'make mine like this', referenceVideoId: 'remote-reel.mp4',
    })
    expect(useChat.getState().messages[0]).toMatchObject({ attachments: ['me.mp4', 'reel.mp4 (style reference)'] })
  })

  it('a reference on its own needs no words: it is a request to save that style', async () => {
    const api = fakeApi()
    setChatApi(api)
    const [ref] = await attach('reel.mp4')
    useChat.getState().toggleReference(ref!.id)
    expect(await useChat.getState().send('')).toBeNull()
    expect(api.createJob).toHaveBeenCalledWith({ projectId: 'proj-1', videoIds: [], prompt: 'Save this style', referenceVideoId: 'remote-reel.mp4' })
  })

  it('a reference link is sent as referenceUrl, wins over the picked template, and is cleared after sending', async () => {
    const api = fakeApi()
    setChatApi(api)
    useStyles.getState().select('s1')
    await attach('me.mp4')
    useChat.getState().setReferenceLink(' https://www.instagram.com/reel/AbC/ ')
    expect(await useChat.getState().send('make mine like this')).toBeNull()
    expect(api.createJob).toHaveBeenCalledWith({
      projectId: 'proj-1', videoIds: ['remote-me.mp4'], prompt: 'make mine like this', referenceUrl: 'https://www.instagram.com/reel/AbC/',
    })
    expect(useChat.getState().referenceLink).toBeNull()
    expect(useChat.getState().messages[0]).toMatchObject({ attachments: ['me.mp4', 'https://www.instagram.com/reel/AbC/ (style reference)'] })
  })

  it('a link and a reference video together are refused: one reference at a time', async () => {
    setChatApi(fakeApi())
    const [ref] = await attach('reel.mp4')
    useChat.getState().toggleReference(ref!.id)
    useChat.getState().setReferenceLink('https://youtu.be/x')
    expect(await useChat.getState().send('go')).toBe('twoReferences')
  })

  it('the chooser: a template id, a skip and a link each reach the server; a refused link comes back as its reason', async () => {
    const answerLook = vi.fn(async (_id: string, a: LookAnswer) => {
      if ('url' in a && a.url.includes('private')) throw new Error('This video needs a login')
    })
    setChatApi({ ...fakeApi(), answerLook })
    await useChat.getState().chooseLook('job-1', 't1')
    await useChat.getState().chooseLook('job-1', null)
    expect(await useChat.getState().lookFromLink('job-1', ' https://youtu.be/ok ')).toBeNull()
    expect(await useChat.getState().lookFromLink('job-1', 'https://insta/private')).toBe('This video needs a login')
    expect(answerLook.mock.calls.map((c) => c[1])).toEqual([{ look: 't1' }, { skip: true }, { url: 'https://youtu.be/ok' }, { url: 'https://insta/private' }])
  })

  it('refuses two references in one message', async () => {
    const api = fakeApi()
    setChatApi(api)
    const atts = await attach('a.mp4', 'b.mp4')
    for (const a of atts) useChat.getState().toggleReference(a.id)
    expect(await useChat.getState().send('go')).toBe('twoReferences')
    expect(api.createJob).not.toHaveBeenCalled()
  })

  it('a follow-up carries the picked style; without one the old call is unchanged', async () => {
    const api = fakeApi()
    api.createJob.mockResolvedValueOnce(done('job-1'))
    setChatApi(api)
    await attach('me.mp4')
    await useChat.getState().send('first')
    await useChat.getState().send('again')
    expect(api.followUp).toHaveBeenLastCalledWith('job-1', 'again', undefined, [])
    api.followUp.mockResolvedValueOnce(done('job-1'))
    useChat.setState({ canFollowUp: true, messages: [] })
    useStyles.getState().select('s1')
    await useChat.getState().send('in my style')
    expect(api.followUp).toHaveBeenLastCalledWith('job-1', 'in my style', undefined, [], { styleId: 's1' })
  })

  it('on a backend without styles nothing style-related is sent', async () => {
    const api = fakeApi()
    setChatApi(api)
    useStyles.setState({ items: null, selected: 's1' })
    await attach('me.mp4')
    await useChat.getState().send('edit')
    expect(api.createJob).toHaveBeenCalledWith({ projectId: 'proj-1', videoIds: ['remote-me.mp4'], prompt: 'edit' })
  })
})

describe('new style from a reel (menu entry)', () => {
  it('attaches the picked video already marked as the reference, and only one', async () => {
    const api = fakeApi()
    setChatApi(api)
    await useChat.getState().attachReference([file('reel.mp4'), file('other.mp4')])
    await vi.advanceTimersByTimeAsync(0)
    const atts = useChat.getState().attachments
    expect(atts.map((a) => [a.name, a.reference])).toEqual([['reel.mp4', true]])
    await useChat.getState().send('')
    expect(api.createJob).toHaveBeenCalledWith({ projectId: 'proj-1', videoIds: [], prompt: 'Save this style', referenceVideoId: 'remote-reel.mp4' })
  })

  it('does not mark videos that were attached earlier', async () => {
    await useChat.getState().attach([file('me.mp4')])
    await vi.advanceTimersByTimeAsync(0)
    await useChat.getState().attachReference([file('reel.mp4')])
    await vi.advanceTimersByTimeAsync(0)
    expect(useChat.getState().attachments.map((a) => [a.name, !!a.reference])).toEqual([['me.mp4', false], ['reel.mp4', true]])
  })
})
