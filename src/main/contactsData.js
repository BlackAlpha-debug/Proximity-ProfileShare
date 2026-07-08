import { randomUUID } from 'crypto'

// Pure helpers for the received-contacts list (electron-free, unit-tested).
// Contacts are keyed by deviceId when available (so re-sharing updates in place
// instead of duplicating); a contact without a deviceId gets a random id.

const FIELDS = ['fullName', 'phone', 'email', 'github', 'linkedin', 'portfolio', 'deviceId']

export function sanitizeContact(input) {
  if (!input || typeof input !== 'object') return null
  const clean = {}
  for (const field of FIELDS) {
    const value = input[field]
    if (typeof value === 'string' && value.trim()) clean[field] = value.trim()
  }
  if (!clean.fullName) return null
  return clean
}

// Returns { list, entry }. entry is null (and list unchanged) if the input is
// invalid. Existing entries (same id) are merged/updated, not duplicated.
export function upsertContact(list, input, now = new Date().toISOString()) {
  const clean = sanitizeContact(input)
  if (!clean) return { list: Array.isArray(list) ? list : [], entry: null }

  const arr = Array.isArray(list) ? [...list] : []
  const id = clean.deviceId || randomUUID()
  const index = arr.findIndex((c) => c.id === id)

  let entry
  if (index >= 0) {
    entry = { ...arr[index], ...clean, id, updatedAt: now }
    arr[index] = entry
  } else {
    entry = { ...clean, id, addedAt: now, updatedAt: now }
    arr.push(entry)
  }
  return { list: arr, entry }
}

export function removeContact(list, id) {
  return (Array.isArray(list) ? list : []).filter((c) => c.id !== id)
}
