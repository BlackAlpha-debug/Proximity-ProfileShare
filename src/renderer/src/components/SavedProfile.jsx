const LINKS = [
  { name: 'phone', label: 'Phone' },
  { name: 'email', label: 'Email' },
  { name: 'github', label: 'GitHub' },
  { name: 'linkedin', label: 'LinkedIn' },
  { name: 'portfolio', label: 'Portfolio' }
]

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export default function SavedProfile({ profile, photoPreview, onShare, onScan, onEdit }) {
  return (
    <div className="card saved">
      <div className="saved__badge">✓ Profile saved</div>

      <div className="saved__avatar">
        {photoPreview ? (
          <img src={photoPreview} alt={profile.fullName} />
        ) : (
          <span>{initials(profile.fullName) || '?'}</span>
        )}
      </div>

      <h1 className="saved__name">{profile.fullName}</h1>

      <dl className="saved__details">
        {LINKS.filter((item) => profile[item.name]).map((item) => (
          <div className="saved__row" key={item.name}>
            <dt>{item.label}</dt>
            <dd>{profile[item.name]}</dd>
          </div>
        ))}
      </dl>

      <div className="saved__actions">
        <button type="button" className="btn btn--primary" onClick={onShare}>
          Share my profile
        </button>
        <button type="button" className="btn btn--ghost" onClick={onScan}>
          Scan a code
        </button>
      </div>
      <button type="button" className="btn btn--link" onClick={onEdit}>
        Edit profile
      </button>
    </div>
  )
}
