// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttachMenu } from '../AttachMenu'
import { useStyles } from '../styles'
import { translate } from '@/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (el: Element | null) => {
  expect(el).not.toBeNull()
  await act(async () => void (el as HTMLElement).click())
}
const T = (k: Parameters<typeof translate>[1]) => translate('en', k)

async function mount(props: Partial<Parameters<typeof AttachMenu>[0]> = {}) {
  const p = { disabled: false, clipsMode: false, onFootage: vi.fn(), onClipsMode: vi.fn(), onReference: vi.fn(), onReferenceLink: vi.fn(), ...props }
  await act(async () => root.render(createElement(AttachMenu, p)))
  return p
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useStyles.setState({ items: [], selected: null })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('the paperclip menu', () => {
  it('opens a menu instead of the file picker: footage first, then the reference video, then clips, each with an icon', async () => {
    const p = await mount()
    expect(p.onFootage).not.toHaveBeenCalled()
    await click($('chat-attach'))
    const rows = [...host.querySelectorAll('[data-testid="chat-attach-menu"] [role^="menuitem"]')]
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['chat-attach-footage', 'chat-attach-template', 'chat-attach-clips'])
    expect(rows[0]!.textContent).toContain(T('chat.menu.footage'))
    expect(rows[1]!.textContent).toContain('Add your reference video')
    expect(rows[2]!.textContent).toContain(T('chat.menu.clips'))
    for (const r of rows) expect(r.querySelector('svg')).not.toBeNull()
  })

  it('"Add your footage / video" does what the paperclip used to do and closes the menu', async () => {
    const p = await mount()
    await click($('chat-attach'))
    await click($('chat-attach-footage'))
    expect(p.onFootage).toHaveBeenCalledTimes(1)
    expect($('chat-attach-menu')).toBeNull()
  })

  it('Clips is always in the menu; it switches clip mode on, and off again with a check mark while on', async () => {
    const p = await mount()
    await click($('chat-attach'))
    await click($('chat-attach-clips'))
    expect(p.onClipsMode).toHaveBeenCalledWith(true)
    await act(async () => root.render(createElement(AttachMenu, { ...p, clipsMode: true })))
    await click($('chat-attach'))
    expect($('chat-attach-clips')!.getAttribute('aria-checked')).toBe('true')
    await click($('chat-attach-clips'))
    expect(p.onClipsMode).toHaveBeenLastCalledWith(false)
  })

  it('the reference video opens its own page inside the menu, with a way back', async () => {
    const p = await mount()
    await click($('chat-attach'))
    await click($('chat-attach-template'))
    expect($('chat-style-panel')).not.toBeNull()
    expect($('chat-attach-footage')).toBeNull()
    expect($('chat-style-new')).not.toBeNull() // pick a reference video file
    await click($('chat-attach-back'))
    expect($('chat-attach-footage')).not.toBeNull()
    expect(p.onReference).not.toHaveBeenCalled()
  })

  it('Escape goes back a page, then closes; clicking outside closes', async () => {
    await mount()
    await click($('chat-attach'))
    await click($('chat-attach-template'))
    await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect($('chat-attach-footage')).not.toBeNull()
    await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect($('chat-attach-menu')).toBeNull()
    await click($('chat-attach'))
    await act(async () => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    expect($('chat-attach-menu')).toBeNull()
  })

  it('a disabled composer cannot open it; without templates (older backend) the reference line is left out but footage and clips stay', async () => {
    useStyles.setState({ items: null, selected: null })
    await mount({ disabled: true })
    expect(($('chat-attach') as HTMLButtonElement).disabled).toBe(true)
    await mount()
    await click($('chat-attach'))
    expect($('chat-attach-template')).toBeNull()
    expect($('chat-attach-footage')).not.toBeNull()
    expect($('chat-attach-clips')).not.toBeNull()
  })
})
