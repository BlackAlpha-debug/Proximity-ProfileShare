// Validates a "profile-payload" received over the wire before we trust it.
// Electron-free so it can be unit-tested. Returns a sanitized profile object, or
// null if the shape is invalid (missing/blank name, or any field of the wrong type).

const OPTIONAL_STRING_FIELDS = ['phone', 'email', 'github', 'linkedin', 'portfolio', 'deviceId']
const MAX_LEN = 8192 // reject absurdly long strings

export function validateProfilePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null

  // fullName is the one required field.
  if (typeof input.fullName !== 'string') return null
  const fullName = input.fullName.trim()
  if (!fullName || fullName.length > MAX_LEN) return null

  const clean = { fullName }
  for (const field of OPTIONAL_STRING_FIELDS) {
    const value = input[field]
    if (value == null) continue
    if (typeof value !== 'string' || value.length > MAX_LEN) return null
    clean[field] = value
  }
  // A remote device's photoPath is a local path meaningless (and unsafe) here —
  // it is intentionally never carried across.
  return clean
}
