import { describe, it, expect } from 'vitest'
import { validateProfilePayload } from '../src/main/profilePayload.js'

describe('validateProfilePayload', () => {
  it('accepts a minimal payload with just a fullName', () => {
    expect(validateProfilePayload({ fullName: 'Ada Lovelace' })).toEqual({
      fullName: 'Ada Lovelace'
    })
  })

  it('trims the fullName', () => {
    expect(validateProfilePayload({ fullName: '  Ada  ' })).toEqual({ fullName: 'Ada' })
  })

  it('keeps all optional string fields when present', () => {
    const input = {
      fullName: 'Ada Lovelace',
      phone: '+1 555 0100',
      email: 'ada@example.com',
      github: 'https://github.com/ada',
      linkedin: 'https://linkedin.com/in/ada',
      portfolio: 'https://ada.dev',
      deviceId: 'device-123'
    }
    expect(validateProfilePayload(input)).toEqual(input)
  })

  it('drops unknown fields (e.g. an injected photoPath)', () => {
    const result = validateProfilePayload({
      fullName: 'Ada',
      photoPath: '/etc/passwd',
      admin: true
    })
    expect(result).toEqual({ fullName: 'Ada' })
    expect(result).not.toHaveProperty('photoPath')
    expect(result).not.toHaveProperty('admin')
  })

  it('skips optional fields that are null or undefined', () => {
    expect(validateProfilePayload({ fullName: 'Ada', phone: null, email: undefined })).toEqual({
      fullName: 'Ada'
    })
  })

  // --- rejection cases (returns null) ---

  it('rejects a missing fullName', () => {
    expect(validateProfilePayload({ phone: '555' })).toBeNull()
  })

  it('rejects a blank / whitespace-only fullName', () => {
    expect(validateProfilePayload({ fullName: '   ' })).toBeNull()
    expect(validateProfilePayload({ fullName: '' })).toBeNull()
  })

  it('rejects a non-string fullName', () => {
    expect(validateProfilePayload({ fullName: 42 })).toBeNull()
    expect(validateProfilePayload({ fullName: { toString: () => 'x' } })).toBeNull()
  })

  it('rejects an optional field of the wrong type', () => {
    expect(validateProfilePayload({ fullName: 'Ada', phone: 12345 })).toBeNull()
    expect(validateProfilePayload({ fullName: 'Ada', email: ['a@b.c'] })).toBeNull()
  })

  it('rejects absurdly long strings', () => {
    const huge = 'x'.repeat(8193)
    expect(validateProfilePayload({ fullName: huge })).toBeNull()
    expect(validateProfilePayload({ fullName: 'Ada', portfolio: huge })).toBeNull()
  })

  it('rejects non-object / array / nullish input', () => {
    expect(validateProfilePayload(null)).toBeNull()
    expect(validateProfilePayload(undefined)).toBeNull()
    expect(validateProfilePayload('Ada')).toBeNull()
    expect(validateProfilePayload(['Ada'])).toBeNull()
    expect(validateProfilePayload(42)).toBeNull()
  })
})
