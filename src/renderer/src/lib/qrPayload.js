// Compact, self-describing payload encoded directly into the QR code — no network
// or socket involved. The profile photo is deliberately never included: even a
// modest 20 KB photo produces ~27 KB of JSON, far past the QR ceiling (~2953 bytes),
// whereas the text-only card is ~230 bytes (QR version 11, easy to scan).

const TYPE = 'proximity-share'
export const QR_FIELDS = ['fullName', 'phone', 'email', 'github', 'linkedin', 'portfolio']

export function encodeProfileForQr(profile, deviceId) {
  const payload = { t: TYPE, v: 1 }
  // deviceId lets the scanner derive the shared verification code (~36 chars,
  // still well within the QR budget).
  if (deviceId) payload.deviceId = String(deviceId)
  for (const field of QR_FIELDS) {
    const value = profile?.[field]
    if (value && String(value).trim()) payload[field] = String(value).trim()
  }
  return JSON.stringify(payload)
}

// Returns a contact object for our own codes, or null for anything else
// (foreign QR codes, malformed JSON, or a card with no name).
export function decodeProfileFromQr(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || data.t !== TYPE) return null

  const contact = {}
  if (data.deviceId) contact.deviceId = String(data.deviceId)
  for (const field of QR_FIELDS) {
    if (data[field]) contact[field] = String(data[field])
  }
  if (!contact.fullName) return null
  return contact
}
