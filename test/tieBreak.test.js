import { describe, it, expect } from 'vitest'
import { tieBreakInitiator, isInitiator } from '../src/main/tieBreak.js'

describe('tieBreakInitiator', () => {
  it('returns the lexicographically smaller id', () => {
    expect(tieBreakInitiator('aaa', 'bbb')).toBe('aaa')
    expect(tieBreakInitiator('bbb', 'aaa')).toBe('aaa')
  })

  it('is symmetric — order of arguments does not change the winner', () => {
    const a = 'device-9f3c'
    const b = 'device-0a12'
    expect(tieBreakInitiator(a, b)).toBe(tieBreakInitiator(b, a))
  })

  it('coerces non-string ids before comparing', () => {
    expect(tieBreakInitiator(10, 9)).toBe('10') // '10' < '9' as strings
  })
})

describe('isInitiator', () => {
  it('is true only for the smaller id', () => {
    expect(isInitiator('aaa', 'bbb')).toBe(true)
    expect(isInitiator('bbb', 'aaa')).toBe(false)
  })

  it('yields exactly one initiator between two distinct peers', () => {
    const a = 'device-abc'
    const b = 'device-xyz'
    // From each side's own perspective, exactly one considers itself initiator.
    expect(isInitiator(a, b) !== isInitiator(b, a)).toBe(true)
  })

  it('never makes both sides initiators, and never both accepters', () => {
    const ids = ['0', '9', 'a', 'Z', 'device-1', 'device-2', 'ffff', '0000']
    for (const x of ids) {
      for (const y of ids) {
        if (x === y) continue
        // For any distinct pair, initiator status differs between the two views.
        expect(isInitiator(x, y)).not.toBe(isInitiator(y, x))
      }
    }
  })

  it('defensively returns false for equal ids (never two initiators)', () => {
    expect(isInitiator('same', 'same')).toBe(false)
  })

  it('the isInitiator side matches the tieBreakInitiator winner', () => {
    const a = 'device-0a12'
    const b = 'device-9f3c'
    const winner = tieBreakInitiator(a, b)
    expect(isInitiator(a, b)).toBe(a === winner)
    expect(isInitiator(b, a)).toBe(b === winner)
  })
})
