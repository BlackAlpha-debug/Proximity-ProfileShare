import { useEffect, useState } from 'react'
import ProfileForm from './components/ProfileForm.jsx'
import SavedProfile from './components/SavedProfile.jsx'
import ShareView from './components/ShareView.jsx'
import ScanView from './components/ScanView.jsx'
import ContactConfirm from './components/ContactConfirm.jsx'
import PermissionsIntro from './components/PermissionsIntro.jsx'
import NearbyPeers from './components/NearbyPeers.jsx'
import HandshakeOverlay from './components/HandshakeOverlay.jsx'
import AppNav from './components/AppNav.jsx'
import ContactsView from './components/ContactsView.jsx'
import { playLaunch, playShareSuccess } from './lib/sounds.js'

// Fold a handshake-event from the main process into the overlay state.
function reduceHandshake(current, event) {
  const peer = event.peer || {}
  const name = peer.name || 'Someone'
  switch (event.type) {
    case 'outgoing-pending':
      // Don't let a pending confirmation clobber an incoming prompt or a result.
      return current?.kind === 'incoming' ? current : { kind: 'outgoing', peer }
    case 'incoming-request':
      return { kind: 'incoming', peer }
    case 'completed':
      return { kind: 'success', peer, tieBroken: Boolean(event.tieBroken) }
    case 'declined':
      return { kind: 'result', peer, title: `${name} declined`, body: null }
    case 'cancelled': {
      const title =
        event.reason === 'timeout'
          ? `No response from ${name}`
          : event.reason === 'unreachable'
            ? `Couldn’t reach ${name}`
            : 'Sharing cancelled'
      return { kind: 'result', peer, title, body: null }
    }
    case 'incoming-cancelled':
      // The other side withdrew before we answered — dismiss the prompt.
      if (current?.kind === 'incoming' && current.peer.deviceId === peer.deviceId) return null
      return current
    default:
      return current
  }
}

// view: 'loading' | 'form' | 'permissions' | 'saved' | 'share' | 'scan' | 'confirm'
export default function App() {
  const [view, setView] = useState('loading')
  const [profile, setProfile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [scannedContact, setScannedContact] = useState(null)
  const [peers, setPeers] = useState([])
  const [noPeersHint, setNoPeersHint] = useState(false)
  const [handshake, setHandshake] = useState(null)
  const [ownDeviceId, setOwnDeviceId] = useState('')
  const [toast, setToast] = useState(null)
  const [contacts, setContacts] = useState([])

  // Play the launch chime once when the app boots.
  useEffect(() => {
    playLaunch()
  }, [])

  // Our own deviceId, needed to derive the shared verification code.
  useEffect(() => {
    window.api.getDeviceId().then(setOwnDeviceId)
  }, [])

  // Load received contacts once.
  useEffect(() => {
    window.api.getContacts().then(setContacts)
  }, [])

  // Upsert a contact and refresh the list from the returned snapshot.
  function persistContact(profile) {
    window.api.saveContact(profile).then((result) => {
      if (result?.contacts) setContacts(result.contacts)
    })
  }
  async function deleteContact(id) {
    setContacts(await window.api.deleteContact(id))
  }

  // Subscribe to live peer updates once, for the app's lifetime.
  useEffect(() => {
    const unsubscribe = window.api.onPeersUpdated((data) => {
      setPeers(data.peers)
      setNoPeersHint(Boolean(data.noPeersHint))
    })
    // Pick up any peers already discovered before this listener attached.
    window.api.getPeers().then((data) => {
      setPeers(data.peers)
      setNoPeersHint(Boolean(data.noPeersHint))
    })
    return unsubscribe
  }, [])

  // Subscribe to handshake protocol events for the app's lifetime.
  useEffect(() => {
    return window.api.onHandshakeEvent((event) => {
      if (event.type === 'profile-received') {
        // A peer's card arrived over the (TLS) socket, already validated in main.
        // Per the app's model, the renderer persists it via the contacts API.
        persistContact(event.profile)
        return
      }
      if (event.type === 'error') {
        setToast('Couldn’t complete the share, please try again.')
        setHandshake(null)
        return
      }
      // A share landed (either side of the handshake) — play the success cue.
      if (event.type === 'completed') playShareSuccess()
      setHandshake((current) => reduceHandshake(current, event))
    })
  }, [])

  // Transient error toast (connection/exchange failures).
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  // Auto-dismiss a terminal result after a few seconds.
  useEffect(() => {
    if (handshake?.kind !== 'result') return
    const id = setTimeout(() => setHandshake(null), 6000)
    return () => clearTimeout(id)
  }, [handshake])

  // Start discovery once we reach the home screen (profile set + permissions done).
  // The main process is idempotent, so re-entering 'saved' won't restart it.
  useEffect(() => {
    if (view === 'saved') window.api.startDiscovery()
  }, [view])

  // On launch, load any saved profile. First launch (no profile) → onboarding form.
  // An existing profile that predates the permission explainers still sees them once.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const saved = await window.api.getProfile()
      if (cancelled) return
      if (saved) {
        setProfile(saved)
        if (saved.photoPath) {
          const preview = await window.api.readPhoto(saved.photoPath)
          if (!cancelled) setPhotoPreview(preview)
        }
        const shown = await window.api.getPermissionsShown()
        if (cancelled) return
        setView(shown ? 'saved' : 'permissions')
      } else {
        setView('form')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave(values) {
    const wasFirstTime = !profile
    const saved = await window.api.saveProfile(values)
    setProfile(saved)
    setPhotoPreview(saved.photoPath ? await window.api.readPhoto(saved.photoPath) : null)
    // Right after onboarding completes, show the one-time OS-permission explainers.
    const shown = await window.api.getPermissionsShown()
    setView(wasFirstTime && !shown ? 'permissions' : 'saved')
  }

  async function finishPermissions() {
    await window.api.markPermissionsShown()
    setView('saved')
  }

  function handleScanned(contact) {
    setScannedContact(contact)
    setView('confirm')
  }

  // Persist the scanned contact on Accept; navigation waits for the ceremony's
  // success hold (finishScanned) so the "Profiles shared" state is actually seen.
  function acceptScanned() {
    if (scannedContact) {
      persistContact(scannedContact)
      playShareSuccess()
    }
  }
  function finishScanned() {
    setScannedContact(null)
    setView('saved')
  }

  // ---- Handshake handlers ----
  function selectPeer(peer) {
    setHandshake({ kind: 'outgoing', peer })
    window.api.requestShare(peer)
  }
  function acceptShare() {
    if (handshake?.peer) window.api.acceptShare(handshake.peer.deviceId) // 'completed' arrives next
  }
  function declineShare() {
    if (handshake?.peer) window.api.declineShare(handshake.peer.deviceId)
    setHandshake(null)
  }
  function cancelShare() {
    if (handshake?.peer) window.api.cancelShare(handshake.peer.deviceId)
    setHandshake(null)
  }

  const busyDeviceId = handshake?.kind === 'outgoing' ? handshake.peer.deviceId : null

  function renderView() {
    if (view === 'loading') {
      return (
        <main className="app app--center">
          <p className="muted">Loading…</p>
        </main>
      )
    }

    if (view === 'form') {
      return (
        <main className="app">
          <ProfileForm
            initial={profile}
            initialPreview={photoPreview}
            isEditing={Boolean(profile)}
            onSave={handleSave}
            onCancel={() => setView('saved')}
          />
        </main>
      )
    }

    if (view === 'permissions') {
      return (
        <main className="app">
          <PermissionsIntro platform={window.api.platform} onDone={finishPermissions} />
        </main>
      )
    }

    if (view === 'share') {
      return (
        <main className="app">
          <ShareView profile={profile} onBack={() => setView('saved')} />
        </main>
      )
    }

    if (view === 'scan') {
      return (
        <main className="app">
          <ScanView
            platform={window.api.platform}
            onScan={handleScanned}
            onBack={() => setView('saved')}
          />
        </main>
      )
    }

    if (view === 'confirm') {
      return (
        <main className="app">
          <ContactConfirm
            contact={scannedContact}
            ownDeviceId={ownDeviceId}
            onAccept={acceptScanned}
            onDecline={finishScanned}
            onDone={finishScanned}
          />
        </main>
      )
    }

    if (view === 'contacts') {
      return (
        <main className="app app--home">
          <AppNav current="contacts" contactCount={contacts.length} onNavigate={setView} />
          <ContactsView contacts={contacts} onDelete={deleteContact} onNavigate={setView} />
        </main>
      )
    }

    return (
      <main className="app app--home">
        <AppNav current="saved" contactCount={contacts.length} onNavigate={setView} />
        <SavedProfile
          profile={profile}
          photoPreview={photoPreview}
          onShare={() => setView('share')}
          onScan={() => setView('scan')}
          onEdit={() => setView('form')}
        />
        <NearbyPeers
          peers={peers}
          noPeersHint={noPeersHint}
          onSelect={selectPeer}
          busyDeviceId={busyDeviceId}
        />
      </main>
    )
  }

  return (
    <>
      {renderView()}
      <HandshakeOverlay
        state={handshake}
        ownDeviceId={ownDeviceId}
        onAccept={acceptShare}
        onDecline={declineShare}
        onCancel={cancelShare}
        onDismiss={() => setHandshake(null)}
      />
      {toast && (
        <div className="toast" role="alert">
          {toast}
        </div>
      )}
    </>
  )
}
