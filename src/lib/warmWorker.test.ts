// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./apiClient', () => ({ apiClient: { post: vi.fn(() => Promise.resolve({ warm: true })) } }))

import { apiClient } from './apiClient'
import { useServerWake } from './serverWake'
import { WARM_EVERY_MS, resetWarmWorker, warmWorker } from './warmWorker'

describe('warmWorker', () => {
  beforeEach(() => {
    resetWarmWorker()
    useServerWake.setState({ since: null })
    vi.mocked(apiClient.post).mockClear()
  })

  it('pings the API once, then at most every 4 minutes', () => {
    warmWorker(1_000_000)
    warmWorker(1_000_000 + 1000)
    warmWorker(1_000_000 + WARM_EVERY_MS - 1)
    expect(apiClient.post).toHaveBeenCalledTimes(1)
    expect(apiClient.post).toHaveBeenCalledWith('/chat/warm')
    warmWorker(1_000_000 + WARM_EVERY_MS)
    expect(apiClient.post).toHaveBeenCalledTimes(2)
  })

  it('stays quiet while the server is waking up', () => {
    useServerWake.setState({ since: Date.now() })
    warmWorker(5_000_000)
    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it('never throws when the ping fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('404'))
    expect(() => warmWorker(9_000_000)).not.toThrow()
    await Promise.resolve()
  })
})
