// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { PENDING_CODE_TTL_MS, clearPendingCode, loadPendingCode, savePendingCode } from '../pendingCode'

beforeEach(() => localStorage.clear())

describe('the pending "enter your code" step survives a reload', () => {
  it('returns the email that is waiting for its code', () => {
    savePendingCode('  new@user.com ', 1_000)
    expect(loadPendingCode(1_000 + 60_000)).toBe('new@user.com')
  })

  it('is gone after it is cleared (the person went back on purpose, or finished)', () => {
    savePendingCode('new@user.com')
    clearPendingCode()
    expect(loadPendingCode()).toBeNull()
  })

  it('goes stale after the time limit and is then removed, not kept around', () => {
    savePendingCode('new@user.com', 0)
    expect(loadPendingCode(PENDING_CODE_TTL_MS - 1)).toBe('new@user.com')
    expect(loadPendingCode(PENDING_CODE_TTL_MS)).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('ignores a value that is not ours (corrupt, wrong shape, a clock that went backwards)', () => {
    for (const bad of ['not json', '{"email":5,"savedAt":1}', '{"email":"a@b.c"}', JSON.stringify({ email: 'a@b.c', savedAt: 10_000 })]) {
      localStorage.setItem('edito.chat-web.auth.pendingCode.v1', bad)
      expect(loadPendingCode(1)).toBeNull()
    }
  })

  it('stores the email only: never a password or a code', () => {
    savePendingCode('new@user.com')
    const raw = localStorage.getItem('edito.chat-web.auth.pendingCode.v1')!
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['email', 'savedAt'])
  })

  it('does nothing for an empty email', () => {
    savePendingCode('   ')
    expect(loadPendingCode()).toBeNull()
  })
})
