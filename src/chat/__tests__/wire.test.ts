import { describe, expect, it } from 'vitest'
import { toSnapshot } from '../chatApi'
import { audioPresence } from '../probe'
import { shapeFor } from '../projectShape'

describe('toSnapshot (ChatJobOut -> snapshot)', () => {
  it('maps a running job and uses state as the stage key', () => {
    expect(toSnapshot({ id: 'j', state: 'rendering', progress: 0.7, message: 'Rendering', turn: 2 })).toMatchObject({
      jobId: 'j', status: 'running', stage: 'rendering', progress: 0.7, message: 'Rendering', turn: 2, result: null,
    })
  })

  it('treats queued as queued and unknown states as running', () => {
    expect(toSnapshot({ id: 'j', state: 'queued' }).status).toBe('queued')
    expect(toSnapshot({ id: 'j', state: 'something_new' }).status).toBe('running')
  })

  it('a complete job carries preview, download and file name', () => {
    expect(
      toSnapshot({ id: 'j', state: 'complete', previewUrl: 'p', downloadUrl: 'd', downloadFilename: 'My video.mp4', canFollowUp: true, reply: 'Done' }),
    ).toMatchObject({ status: 'complete', stage: null, canFollowUp: true, reply: 'Done', result: { videoUrl: 'p', downloadUrl: 'd', fileName: 'My video.mp4' } })
  })

  it('a complete job without any URL has no result (the state layer turns that into a failure)', () => {
    expect(toSnapshot({ id: 'j', state: 'complete' }).result).toBeNull()
  })

  it('failed and cancelled are terminal', () => {
    expect(toSnapshot({ id: 'j', state: 'failed', error: 'boom' })).toMatchObject({ status: 'failed', error: 'boom' })
    expect(toSnapshot({ id: 'j', state: 'cancelled' }).status).toBe('cancelled')
  })
})

describe('shapeFor (project follows the source orientation)', () => {
  it('portrait -> 1080x1920', () => expect(shapeFor(1080, 1920)).toMatchObject({ width: 1080, height: 1920, aspect: '9:16' }))
  it('landscape -> 1920x1080', () => expect(shapeFor(3840, 2160)).toMatchObject({ width: 1920, height: 1080, aspect: '16:9' }))
  it('square -> 1080x1080', () => expect(shapeFor(1000, 1000)).toMatchObject({ width: 1080, height: 1080, aspect: '1:1' }))
  it('near-square still counts as square', () => expect(shapeFor(1020, 1000).aspect).toBe('1:1'))
  it('unknown size falls back to landscape', () => {
    expect(shapeFor(null, null).aspect).toBe('16:9')
    expect(shapeFor(0, 0).aspect).toBe('16:9')
  })
})

describe('audioPresence (Chrome does not expose audioTracks, so absence is unknown, not silent)', () => {
  it('unknown when the browser exposes nothing', () => expect(audioPresence({})).toBeNull())
  it('true / false only from a real signal', () => {
    expect(audioPresence({ audioTracks: { length: 1 } })).toBe(true)
    expect(audioPresence({ audioTracks: { length: 0 } })).toBe(false)
    expect(audioPresence({ mozHasAudio: true })).toBe(true)
    expect(audioPresence({ mozHasAudio: false })).toBe(false)
  })
})
