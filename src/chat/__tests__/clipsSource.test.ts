import { describe, expect, it } from 'vitest'
import { toClipsSource } from '../clips'

describe('toClipsSource', () => {
  it('keeps the page link of a link chat, and only a web link', () => {
    expect(toClipsSource({ kind: 'link', title: '', durationSec: 60, url: 'https://youtu.be/abc' })?.url).toBe('https://youtu.be/abc')
    expect(toClipsSource({ kind: 'link', title: '', url: 'javascript:alert(1)' })?.url).toBeNull()
    expect(toClipsSource({ kind: 'upload', title: 'a.mp4' })?.url).toBeNull()
  })
})
