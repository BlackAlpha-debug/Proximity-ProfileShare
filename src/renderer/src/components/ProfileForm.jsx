import { useState } from 'react'
import { validateProfile } from '../lib/validation.js'

const FIELDS = [
  { name: 'fullName', label: 'Full name', type: 'text', required: true, placeholder: 'Ada Lovelace' },
  { name: 'phone', label: 'Phone number', type: 'tel', placeholder: '+1 555 010 1234' },
  { name: 'email', label: 'Email', type: 'email', placeholder: 'ada@example.com' },
  { name: 'github', label: 'GitHub URL', type: 'url', placeholder: 'https://github.com/ada' },
  { name: 'linkedin', label: 'LinkedIn URL', type: 'url', placeholder: 'https://linkedin.com/in/ada' },
  { name: 'portfolio', label: 'Portfolio / website', type: 'url', placeholder: 'https://ada.dev' }
]

function emptyProfile() {
  return {
    fullName: '',
    phone: '',
    email: '',
    github: '',
    linkedin: '',
    portfolio: '',
    photoPath: ''
  }
}

export default function ProfileForm({ initial, initialPreview, isEditing, onSave, onCancel }) {
  // Only carry known profile fields into form state — never the preview data URL.
  const [values, setValues] = useState(() => {
    const base = emptyProfile()
    if (initial) {
      for (const key of Object.keys(base)) {
        if (initial[key] != null) base[key] = initial[key]
      }
    }
    return base
  })
  const [photoPreview, setPhotoPreview] = useState(initialPreview || null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  function update(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  async function choosePhoto() {
    const result = await window.api.selectPhoto()
    if (result) {
      update('photoPath', result.path)
      setPhotoPreview(result.dataUrl)
    }
  }

  function removePhoto() {
    update('photoPath', '')
    setPhotoPreview(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = { ...values, fullName: values.fullName.trim() }
    const found = validateProfile(trimmed)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSaving(true)
    try {
      await onSave(trimmed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <h1 className="form__title">{isEditing ? 'Edit your profile' : 'Set up your profile'}</h1>
      <p className="form__subtitle">
        This is the card you'll share. Only your name is required.
      </p>

      <div className="photo-row">
        <div className="photo-preview" aria-hidden={!photoPreview}>
          {photoPreview ? (
            <img src={photoPreview} alt="Profile preview" />
          ) : (
            <span className="photo-preview__placeholder">No photo</span>
          )}
        </div>
        <div className="photo-actions">
          <button type="button" className="btn btn--ghost" onClick={choosePhoto}>
            {values.photoPath ? 'Change photo' : 'Choose photo'}
          </button>
          {values.photoPath && (
            <button type="button" className="btn btn--link" onClick={removePhoto}>
              Remove
            </button>
          )}
        </div>
      </div>

      {FIELDS.map((field) => (
        <label className="field" key={field.name}>
          <span className="field__label">
            {field.label}
            {field.required && <span className="field__req"> *</span>}
          </span>
          <input
            className={errors[field.name] ? 'field__input field__input--error' : 'field__input'}
            type={field.type}
            value={values[field.name]}
            placeholder={field.placeholder}
            onChange={(e) => update(field.name, e.target.value)}
            aria-invalid={Boolean(errors[field.name])}
          />
          {errors[field.name] && <span className="field__error">{errors[field.name]}</span>}
        </label>
      ))}

      <div className="form__actions">
        {isEditing && (
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}
