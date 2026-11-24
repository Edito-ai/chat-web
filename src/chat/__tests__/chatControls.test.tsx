// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bubble } from '../Messages'
import { Composer } from '../Composer'
import { newAssistant } from '../chatState'
import { rebuildMessages } from '../history'
import type { ChatMessage } from '../chatTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)
function type(el: HTMLTextAreaElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('editing the last message', () => {
  const msg: ChatMessage = { id: 'u1', role: 'user', text: 'make it punchy', attachments: [] }

  it('the pencil opens the words in place; Save sends the new words', async () => {
    const onEdit = vi.fn(async () => null)
    act(() => root.render(createElement('ol', null, createElement(Bubble, { msg, onEdit }))))
    act(() => $('chat-edit')!.click())
    const box = $('chat-edit-input') as HTMLTextAreaElement
    expect(box.value).toBe('make it punchy')
    act(() => type(box, 'make it calm'))
    await act(async () => $('chat-edit-save')!.click())
    expect(onEdit).toHaveBeenCalledWith('make it calm')
    expect($('chat-edit-input')).toBeNull()
  })

  it('a refused change keeps the box open with the reason', async () => {
    const onEdit = vi.fn(async () => 'Only your last message can be changed.')
    act(() => root.render(createElement('ol', null, createElement(Bubble, { msg, onEdit }))))
    act(() => $('chat-edit')!.click())
    await act(async () => $('chat-edit-save')!.click())
    expect(host.textContent).toContain('Only your last message can be changed.')
    expect($('chat-edit-input')).not.toBeNull()
  })

  it('no pencil on other messages; an edited message says so', () => {
    act(() => root.render(createElement('ol', null, createElement(Bubble, { msg: { ...msg, edited: true } }))))
    expect($('chat-edit')).toBeNull()
    expect($('chat-edited')).not.toBeNull()
  })

  it('a reopened chat marks a changed message as edited', () => {
    const m = rebuildMessages({
      id: 'j', state: 'complete', turn: 1, kind: 'chat', reply: 'Hi!',
      turns: [{ turn: 1, prompt: 'hello there', state: 'complete', reply: 'Hi!', edits: [{ prompt: 'hi' }] }],
    })
    expect(m[0]).toMatchObject({ role: 'user', text: 'hello there', edited: true })
  })
})

describe('retry', () => {
  it('a stopped answer offers Try again', () => {
    const onRetry = vi.fn()
    const msg = { ...newAssistant('a1', 'job-1'), status: 'cancelled' as const }
    act(() => root.render(createElement('ol', null, createElement(Bubble, { msg, onRetry }))))
    act(() => $('chat-retry')!.click())
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('composer while a turn runs', () => {
  const base = {
    onText: () => undefined, textareaRef: { current: null }, placeholder: '', attachments: [], pictures: [],
    onRemovePicture: () => undefined, onRemoveAttachment: () => undefined, onAttachClick: () => undefined,
    attachDisabled: false, sendDisabled: true, onSend: vi.fn(), onStop: vi.fn(),
  }

  it('typed words offer "send after this" and "stop and send"; Enter queues', () => {
    const onQueue = vi.fn()
    const onInterrupt = vi.fn()
    act(() => root.render(createElement(Composer, { ...base, text: 'captions bigger', running: true, onQueue, onInterrupt })))
    expect($('chat-stop')).toBeNull()
    act(() => $('chat-stop-send')!.click())
    expect(onInterrupt).toHaveBeenCalled()
    act(() => $('chat-queue-send')!.click())
    act(() => $('chat-input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onQueue).toHaveBeenCalledTimes(2)
    expect(base.onSend).not.toHaveBeenCalled()
  })

  it('an empty box shows Stop; waiting messages show with a remove button', () => {
    const onRemoveQueued = vi.fn()
    act(() => root.render(createElement(Composer, {
      ...base, text: '', running: true, onQueue: vi.fn(), onInterrupt: vi.fn(), queued: [{ id: 'q1', text: 'later' }], onRemoveQueued,
    })))
    expect($('chat-stop')).not.toBeNull()
    expect($('chat-queued')!.textContent).toContain('later')
    act(() => $('chat-queued')!.querySelector('button')!.click())
    expect(onRemoveQueued).toHaveBeenCalledWith('q1')
  })
})
