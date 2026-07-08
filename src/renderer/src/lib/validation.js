// Lightweight client-side validators. All fields except name are optional, so
// each URL/email check only runs when the field is non-empty.

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function isValidUrl(value) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// Returns an object of { fieldName: message } for every invalid field.
export function validateProfile(profile) {
  const errors = {}

  if (!profile.fullName || !profile.fullName.trim()) {
    errors.fullName = 'Name is required.'
  }

  if (profile.email && profile.email.trim() && !isValidEmail(profile.email)) {
    errors.email = 'Enter a valid email address.'
  }

  const urlFields = {
    github: 'Enter a valid URL (https://…).',
    linkedin: 'Enter a valid URL (https://…).',
    portfolio: 'Enter a valid URL (https://…).'
  }
  for (const [field, message] of Object.entries(urlFields)) {
    if (profile[field] && profile[field].trim() && !isValidUrl(profile[field])) {
      errors[field] = message
    }
  }

  return errors
}
