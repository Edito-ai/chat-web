import { describe, expect, it } from 'vitest'
import { kindOf, listArtifacts, versionsOf } from '../artifacts'
import { newAssistant } from '../chatState'
import type { ChatAssistantMessage } from '../chatTypes'

const done = (id: string, turn: number): ChatAssistantMessage => ({
  ...newAssistant(id, 'j1', turn), status: 'complete', result: { videoUrl: `v${turn}`, downloadUrl: null, fileName: null },
})

describe('what goes in the side panel', () => {
  it('numbers finished videos v1, v2 in order', () => {
    const list = listArtifacts([done('a', 1), done('b', 2)])
    expect(list.map((a) => [a.id, a.kind, a.version])).toEqual([['a', 'video', 1], ['b', 'video', 2]])
    expect(versionsOf(list, 'video')).toHaveLength(2)
  })

  it('a choice waiting for the person wins over a finished video', () => {
    const m = { ...done('a', 1), lookChoice: { open: true, secondsLeft: 9, seconds: 9, receivedAt: 0, options: [] } }
    expect(kindOf(m)).toBe('look')
  })

  it('a plain reply and a running turn without sheets put nothing in the panel', () => {
    expect(kindOf({ ...newAssistant('a', 'j1'), status: 'complete', kind: 'chat' })).toBeNull()
    expect(kindOf(newAssistant('b', 'j1'))).toBeNull()
  })

  it('a clips chat is a clips thing', () => {
    expect(kindOf({ ...newAssistant('a', 'j1'), status: 'complete', kind: 'clips' })).toBe('clips')
  })
})
