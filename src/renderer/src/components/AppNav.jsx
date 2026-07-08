// Top navigation between the two main screens.
export default function AppNav({ current, contactCount, onNavigate }) {
  return (
    <nav className="nav">
      <button
        type="button"
        className={current === 'saved' ? 'nav__tab nav__tab--active' : 'nav__tab'}
        onClick={() => onNavigate('saved')}
      >
        My Profile
      </button>
      <button
        type="button"
        className={current === 'contacts' ? 'nav__tab nav__tab--active' : 'nav__tab'}
        onClick={() => onNavigate('contacts')}
      >
        Contacts
        {contactCount > 0 && <span className="nav__badge">{contactCount}</span>}
      </button>
    </nav>
  )
}
