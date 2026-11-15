// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const del = vi.fn()
vi.mock('@/lib/apiClient', async (orig) => ({
  ...(await orig<typeof import('@/lib/apiClient')>()),
  apiClient: { delete: (...a: unknown[]) => del(...a) },
}))

import { ApiError } from '@/lib/apiClient'
import { deleteAccount } from '@/account/services/accountDelete'
import { DeleteAccountDialog, deleteProblem } from '../DeleteAccountDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
beforeEach(() => {
  del.mockReset() // (no arrow shortcut: a function returned from beforeEach is run by vitest as a cleanup)
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)

async function open(onDeleted = vi.fn(), onClose = vi.fn()) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(DeleteAccountDialog, { email: 'a@b.com', onClose, onDeleted })))
  return { onDeleted, onClose }
}

async function typePassword(value: string) {
  const input = $('chat-delete-password') as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const submit = () => act(async () => void ($('chat-delete-confirm') as HTMLButtonElement).click())

describe('deleteAccount', () => {
  it('sends DELETE /account with the password in the body', async () => {
    del.mockResolvedValue(undefined)
    await deleteAccount('hunter2')
    expect(del).toHaveBeenCalledWith('/account', { body: { password: 'hunter2' } })
  })

  it('lets the server refusal through, so the dialog can say why', async () => {
    del.mockImplementation(async () => {
      throw new ApiError(400, '400 Password is incorrect.')
    })
    const err = await deleteAccount('x').then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(400)
  })
})

describe('what a refused deletion says', () => {
  it("maps the status to the wording the dialog has: wrong password, too many tries, or the server's own sentence", () => {
    expect(deleteProblem(new ApiError(400, '400 Password is incorrect.'))).toBe('wrong')
    expect(deleteProblem(new ApiError(429, '429 Too many'))).toBe('tooMany')
    expect(deleteProblem(new ApiError(409, '409 An admin account cannot delete itself here.'))).toEqual({
      text: 'An admin account cannot delete itself here.',
    })
    expect(deleteProblem(new Error("Can't reach the server"))).toEqual({ text: "Can't reach the server" })
  })
})

describe('the delete dialog', () => {
  it('names the account, says what goes, and cannot be confirmed without a password', async () => {
    await open()
    expect(document.body.textContent).toContain('a@b.com')
    expect(document.body.textContent).toContain('cannot be undone')
    expect(($('chat-delete-confirm') as HTMLButtonElement).disabled).toBe(true)
    await typePassword('x')
    expect(($('chat-delete-confirm') as HTMLButtonElement).disabled).toBe(false)
    expect(del).not.toHaveBeenCalled()
  })

  it('deletes with the typed password and then tells the caller (which signs the person out)', async () => {
    del.mockResolvedValue(undefined)
    const { onDeleted } = await open()
    await typePassword('correct-horse')
    await submit()
    expect(del).toHaveBeenCalledWith('/account', { body: { password: 'correct-horse' } })
    expect(onDeleted).toHaveBeenCalledTimes(1)
  })

  it('a wrong password shows the reason, keeps the dialog open and signs nobody out', async () => {
    del.mockImplementation(async () => {
      throw new ApiError(400, '400 Password is incorrect.')
    })
    const { onDeleted, onClose } = await open()
    await typePassword('nope')
    await submit()
    expect($('chat-delete-error')?.textContent).toBe('That password is not right.')
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(($('chat-delete-confirm') as HTMLButtonElement).disabled).toBe(false) // can try again
  })
})
