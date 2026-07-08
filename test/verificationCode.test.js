import { describe, it, expect } from 'vitest'
import { verificationCode } from '../src/renderer/src/lib/verificationCode.js'

describe('verificationCode', () => {
  it('produces a two-word, space-separated code', () => {
    const code = verificationCode('device-a', 'device-b')
    const words = code.split(' ')
    expect(words).toHaveLength(2)
    expect(words[0]).toMatch(/^[A-Z][a-z]+$/)
    expect(words[1]).toMatch(/^[A-Z][a-z]+$/)
  })

  it('is symmetric — both devices derive the same code regardless of order', () => {
    expect(verificationCode('device-a', 'device-b')).toBe(verificationCode('device-b', 'device-a'))
  })

  it('is deterministic — same inputs always give the same code', () => {
    const a = '6f1e-aaaa'
    const b = '9c22-bbbb'
    expect(verificationCode(a, b)).toBe(verificationCode(a, b))
  })

  it('differs for different id pairs (catches a spoofed peer)', () => {
    const genuine = verificationCode('device-a', 'device-b')
    const spoofed = verificationCode('device-a', 'device-EVIL')
    expect(genuine).not.toBe(spoofed)
  })

  it('never returns two identical words', () => {
    // Exercise many pairs; the second-word collision guard must always hold.
    for (let i = 0; i < 500; i++) {
      const code = verificationCode(`id-${i}`, `peer-${i * 7 + 3}`)
      const [first, second] = code.split(' ')
      expect(first).not.toBe(second)
    }
  })

  it('handles nullish / empty ids without throwing', () => {
    expect(() => verificationCode(null, undefined)).not.toThrow()
    const code = verificationCode(null, undefined)
    expect(code.split(' ')).toHaveLength(2)
  })

  it('draws both words from the known word list', () => {
    const KNOWN = new Set([
      'Amber', 'Anchor', 'Apple', 'Arrow', 'Aspen', 'Badge', 'Basil', 'Beacon',
      'Birch', 'Bison', 'Bloom', 'Boulder', 'Bramble', 'Breeze', 'Cedar', 'Cirrus',
      'Cobalt', 'Comet', 'Coral', 'Cove', 'Crest', 'Delta', 'Dune', 'Ember',
      'Fable', 'Falcon', 'Fern', 'Flint', 'Garnet', 'Glade', 'Harbor', 'Hazel',
      'Heron', 'Indigo', 'Ivory', 'Jasper', 'Kelp', 'Lagoon', 'Lark', 'Lotus',
      'Maple', 'Meadow', 'Mesa', 'Nimbus', 'Onyx', 'Opal', 'Orchid', 'Otter',
      'Pebble', 'Pine', 'Quartz', 'Raven', 'Reef', 'Ridge', 'River', 'Sable',
      'Slate', 'Sparrow', 'Spruce', 'Tundra', 'Umber', 'Valley', 'Willow', 'Zephyr'
    ])
    for (let i = 0; i < 200; i++) {
      const [first, second] = verificationCode(`x${i}`, `y${i}`).split(' ')
      expect(KNOWN.has(first)).toBe(true)
      expect(KNOWN.has(second)).toBe(true)
    }
  })
})
