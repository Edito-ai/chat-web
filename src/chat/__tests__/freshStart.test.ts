import { beforeEach, describe, expect, it } from 'vitest'
import { markFreshStartDone, resetFreshStart, takeFreshStart } from '../freshStart'

describe('fresh start once per page load', () => {
  beforeEach(() => resetFreshStart())

  it('is granted the first time only', () => {
    expect(takeFreshStart()).toBe(true)
    expect(takeFreshStart()).toBe(false)
    expect(takeFreshStart()).toBe(false)
  })

  it('a screen that seeds a chat can mark it done so the seed survives', () => {
    markFreshStartDone()
    expect(takeFreshStart()).toBe(false)
  })
})
