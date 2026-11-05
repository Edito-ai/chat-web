// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/auth/authStore'
import { useChat, stopPolling } from '../chatStore'
import { groupHistory, setHistoryApi, type HistoryApi, type HistoryItem } from '../history'

// Mock data only: no network, no backend.
const NOW = new Date(2026, 9, 20, 15, 0, 0).getTime()
const at = (daysAgo: number) => new Date(2026, 9, 20 - daysAgo, 10, 0, 0).getTime()
const row = (id: string, createdAt: number, pinned = false): HistoryItem => ({
  jobId: id, title: id, status: 'complete', createdAt, updatedAt: createdAt, pinned,
})

function fakeHistoryApi(over: Partial<HistoryApi> = {}) {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => { throw new Error('unused') }),
    pin: vi.fn(async (_id: string, _pinned: boolean) => undefined),
    remove: vi.fn(async (_id: string) => undefined),
    ...over,
  } satisfies HistoryApi
}

beforeEach(() => {
  stopPolling()
  localStorage.clear()
  useAuth.setState({ user: { id: 'u1', email: 'a@b.c', name: null } })
  useChat.getState().reset()
})

describe('history grouping with pinned chats', () => {
  it('puts pinned chats first, once, in the order the server sent them; the rest stay newest first', () => {
    const items = [row('p-new', at(30), true), row('today', at(0)), row('p-old', at(60), true), row('yesterday', at(1))]
    const groups = groupHistory(items, NOW)
    expect(groups.map((g) => g.id)).toEqual(['pinned', 'today', 'yesterday'])
    expect(groups[0]!.items.map((i) => i.jobId)).toEqual(['p-new', 'p-old'])
    expect(groups.flatMap((g) => g.items).filter((i) => i.jobId === 'p-new')).toHaveLength(1)
  })

  it('has no Pinned group when nothing is pinned', () => {
    expect(groupHistory([row('a', at(0))], NOW).map((g) => g.id)).toEqual(['today'])
  })
})

describe('pin and delete in the store', () => {
  it('pins at once, tells the server, and reloads the list for the server order', async () => {
    const api = fakeHistoryApi({ list: vi.fn(async () => []) })
    setHistoryApi(api)
    useChat.setState({ history: [row('a', at(0)), row('b', at(0))] })
    const done = useChat.getState().pinChat('b', true)
    expect(useChat.getState().history.find((h) => h.jobId === 'b')?.pinned).toBe(true) // optimistic
    await done
    expect(api.pin).toHaveBeenCalledWith('b', true)
  })

  it('undoes the pin and reports an error when the server refuses', async () => {
    setHistoryApi(fakeHistoryApi({ pin: vi.fn(async () => { throw new Error('nope') }) }))
    useChat.setState({ history: [row('a', at(0))] })
    await useChat.getState().pinChat('a', true)
    expect(useChat.getState().history[0]!.pinned).toBe(false)
    expect(useChat.getState().actionError).toBeInstanceOf(Error)
  })

  it('deletes at once and tells the server', async () => {
    const api = fakeHistoryApi()
    setHistoryApi(api)
    useChat.setState({ history: [row('a', at(0)), row('b', at(0))] })
    await useChat.getState().deleteChat('a')
    expect(useChat.getState().history.map((h) => h.jobId)).toEqual(['b'])
    expect(api.remove).toHaveBeenCalledWith('a')
  })

  it('brings the chat back and reports an error when the delete fails', async () => {
    setHistoryApi(fakeHistoryApi({ remove: vi.fn(async () => { throw new Error('nope') }) }))
    useChat.setState({ history: [row('a', at(0)), row('b', at(0))] })
    await useChat.getState().deleteChat('a')
    expect(useChat.getState().history.map((h) => h.jobId)).toEqual(['a', 'b'])
    expect(useChat.getState().actionError).toBeInstanceOf(Error)
  })

  it('deleting the chat that is open leaves a fresh, empty chat', async () => {
    setHistoryApi(fakeHistoryApi())
    useChat.setState({
      history: [row('open', at(0))], jobId: 'open', projectId: 'p1', canFollowUp: true,
      messages: [{ id: 'u', role: 'user', text: 'hi', attachments: [] }],
    })
    await useChat.getState().deleteChat('open')
    const s = useChat.getState()
    expect(s.jobId).toBeNull()
    expect(s.messages).toEqual([])
    expect(s.canFollowUp).toBe(false)
  })

  it('deleting another chat leaves the open one alone', async () => {
    setHistoryApi(fakeHistoryApi())
    useChat.setState({ history: [row('open', at(0)), row('other', at(0))], jobId: 'open', canFollowUp: true })
    await useChat.getState().deleteChat('other')
    expect(useChat.getState().jobId).toBe('open')
    expect(useChat.getState().canFollowUp).toBe(true)
  })
})
