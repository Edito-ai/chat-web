import { beforeEach, describe, expect, it, vi } from 'vitest'

const patch = vi.fn()
vi.mock('@/lib/apiClient', () => ({ apiClient: { patch: (...a: unknown[]) => patch(...a) }, fetchOrExplain: vi.fn() }))

import { useAuth } from '@/auth/authStore'
import { place } from '../place'
import { hasSeenTour, markTourDone, seenLocally, syncTour, tourKey } from '../persistence'
import { TOUR_STEPS } from '../steps'
import { useTour } from '../tourStore'

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  patch.mockReset()
  useAuth.setState({ user: { id: 'u1', email: 'a@b.c', name: 'A', tourCompletedAt: null } })
  useTour.setState({ active: false, index: 0, onEnd: null, queued: false })
})

describe('tour persistence', () => {
  it('is unseen for a new account and seen after finishing, in the browser and on the account', async () => {
    patch.mockResolvedValue({ user: { tourCompletedAt: '2026-11-18T10:00:00Z' } })
    const user = { id: 'u1', tourCompletedAt: null }
    expect(hasSeenTour(user)).toBe(false)
    await markTourDone(user)
    expect(localStorage.getItem(tourKey('u1'))).toBe('done')
    expect(patch).toHaveBeenCalledWith('/auth/tour', { completed: true })
    expect(useAuth.getState().user?.tourCompletedAt).toBe('2026-11-18T10:00:00Z')
    expect(hasSeenTour(user)).toBe(true)
  })

  it('keeps the browser flag when the server call fails, and sends it on the next sync', async () => {
    patch.mockRejectedValueOnce(new Error('offline'))
    await markTourDone({ id: 'u1', tourCompletedAt: null })
    expect(seenLocally('u1')).toBe(true)
    patch.mockResolvedValue({ user: { tourCompletedAt: 'x' } })
    await syncTour({ id: 'u1', tourCompletedAt: null })
    expect(patch).toHaveBeenCalledTimes(2)
  })

  it('trusts the account flag on a new browser without copying it there or calling the server', async () => {
    const user = { id: 'u1', tourCompletedAt: '2026-01-01T00:00:00Z' }
    expect(hasSeenTour(user)).toBe(true)
    await syncTour(user)
    expect(seenLocally('u1')).toBe(false)
    expect(patch).not.toHaveBeenCalled()
  })

  it('comes back when the account flag is cleared, if it was never finished in this browser', async () => {
    await syncTour({ id: 'u1', tourCompletedAt: '2026-01-01T00:00:00Z' })
    expect(hasSeenTour({ id: 'u1', tourCompletedAt: null })).toBe(false)
  })

  it('ignores the old v1 browser flag (it could be a copy of the account flag)', () => {
    localStorage.setItem('edito.chat-web.tour.v1.u1', 'done')
    expect(hasSeenTour({ id: 'u1', tourCompletedAt: null })).toBe(false)
  })

  it('is per account', async () => {
    patch.mockResolvedValue({})
    await markTourDone({ id: 'u1', tourCompletedAt: null })
    expect(hasSeenTour({ id: 'u2', tourCompletedAt: null })).toBe(false)
  })
})

describe('tour store', () => {
  it('walks the steps and reports how it ended', () => {
    const onEnd = vi.fn()
    useTour.getState().setOnEnd(onEnd)
    useTour.getState().start()
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) useTour.getState().next(TOUR_STEPS.length)
    expect(useTour.getState().index).toBe(TOUR_STEPS.length - 1)
    useTour.getState().next(TOUR_STEPS.length)
    expect(useTour.getState().active).toBe(false)
    expect(onEnd).toHaveBeenCalledWith('done')
  })

  it('a start queued by onboarding skips the welcome card and clears the queue', () => {
    useTour.getState().queue()
    expect(useTour.getState().queued).toBe(true)
    useTour.getState().start(1)
    expect(useTour.getState()).toMatchObject({ active: true, index: 1, queued: false })
    useTour.getState().finish('skip')
  })

  it('skipping ends it once and closes what it opened', () => {
    const onEnd = vi.fn()
    useTour.getState().setOnEnd(onEnd)
    useTour.getState().start()
    useTour.getState().setUi({ drawer: true, profileMenu: true })
    useTour.getState().finish('skip')
    useTour.getState().finish('skip')
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(useTour.getState().ui).toEqual({ drawer: false, sidebar: false, attachMenu: false, profileMenu: false })
  })
})

describe('place', () => {
  const vp = { width: 1280, height: 800 }
  const card = { width: 360, height: 240 }

  it('uses the preferred side when it fits', () => {
    const p = place({ top: 500, left: 400, width: 400, height: 80 }, card, vp, 'top')
    expect(p.side).toBe('top')
    expect(p.top).toBe(500 - 16 - 240)
  })

  it('flips to the other side when there is no room', () => {
    const p = place({ top: 40, left: 400, width: 200, height: 40 }, card, vp, 'top')
    expect(p.side).toBe('bottom')
  })

  it('a sidebar item gets the card on its right', () => {
    const p = place({ top: 60, left: 8, width: 264, height: 40 }, card, vp, 'right')
    expect(p).toMatchObject({ side: 'right', left: 8 + 264 + 16 })
  })

  it('always stays inside the viewport gutter', () => {
    const p = place({ top: 780, left: 1270, width: 10, height: 10 }, card, vp, 'right')
    expect(p.left).toBeGreaterThanOrEqual(16)
    expect(p.left + card.width).toBeLessThanOrEqual(vp.width - 16)
    expect(p.top + card.height).toBeLessThanOrEqual(vp.height - 16)
  })
})
