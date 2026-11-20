import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toFramesReview, toLivePlayer } from '../chatApi'
import { newAssistant } from '../chatState'
import { FramesReview } from '../FramesReview'
import { isSlow, megabytes, readPlayerEvent, startMode } from '../liveRules'
import type { ChatAssistantMessage } from '../chatTypes'

const frames = [{ n: 1, t: 1.5, template: 'talk', imageUrl: 'http://x/files/j/review/01.jpg' }]
const player = { url: 'http://x/player/index.html?src=http%3A%2F%2Fx%2Ffiles%2Fj%2Fweb%2F&cut=1&v=7', version: '7', bytes: 12_400_000 }

describe('toLivePlayer', () => {
  it('reads the page, its version and size', () => {
    expect(toLivePlayer(player)).toEqual(player)
    expect(toFramesReview({ open: true, frames, player })?.player?.version).toBe('7')
  })

  it('refuses anything that is not an http(s) page, and is null when absent', () => {
    expect(toLivePlayer({ url: 'javascript:alert(1)' })).toBeNull()
    expect(toLivePlayer({ url: 'data:text/html,hi' })).toBeNull()
    expect(toLivePlayer(null)).toBeNull()
    expect(toFramesReview({ open: true, frames })?.player).toBeNull()
  })
})

describe('startMode', () => {
  it('loads by itself unless memory is low or data saver is on', () => {
    expect(startMode(undefined)).toBe('auto')
    expect(startMode({})).toBe('auto') // Safari / Firefox: unknown memory, the frame-rate check decides
    expect(startMode({ deviceMemory: 8 })).toBe('auto')
    expect(startMode({ deviceMemory: 4 })).toBe('auto')
    expect(startMode({ deviceMemory: 2 })).toBe('ask')
    expect(startMode({ deviceMemory: 8, connection: { saveData: true } })).toBe('ask')
  })
})

describe('isSlow', () => {
  it('is slow well under the frame rate, or after several stalls', () => {
    expect(isSlow({ fps: 29, target: 30, stalls: 0 })).toBe(false)
    expect(isSlow({ fps: 19, target: 30, stalls: 0 })).toBe(false)
    expect(isSlow({ fps: 17, target: 30, stalls: 0 })).toBe(true)
    expect(isSlow({ fps: 28, target: 30, stalls: 3 })).toBe(true)
  })
})

describe('readPlayerEvent', () => {
  it('only takes the player page messages, cleaned', () => {
    expect(readPlayerEvent({ source: 'b2-player', type: 'loading', progress: 7 })).toEqual({ type: 'loading', progress: 1 })
    expect(readPlayerEvent({ source: 'b2-player', type: 'perf', fps: 24, target: 30, stalls: 0 })).toEqual({ type: 'perf', fps: 24, target: 30, stalls: 0 })
    expect(readPlayerEvent({ source: 'other', type: 'ready' })).toBeNull()
    expect(readPlayerEvent({ source: 'b2-player', type: 'nope' })).toBeNull()
    expect(readPlayerEvent('b2-player')).toBeNull()
  })

  it('says the size in MB', () => {
    expect(megabytes(12_400_000)).toBe('12 MB')
    expect(megabytes(10)).toBe('1 MB')
  })
})

describe('FramesReview with a live preview', () => {
  it('keeps the frames, and holds a place for the player until the device is checked', () => {
    const msg = { ...newAssistant('a', 'j', 1), framesReview: toFramesReview({ open: true, frames, player }, Date.now()) } as ChatAssistantMessage
    const html = renderToStaticMarkup(createElement(FramesReview, { msg }))
    expect(html).toContain('data-testid="chat-live-preview-pending"')
    expect(html).toContain('data-testid="chat-frame-1"')
    expect(html).toContain('data-testid="chat-frames-render"')
  })

  it('shows no player place without a player', () => {
    const msg = { ...newAssistant('a', 'j', 1), framesReview: toFramesReview({ open: true, frames }, Date.now()) } as ChatAssistantMessage
    expect(renderToStaticMarkup(createElement(FramesReview, { msg }))).not.toContain('chat-live-preview')
  })
})
