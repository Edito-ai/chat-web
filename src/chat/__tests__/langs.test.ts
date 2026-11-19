import { describe, expect, it } from 'vitest'
import { checkLanguage, editDistance } from '../langs'

const known = ['Hindi', 'English', 'Hinglish', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Spanish', 'Malayalam']

describe('typed caption language', () => {
  it('accepts a known name in any case', () => {
    expect(checkLanguage('  marathi ', known)).toEqual({ kind: 'ok', name: 'Marathi' })
    expect(checkLanguage('HINGLISH', known)).toEqual({ kind: 'ok', name: 'Hinglish' })
  })

  it('asks "did you mean" for a near miss', () => {
    expect(checkLanguage('Marathii', known)).toMatchObject({ kind: 'suggest', name: 'Marathi' })
    expect(checkLanguage('tamill', known)).toMatchObject({ kind: 'suggest', name: 'Tamil' })
    expect(checkLanguage('hindhi', known)).toMatchObject({ kind: 'suggest', name: 'Hindi' })
    expect(checkLanguage('Benga', known)).toMatchObject({ kind: 'suggest', name: 'Bengali' })
  })

  it('says it does not know a far-off word and offers the closest names', () => {
    const c = checkLanguage('Klingon', known)
    expect(c.kind).toBe('unknown')
    expect(c.kind === 'unknown' && c.closest).toHaveLength(3)
    expect(checkLanguage('   ', known)).toEqual({ kind: 'empty' })
  })

  it('counts edits', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('', 'abc')).toBe(3)
  })
})
