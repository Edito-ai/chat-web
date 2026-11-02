import { describe, expect, it } from 'vitest'
import { displayName, initialOf } from '../profile'

describe('profile helpers', () => {
  it('uses the name when there is one', () => {
    expect(displayName({ name: '  Shubham Kumar ', email: 'a@b.com' })).toBe('Shubham Kumar')
    expect(initialOf({ name: 'shubham', email: 'a@b.com' })).toBe('S')
  })
  it('falls back to the email local part', () => {
    expect(displayName({ name: null, email: 'iam.shubham@gmail.com' })).toBe('iam.shubham')
    expect(initialOf({ name: '', email: 'iam.shubham@gmail.com' })).toBe('I')
  })
  it('keeps a whole Devanagari grapheme', () => {
    expect(initialOf({ name: '\u0906\u0930\u0935', email: 'a@b.com' })).toBe('\u0906')
  })
  it('never returns an empty initial', () => {
    expect(initialOf({ name: null, email: '' })).toBe('?')
  })
})
