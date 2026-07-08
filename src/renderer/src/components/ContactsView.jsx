import { useMemo, useState } from 'react'

function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  )
}

// Compact inline icons keep the app dependency-free.
const ICONS = {
  phone: 'M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.57 3.6a1 1 0 0 1-.25 1z',
  email: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm8 7L4.5 6.3M12 11l7.5-4.7',
  github:
    'M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.26-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.39.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z',
  linkedin:
    'M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.29-.02-2.94-1.8-2.94-1.8 0-2.07 1.4-2.07 2.85V21h-4z'
}

function Icon({ name }) {
  const filled = name === 'github' || name === 'linkedin'
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d={ICONS[name]}
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={filled ? 0 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function actionsFor(contact) {
  const actions = []
  if (contact.phone) actions.push({ key: 'phone', label: 'Call', href: `tel:${contact.phone.replace(/\s+/g, '')}` })
  if (contact.email) actions.push({ key: 'email', label: 'Email', href: `mailto:${contact.email}` })
  if (contact.github) actions.push({ key: 'github', label: 'GitHub', href: contact.github })
  if (contact.linkedin) actions.push({ key: 'linkedin', label: 'LinkedIn', href: contact.linkedin })
  return actions
}

export default function ContactsView({ contacts, onDelete }) {
  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) =>
      [c.fullName, c.email, c.phone, c.github, c.linkedin, c.portfolio]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q))
    )
  }, [contacts, query])

  return (
    <section className="contacts">
      <div className="contacts__header">
        <h1 className="view__title">Contacts</h1>
        <input
          className="contacts__search field__input"
          type="search"
          placeholder="Search contacts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {contacts.length === 0 ? (
        <p className="contacts__empty">
          No contacts yet. Share profiles via QR or a nearby device to add them here.
        </p>
      ) : filtered.length === 0 ? (
        <p className="contacts__empty">No contacts match “{query}”.</p>
      ) : (
        <ul className="contacts__list">
          {filtered.map((contact) => (
            <li className="contact-card" key={contact.id}>
              <div className="contact-card__avatar">{initials(contact.fullName)}</div>

              <div className="contact-card__body">
                <div className="contact-card__name">{contact.fullName}</div>
                <div className="contact-card__actions">
                  {actionsFor(contact).map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      className="contact-card__action"
                      title={action.label}
                      aria-label={`${action.label} ${contact.fullName}`}
                      onClick={() => window.api.openExternal(action.href)}
                    >
                      <Icon name={action.key} />
                    </button>
                  ))}
                </div>
              </div>

              {pendingDelete === contact.id ? (
                <div className="contact-card__confirm">
                  <span>Delete?</span>
                  <button
                    type="button"
                    className="btn btn--link contact-card__confirm-yes"
                    onClick={() => {
                      onDelete(contact.id)
                      setPendingDelete(null)
                    }}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="btn btn--link"
                    onClick={() => setPendingDelete(null)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="contact-card__delete"
                  aria-label={`Delete ${contact.fullName}`}
                  title="Delete contact"
                  onClick={() => setPendingDelete(contact.id)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
