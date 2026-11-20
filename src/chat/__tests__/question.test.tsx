// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const uploadVideo = vi.fn(async (_p: string, f: File) => `remote-${f.name}`)
const uploadPicture = vi.fn(async (_p: string, f: File) => `pic-${f.name}`)
vi.mock('../chatUploads', () => ({
  createChatProject: async () => 'proj-1',
  uploadVideo: (p: string, f: File) => uploadVideo(p, f),
  uploadPicture: (p: string, f: File) => uploadPicture(p, f),
  deleteAsset: async () => undefined,
}))
vi.mock('../probe', async (orig) => ({
  ...(await orig<typeof import('../probe')>()),
  probeVideo: async () => ({ duration: 10, width: 1080, height: 1920, hasAudio: null }),
}))

import { ApiError } from '@/lib/apiClient'
import { setChatApi, toSnapshot } from '../chatApi'
import { stopPolling, useChat } from '../chatStore'
import { QuestionCard } from '../QuestionCard'
import { Composer } from '../Composer'
import { newAssistant } from '../chatState'
import type { ChatApi, ChatAssistantMessage, ChatJobSnapshot, ChatQuestion, LookAnswer, QuestionAnswer } from '../chatTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const running = (jobId = 'job-1'): ChatJobSnapshot => ({
  jobId, turn: 1, status: 'running', stage: 'planning', progress: 0.1, result: null, canFollowUp: false,
  message: null, reply: null, error: null, videoIds: [],
})
const q = (over: Partial<ChatQuestion> = {}): ChatQuestion => ({
  id: 'q1', kind: 'intent', text: 'What should I do?',
  options: [
    { id: 'edit', label: 'Edit it', hint: 'Cut and caption', recommended: true, imageUrl: null },
    { id: 'clips', label: 'Make clips', hint: null, recommended: false, imageUrl: null },
  ],
  multi: false, allowText: false, allowUpload: false, allowLink: false, ...over,
})

let host: HTMLDivElement
let root: Root
let answer: ReturnType<typeof vi.fn<(id: string, b: QuestionAnswer) => Promise<ChatJobSnapshot>>>
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (el: Element | null) => {
  expect(el).not.toBeNull()
  await act(async () => void (el as HTMLElement).click())
}
const typeInto = async (el: HTMLElement | null, value: string) => {
  const input = el as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function fakeApi(): ChatApi {
  answer = vi.fn(async (id: string, _b: QuestionAnswer) => running(id))
  return {
    createJob: vi.fn(async () => running()),
    followUp: vi.fn(async () => running()),
    getJob: vi.fn(async (id: string) => running(id)),
    cancelJob: vi.fn(async (id: string) => ({ ...running(id), status: 'cancelled' as const })),
    answer: (id, b) => answer(id, b),
  }
}

async function show(question: ChatQuestion, api: ChatApi = fakeApi()) {
  setChatApi(api)
  const msg: ChatAssistantMessage = { ...newAssistant('a1', 'job-1'), status: 'running', question }
  useChat.setState({ messages: [msg], jobId: 'job-1', projectId: 'proj-1' })
  await act(async () => root.render(createElement(QuestionCard, { msg })))
}

beforeEach(() => {
  vi.useFakeTimers()
  stopPolling()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useChat.getState().reset()
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  stopPolling()
  setChatApi(null)
  vi.useRealTimers()
})

describe('toSnapshot and the question', () => {
  it('maps the question, drops malformed options, and is null without one', () => {
    const snap = toSnapshot({
      id: 'j', state: 'queued',
      question: {
        id: 'q9', kind: 'look', text: 'Which look?', multi: true, allowText: true,
        options: [{ id: 'a', label: 'A', hint: 'h', recommended: true, imageUrl: 'http://x/a.jpg' }, { id: '', label: 'bad' }, { id: 'b', label: 'B' }],
      },
    })
    expect(snap.question).toEqual({
      id: 'q9', kind: 'look', text: 'Which look?', multi: true, allowText: true, allowUpload: false, allowLink: false,
      options: [
        { id: 'a', label: 'A', hint: 'h', recommended: true, imageUrl: 'http://x/a.jpg' },
        { id: 'b', label: 'B', hint: null, recommended: false, imageUrl: null },
      ],
    })
    expect(toSnapshot({ id: 'j' }).question).toBeNull()
    expect(toSnapshot({ id: 'j', question: null }).question).toBeNull()
  })
})

describe('QuestionCard', () => {
  it('shows the text, marks the recommended option, and one click answers', async () => {
    await show(q())
    expect($('chat-question-text')!.textContent).toBe('What should I do?')
    expect($('chat-question-recommended-edit')).not.toBeNull()
    expect($('chat-question-recommended-clips')).toBeNull()
    await click($('chat-question-option-clips'))
    expect(answer).toHaveBeenCalledWith('job-1', { questionId: 'q1', optionIds: ['clips'], text: null, videoId: null, link: null })
    expect(useChat.getState().messages[0]).toMatchObject({ question: null })
  })

  it('multi: checkboxes plus Confirm send all the ticked ids', async () => {
    await show(q({ multi: true }))
    expect($('chat-question-confirm')!.hasAttribute('disabled')).toBe(true)
    await click($('chat-question-option-edit'))
    await click($('chat-question-option-clips'))
    expect(answer).not.toHaveBeenCalled()
    await click($('chat-question-confirm'))
    expect(answer).toHaveBeenCalledWith('job-1', { questionId: 'q1', optionIds: ['edit', 'clips'], text: null, videoId: null, link: null })
  })

  it('text answer', async () => {
    await show(q({ allowText: true }))
    await typeInto($('chat-question-text-input'), '  make it spicy ')
    await click($('chat-question-text-send'))
    expect(answer).toHaveBeenCalledWith('job-1', { questionId: 'q1', optionIds: [], text: 'make it spicy', videoId: null, link: null })
  })

  it('link answer needs a link-looking value', async () => {
    await show(q({ allowLink: true }))
    await typeInto($('chat-question-link-input'), 'nonsense')
    expect($('chat-question-link-send')!.hasAttribute('disabled')).toBe(true)
    await typeInto($('chat-question-link-input'), 'https://youtu.be/abc')
    await click($('chat-question-link-send'))
    expect(answer).toHaveBeenCalledWith('job-1', { questionId: 'q1', optionIds: [], text: null, videoId: null, link: 'https://youtu.be/abc' })
  })

  it('upload answer: a video and a photo both give a videoId', async () => {
    await show(q({ allowUpload: true }))
    const pick = async (f: File) => {
      const input = $('chat-question-file') as HTMLInputElement
      Object.defineProperty(input, 'files', { value: [f], configurable: true })
      await act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })))
      await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
    }
    await pick(new File(['x'], 'a.mp4', { type: 'video/mp4' }))
    expect(answer).toHaveBeenLastCalledWith('job-1', { questionId: 'q1', optionIds: [], text: null, videoId: 'remote-a.mp4', link: null })
    await show(q({ allowUpload: true }))
    await pick(new File(['x'], 'p.png', { type: 'image/png' }))
    expect(answer).toHaveBeenLastCalledWith('job-1', { questionId: 'q1', optionIds: [], text: null, videoId: 'pic-p.png', link: null })
  })

  it('409: no scary error, the card goes and the chat is refreshed', async () => {
    const api = fakeApi()
    answer.mockRejectedValue(new ApiError(409, 'gone'))
    await show(q(), api)
    await click($('chat-question-option-edit'))
    expect($('chat-question-error')).toBeNull()
    expect(api.getJob).toHaveBeenCalledWith('job-1')
    expect(useChat.getState().messages[0]).toMatchObject({ question: null })
    expect(useChat.getState().actionError).toBeNull()
  })

  it('another failure keeps the card and says why', async () => {
    await show(q())
    answer.mockRejectedValue(new Error('network down'))
    await click($('chat-question-option-edit'))
    expect($('chat-question-error')!.textContent).toBe('network down')
    expect($('chat-question-option-edit')!.hasAttribute('disabled')).toBe(false)
  })

  it('is hidden for a remote (read only) chat', async () => {
    await show(q())
    await act(async () => useChat.setState({ remote: 'prod' }))
    expect($('chat-question')).toBeNull()
  })

  it('a typed message while a question is open goes to the answer endpoint as text', async () => {
    await show(q())
    expect(await useChat.getState().send('just trim it')).toBeNull()
    expect(answer).toHaveBeenCalledWith('job-1', { questionId: 'q1', optionIds: [], text: 'just trim it', videoId: null, link: null })
    expect(useChat.getState().messages.some((m) => m.role === 'user' && m.text === 'just trim it')).toBe(true)
  })
})

describe('the composer paperclip', () => {
  it('is one button that opens the file picker: no menu, no clips / reference / template items', async () => {
    const onAttachClick = vi.fn()
    await act(async () =>
      root.render(
        createElement(Composer, {
          text: '', onText: () => undefined, textareaRef: { current: null }, placeholder: 'x', attachments: [], pictures: [],
          onRemovePicture: () => undefined, onRemoveAttachment: () => undefined, onAttachClick, attachDisabled: false,
          running: false, sendDisabled: false, onSend: () => undefined, onStop: () => undefined,
        }),
      ),
    )
    await click($('chat-attach'))
    expect(onAttachClick).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[role="menu"], [role^="menuitem"]')).toBeNull()
    for (const id of ['chat-attach-clips', 'chat-attach-template', 'chat-clips-bar']) expect($(id)).toBeNull()
  })
})

describe('the template chooser actions (still sent by the backend)', () => {
  it('a template id, a skip and a link each reach the server; a refused link comes back as its reason', async () => {
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
})
