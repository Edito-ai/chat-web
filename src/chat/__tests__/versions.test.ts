import { describe, expect, it } from 'vitest'
import { turnResult } from '../versions'

const latest = { videoUrl: 'http://api/files/j1/v/2.mp4?v=9', downloadUrl: 'http://api/files/j1/v/2/download?v=9', fileName: 'a.mp4' }

describe('each turn plays its own video', () => {
  it('points an earlier turn at its own address', () => {
    expect(turnResult(latest, 2, 1)).toEqual({ videoUrl: 'http://api/files/j1/v/1.mp4?v=9', downloadUrl: 'http://api/files/j1/v/1/download?v=9', fileName: null })
  })
  it('keeps the newest turn as it is', () => {
    expect(turnResult(latest, 2, 2)).toBe(latest)
  })
  it('gives nothing for a backend that has only one video', () => {
    expect(turnResult({ videoUrl: 'http://api/files/j1/final.mp4?v=9', downloadUrl: null, fileName: null }, 2, 1)).toBeNull()
  })
})
